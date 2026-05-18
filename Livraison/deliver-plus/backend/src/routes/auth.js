const express = require('express');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, validationResult } = require('express-validator');
const User   = require('../models/User');
const Driver = require('../models/Driver');
const { verifyToken } = require('../middleware/auth');
const { isReferralActive, getReferralBonus } = require('../utils/referral');

const router = express.Router();
const sign = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Validation numéro mauritanien : 8 chiffres, commence par 2, 3 ou 4 (hors préfixe +222)
const isValidPhone = (phone) => {
  const digits = phone.replace(/[\s\-\.]/g, '').replace(/^\+?222/, '');
  return /^[234]\d{7}$/.test(digits);
};
const PHONE_ERROR = 'Numéro invalide. Doit contenir 8 chiffres et commencer par 2, 3 ou 4.';

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

// POST /api/auth/register-client — inscription client (phone + nom + mot de passe) puis OTP
router.post('/register-client', async (req, res) => {
  try {
    const { phone, firstName, lastName, password } = req.body;
    if (!phone || !firstName || !lastName || !password)
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (6 caractères minimum)' });

    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: PHONE_ERROR });

    const existing = await User.findOne({ phone }).select('+password');
    if (existing && existing.isPhoneVerified && existing.password)
      return res.status(400).json({ success: false, message: 'Ce numéro est déjà utilisé. Connectez-vous.' });

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 120 * 1000); // 2 minutes

    if (existing) {
      existing.firstName = firstName.trim();
      existing.lastName  = lastName.trim();
      existing.password  = password;
      existing.role      = 'client';
      existing.isPhoneVerified = false;
      existing.otpCode   = otp;
      existing.otpExpiry = expiry;
      await existing.save();
    } else {
      await User.create({
        phone, firstName: firstName.trim(), lastName: lastName.trim(),
        password, role: 'client', isPhoneVerified: false,
        otpCode: otp, otpExpiry: expiry,
      });
    }

    console.log(`📱 OTP Register [${phone}] : ${otp}  (expire dans 2min)`);
    res.json({
      success: true, message: 'Code de vérification envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_otp: otp }),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/login-phone — connexion par numéro + mot de passe (client et livreur)
router.post('/login-phone', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, message: 'Numéro et mot de passe requis' });
    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: PHONE_ERROR });

    const user = await User.findOne({ phone }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Numéro ou mot de passe incorrect' });
    if (!user.isPhoneVerified)
      return res.status(403).json({ success: false, message: 'Numéro non vérifié. Utilisez "Mot de passe oublié" pour activer votre compte.' });

    if (user.role === 'driver') {
      const driverProfile = await Driver.findOne({ user: user._id });
      if (driverProfile?.approvalStatus === 'en_attente') {
        return res.status(403).json({
          success: false, approvalStatus: 'en_attente',
          message: 'Votre dossier est en cours de vérification par l\'administrateur.',
        });
      }
      if (driverProfile?.approvalStatus === 'rejete') {
        return res.status(403).json({
          success: false, approvalStatus: 'rejete',
          message: `Votre dossier a été refusé.${driverProfile.rejectionReason ? ' Motif : ' + driverProfile.rejectionReason : ''} Contactez l'administrateur.`,
        });
      }
      if (driverProfile?.approvalStatus === 'incomplet') {
        return res.json({
          success: true, token: sign(user._id), user, driverProfile,
          approvalStatus: 'incomplet',
          missingDocuments: driverProfile.missingDocuments || [],
          missingInfoNote:  driverProfile.missingInfoNote  || null,
        });
      }
      if (!user.isActive)
        return res.status(403).json({ success: false, message: 'Compte suspendu. Contactez l\'administrateur.' });
      return res.json({ success: true, token: sign(user._id), user, driverProfile });
    }

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Compte suspendu' });
    res.json({ success: true, token: sign(user._id), user, driverProfile: null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/forgot-password — envoyer OTP pour réinitialisation du mot de passe
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });
    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: PHONE_ERROR });

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ success: false, message: 'Numéro introuvable. Vérifiez le numéro saisi.' });

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 120 * 1000);

    await User.findByIdAndUpdate(user._id, { otpCode: otp, otpExpiry: expiry });
    console.log(`📱 OTP Reset [${phone}] : ${otp}  (expire dans 2min)`);

    res.json({
      success: true, message: 'Code de réinitialisation envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_otp: otp }),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/reset-password — vérifier OTP et définir nouveau mot de passe
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword)
      return res.status(400).json({ success: false, message: 'Données manquantes' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (6 caractères minimum)' });

    const user = await User.findOne({ phone }).select('+password');
    if (!user)
      return res.status(404).json({ success: false, message: 'Numéro introuvable' });
    if (!user.otpCode || user.otpCode !== otp)
      return res.status(400).json({ success: false, message: 'Code OTP incorrect' });
    if (new Date() > user.otpExpiry)
      return res.status(400).json({ success: false, message: 'Code OTP expiré (2 minutes)' });

    user.password        = newPassword;
    user.otpCode         = null;
    user.otpExpiry       = null;
    user.isPhoneVerified = true;
    await user.save();

    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    const firstName = req.body.firstName || 'Client';
    const lastName  = req.body.lastName  || 'Amder';
    if (!phone) return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });
    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: PHONE_ERROR });

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 120 * 1000); // 2 minutes

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
    console.log(`📱 OTP [${phone}] : ${otp}  (expire dans 2min)`);

    res.json({
      success: true,
      message: 'Code OTP envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_otp: otp }),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

const REFERRAL_CREDIT = 500; // MRU offerts au parrain et au filleul

function genReferralCode() {
  return 'AMD' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function genDriverReferralCode() {
  return 'DRV' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, referralCode } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Données manquantes' });

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(404).json({ success: false, message: 'Numéro introuvable' });
    if (!user.otpCode || user.otpCode !== otp)
      return res.status(400).json({ success: false, message: 'Code incorrect' });
    if (new Date() > user.otpExpiry)
      return res.status(400).json({ success: false, message: 'Code expiré (2 minutes)' });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Compte suspendu' });

    user.otpCode         = null;
    user.otpExpiry       = null;
    user.isPhoneVerified = true;

    // Génère un code de parrainage si l'utilisateur n'en a pas encore
    if (!user.referralCode) {
      let code, exists;
      do {
        code   = genReferralCode();
        exists = await User.exists({ referralCode: code });
      } while (exists);
      user.referralCode = code;
    }

    await user.save();

    // Applique le code de parrainage si fourni, pas encore utilisé, et système actif
    let creditsEarned = 0;
    if (referralCode && !user.referredBy && await isReferralActive()) {
      const bonus = await getReferralBonus();
      const referrer = await User.findOne({
        referralCode: referralCode.trim().toUpperCase(),
        _id: { $ne: user._id },
      });
      if (referrer) {
        user.referredBy      = referrer._id;
        user.referralCredits = (user.referralCredits || 0) + bonus.client;
        await user.save();

        referrer.referralCredits = (referrer.referralCredits || 0) + bonus.client;
        referrer.referralCount   = (referrer.referralCount   || 0) + 1;
        await referrer.save();

        creditsEarned = bonus.client;
      }
    }

    // Recharger l'utilisateur mis à jour
    const freshUser = await User.findById(user._id);
    res.json({ success: true, token: sign(user._id), user: freshUser, creditsEarned });
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
    const { firstName, lastName, email, phone, password, zone, vehicleType, driverType, services, referralCode, otp } = req.body;

    if (!firstName || !lastName || !phone || !password || !zone || !vehicleType)
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: PHONE_ERROR });
    if (!otp)
      return res.status(400).json({ success: false, message: 'Code OTP requis pour vérifier votre numéro de téléphone' });
    if (driverType && !['course','livraison'].includes(driverType))
      return res.status(400).json({ success: false, message: 'Type de service invalide (course ou livraison)' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (6 caractères minimum)' });
    if (email && await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });

    // Vérifier OTP via l'enregistrement temporaire créé par send-otp
    const tempUser = await User.findOne({ phone }).select('+password');
    if (!tempUser)
      return res.status(400).json({ success: false, message: 'Veuillez d\'abord vérifier votre numéro via OTP' });
    if (tempUser.password && tempUser.isPhoneVerified)
      return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé' });
    if (!tempUser.otpCode || tempUser.otpCode !== otp)
      return res.status(400).json({ success: false, message: 'Code OTP incorrect' });
    if (new Date() > tempUser.otpExpiry)
      return res.status(400).json({ success: false, message: 'Code OTP expiré (2 minutes). Renvoyez un nouveau code.' });

    // Construire les URLs des fichiers uploadés
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = (field) => {
      const f = req.files?.[field]?.[0];
      return f ? `${baseUrl}/uploads/drivers/${f.filename}` : null;
    };

    // Mettre à jour l'utilisateur temporaire en livreur
    tempUser.firstName       = firstName;
    tempUser.lastName        = lastName;
    if (email) tempUser.email = email.toLowerCase();
    tempUser.password        = password;
    tempUser.role            = 'driver';
    tempUser.isActive        = false;
    tempUser.isPhoneVerified = true;
    tempUser.otpCode         = null;
    tempUser.otpExpiry       = null;
    const user = await tempUser.save();

    // Générer un code de parrainage unique pour ce livreur
    let drvCode, codeExists;
    do {
      drvCode = genDriverReferralCode();
      codeExists = await Driver.exists({ referralCode: drvCode });
    } while (codeExists);

    // Vérifier si un code parrain a été fourni et si le système est actif
    let referrer = null;
    const referralActive = await isReferralActive();
    const bonus = await getReferralBonus();
    if (referralCode?.trim() && referralActive) {
      referrer = await Driver.findOne({ referralCode: referralCode.trim().toUpperCase() });
    }

    const driver = await Driver.create({
      user:        user._id,
      zone,
      vehicleType: vehicleType || 'moto',
      driverType:  driverType || null,
      services:    services ? JSON.parse(services) : ['nourriture','courses','colis','pharmacie'],
      status:      'hors_ligne',
      approvalStatus: 'en_attente',
      referralCode: drvCode,
      referredBy:   referrer?._id || null,
      solde:        referrer ? bonus.driver : 0, // bonus nouveau livreur
      documents: {
        photoPersonnelle: fileUrl('photoPersonnelle'),
        photoVehicule:    fileUrl('photoVehicule'),
        carteGrise:       fileUrl('carteGrise'),
        carteIdentite:    fileUrl('carteIdentite'),
        assurance:        fileUrl('assurance'),
      },
    });

    // Créditer le parrain
    if (referrer) {
      await Driver.findByIdAndUpdate(referrer._id, {
        $inc: { solde: bonus.driver, referralCount: 1 },
      });
    }

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
      creditsEarned: referrer ? REFERRAL_CREDIT : 0,
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
