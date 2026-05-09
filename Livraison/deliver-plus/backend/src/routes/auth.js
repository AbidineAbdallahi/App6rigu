const express = require('express');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, validationResult } = require('express-validator');
const User   = require('../models/User');
const Driver = require('../models/Driver');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const sign = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ─── Multer : upload documents livreur ───────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/drivers');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB par fichier
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|pdf/i.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Format non supporté (jpeg, png, pdf uniquement)'));
  },
});
const driverDocs = upload.fields([
  { name: 'photoPersonnelle', maxCount: 1 },
  { name: 'photoVehicule',    maxCount: 1 },
  { name: 'carteGrise',       maxCount: 1 },
  { name: 'carteIdentite',    maxCount: 1 },
  { name: 'assurance',        maxCount: 1 },
]);

// POST /api/auth/register
router.post('/register', [
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('email').isEmail(),
  body('phone').notEmpty(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { firstName, lastName, email, phone, password, role } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    const user = await User.create({ firstName, lastName, email, phone, password, role: role || 'client' });
    res.status(201).json({ success: true, token: sign(user._id), user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Identifiants incorrects' });

    // Vérification spécifique pour les livreurs
    if (user.role === 'driver') {
      const driverProfile = await Driver.findOne({ user: user._id });
      if (driverProfile?.approvalStatus === 'en_attente') {
        return res.status(403).json({
          success: false,
          approvalStatus: 'en_attente',
          message: 'Votre dossier est en cours de vérification par l\'administrateur. Vous serez notifié dès validation.',
        });
      }
      if (driverProfile?.approvalStatus === 'rejete') {
        return res.status(403).json({
          success: false,
          approvalStatus: 'rejete',
          message: `Votre dossier a été refusé.${driverProfile.rejectionReason ? ' Motif : ' + driverProfile.rejectionReason : ''} Contactez l'administrateur.`,
        });
      }
      // Dossier incomplet — le livreur peut se connecter pour compléter
      if (driverProfile?.approvalStatus === 'incomplet') {
        return res.json({
          success: true,
          token: sign(user._id),
          user,
          driverProfile,
          approvalStatus: 'incomplet',
          missingDocuments: driverProfile.missingDocuments || [],
          missingInfoNote:  driverProfile.missingInfoNote  || null,
        });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Compte suspendu. Contactez l\'administrateur.' });
      }
      return res.json({ success: true, token: sign(user._id), user, driverProfile });
    }

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Compte suspendu' });
    res.json({ success: true, token: sign(user._id), user, driverProfile: null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    let driverProfile = null;
    if (req.user.role === 'driver')
      driverProfile = await Driver.findOne({ user: req.user._id }).populate('currentOrder');
    res.json({ success: true, user: req.user, driverProfile });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    const firstName = req.body.firstName || 'Client';
    const lastName  = req.body.lastName  || 'Amder';
    if (!phone) return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 20 * 1000); // 20 secondes

    // Atomic upsert — évite le race condition si l'utilisateur appuie deux fois
    await User.findOneAndUpdate(
      { phone },
      {
        $set:         { otpCode: otp, otpExpiry: expiry },
        $setOnInsert: { firstName, lastName, phone, role: 'client' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Production: envoyer SMS via Twilio / Africa's Talking
    console.log(`📱 OTP [${phone}] : ${otp}  (expire dans 20s)`);

    res.json({
      success: true,
      message: 'Code OTP envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_otp: otp }),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Données manquantes' });

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ success: false, message: 'Numéro introuvable' });
    if (!user.otpCode || user.otpCode !== otp)
      return res.status(400).json({ success: false, message: 'Code incorrect' });
    if (new Date() > user.otpExpiry)
      return res.status(400).json({ success: false, message: 'Code expiré (20 secondes)' });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Compte suspendu' });

    user.otpCode   = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ success: true, token: sign(user._id), user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/register-driver
router.post('/register-driver', (req, res, next) => {
  driverDocs(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Erreur upload fichiers' });
    next();
  });
}, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, zone, vehicleType, services } = req.body;

    if (!firstName || !lastName || !phone || !password || !zone || !vehicleType)
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (6 caractères minimum)' });
    if (await User.findOne({ phone }))
      return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé' });
    if (email && await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });

    // Construire les URLs des fichiers uploadés
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = (field) => {
      const f = req.files?.[field]?.[0];
      return f ? `${baseUrl}/uploads/drivers/${f.filename}` : null;
    };

    const user = await User.create({
      firstName, lastName, phone,
      email: email ? email.toLowerCase() : undefined,
      password,
      role: 'driver',
      isActive: false, // inactif jusqu'à validation admin
    });

    const driver = await Driver.create({
      user:        user._id,
      zone,
      vehicleType: vehicleType || 'moto',
      services:    services ? JSON.parse(services) : ['nourriture','courses','colis','pharmacie'],
      status:      'hors_ligne',
      approvalStatus: 'en_attente',
      documents: {
        photoPersonnelle: fileUrl('photoPersonnelle'),
        photoVehicule:    fileUrl('photoVehicule'),
        carteGrise:       fileUrl('carteGrise'),
        carteIdentite:    fileUrl('carteIdentite'),
        assurance:        fileUrl('assurance'),
      },
    });

    // Notifier l'admin via socket
    const io = req.app.get('io');
    if (io) io.to('staff').emit('new_driver_pending', {
      driverId: driver._id,
      name: `${firstName} ${lastName}`,
      phone,
      zone,
      vehicleType,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Inscription envoyée. En attente d\'approbation de l\'administrateur.',
      token: sign(user._id),
      user,
      driverProfile: driver,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/auth/complete-dossier — livreur complète ses documents manquants
const completeDocs = upload.fields([
  { name: 'photoPersonnelle', maxCount: 1 },
  { name: 'photoVehicule',    maxCount: 1 },
  { name: 'carteGrise',       maxCount: 1 },
  { name: 'carteIdentite',    maxCount: 1 },
  { name: 'assurance',        maxCount: 1 },
]);

router.patch('/complete-dossier', verifyToken, (req, res, next) => {
  completeDocs(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Erreur upload' });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user.role !== 'driver')
      return res.status(403).json({ success: false, message: 'Accès réservé aux livreurs' });

    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver)
      return res.status(404).json({ success: false, message: 'Profil livreur introuvable' });
    if (driver.approvalStatus !== 'incomplet')
      return res.status(400).json({ success: false, message: 'Dossier non en statut incomplet' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = (field) => {
      const f = req.files?.[field]?.[0];
      return f ? `${baseUrl}/uploads/drivers/${f.filename}` : null;
    };

    // Met à jour uniquement les documents fournis (garde les existants)
    const docUpdate = {};
    ['photoPersonnelle','photoVehicule','carteGrise','carteIdentite','assurance'].forEach(key => {
      const url = fileUrl(key);
      if (url) docUpdate[`documents.${key}`] = url;
    });

    const updated = await Driver.findByIdAndUpdate(
      driver._id,
      {
        ...docUpdate,
        approvalStatus:   'en_attente',
        missingDocuments: [],
        missingInfoNote:  null,
      },
      { new: true }
    ).populate('user', 'firstName lastName phone email');

    // Retour en attente → désactiver le compte jusqu'à validation admin
    await User.findByIdAndUpdate(req.user._id, { isActive: false });

    const io = req.app.get('io');
    if (io) io.to('staff').emit('driver_dossier_updated', {
      driverId: driver._id.toString(),
      name: `${req.user.firstName} ${req.user.lastName}`,
    });

    res.json({ success: true, driverProfile: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
