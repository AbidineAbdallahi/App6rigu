const express = require('express');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const { isReferralActive, getReferralBonus } = require('../utils/referral');
const router = express.Router();

function genReferralCode() {
  return 'AMD' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

router.get('/profile', async (req, res) => {
  // Génère le code de parrainage si manquant (pour les comptes existants)
  if (!req.user.referralCode) {
    let code, exists;
    do {
      code   = genReferralCode();
      exists = await User.exists({ referralCode: code });
    } while (exists);
    await User.findByIdAndUpdate(req.user._id, { referralCode: code });
    req.user.referralCode = code;
  }
  res.json({ success: true, user: req.user });
});

// POST /users/apply-referral — applique un code parrain après inscription
router.post('/apply-referral', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim())
      return res.status(400).json({ success: false, message: 'Code requis' });
    if (req.user.referredBy)
      return res.status(400).json({ success: false, message: 'Vous avez déjà utilisé un code de parrainage' });
    if (!await isReferralActive())
      return res.status(400).json({ success: false, message: 'Le programme de parrainage est temporairement désactivé' });

    const bonus = await getReferralBonus();
    const referrer = await User.findOne({
      referralCode: code.trim().toUpperCase(),
      _id: { $ne: req.user._id },
    });
    if (!referrer)
      return res.status(404).json({ success: false, message: 'Code de parrainage invalide' });

    await User.findByIdAndUpdate(req.user._id, {
      referredBy: referrer._id,
      $inc:       { referralCredits: bonus.client },
    });
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { referralCredits: bonus.client, referralCount: 1 },
    });

    const updatedUser = await User.findById(req.user._id);
    res.json({ success: true, creditsEarned: bonus.client, user: updatedUser });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/push-token', async (req, res) => {
  try {
    const { pushToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { pushToken: pushToken || null });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/fcm-token', async (req, res) => {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken: fcmToken || null });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Adresses favorites ───────────────────────────────────────────────────────
router.get('/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('favoriteAddresses');
    res.json({ success: true, favorites: user.favoriteAddresses || [] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/favorites', async (req, res) => {
  try {
    const { icon, name, label, lat, lng } = req.body;
    if (!name || !label || !lat || !lng)
      return res.status(400).json({ success: false, message: 'Champs manquants' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await User.findByIdAndUpdate(req.user._id, {
      $push: { favoriteAddresses: { _id: id, icon: icon || '📍', name, label, lat, lng } },
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/favorites/:id', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { favoriteAddresses: { _id: req.params.id } },
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/profile', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, req.body, { new:true });
    res.json({ success:true, user });
  } catch (err) { res.status(500).json({ success:false, message: err.message }); }
});
router.get('/', requireAdmin, async (req, res) => {
  try { res.json({ success:true, users: await User.find().sort({ createdAt:-1 }) }); }
  catch (err) { res.status(500).json({ success:false, message: err.message }); }
});

module.exports = router;
