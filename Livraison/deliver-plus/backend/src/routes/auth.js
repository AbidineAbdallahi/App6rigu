const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User   = require('../models/User');
const Driver = require('../models/Driver');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const sign = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

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
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Compte suspendu' });
    let driverProfile = null;
    if (user.role === 'driver') driverProfile = await Driver.findOne({ user: user._id });
    res.json({ success: true, token: sign(user._id), user, driverProfile });
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
    const { phone, firstName = 'Client', lastName = 'Amder' } = req.body;
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

module.exports = router;
