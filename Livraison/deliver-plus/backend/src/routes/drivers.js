const express = require('express');
const Driver  = require('../models/Driver');
const Order   = require('../models/Order');
const { requireAdmin, requireDriver } = require('../middleware/auth');
const { isReferralActive, getReferralBonus } = require('../utils/referral');

const router = express.Router();

// GET /api/drivers
router.get('/', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.zone)   filter.zone = req.query.zone;
    const drivers = await Driver.find(filter)
      .populate('user', 'firstName lastName email phone isActive')
      .sort({ createdAt: -1 });
    res.json({ success: true, drivers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/drivers/active — pour la carte admin
router.get('/active', async (req, res) => {
  try {
    const drivers = await Driver.find({ status: { $in: ['actif','pause'] } })
      .populate('user', 'firstName lastName phone')
      .select('user vehicleType zone status currentLocation stats currentOrder');
    res.json({ success: true, drivers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/drivers/:id
router.get('/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('currentOrder');
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/drivers/:id/stats
router.get('/:id/stats', requireAdmin, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).populate('user','firstName lastName');
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });
    const orders = await Order.find({ driver: driver._id, status: 'livre' });
    const earnings = orders.reduce((s, o) => s + (o.pricing.deliveryFee || 0), 0);
    const byService = {};
    orders.forEach(o => { byService[o.serviceType] = (byService[o.serviceType] || 0) + 1; });
    res.json({ success: true, driver, stats: { totalOrders: orders.length, earnings, byService, averageRating: driver.stats.averageRating } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/drivers/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });
    req.app.get('io').to('staff').emit('driver_status_update', { driverId: driver._id.toString(), status: req.body.status });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/drivers/:id/location
router.patch('/:id/location', requireDriver, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driver = await Driver.findByIdAndUpdate(req.params.id,
      { currentLocation: { lat, lng, updatedAt: new Date() } }, { new: true });
    const io = req.app.get('io');
    io.to('staff').emit('driver_location', { driverId: driver._id.toString(), lat, lng });
    if (driver.currentOrder)
      io.to(`order_${driver.currentOrder}`).emit('driver_location', { driverId: driver._id.toString(), lat, lng });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/drivers/apply-referral — pour les livreurs qui n'ont pas saisi de code à l'inscription
router.post('/apply-referral', requireDriver, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim())
      return res.status(400).json({ success: false, message: 'Code requis' });

    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver)
      return res.status(404).json({ success: false, message: 'Profil livreur introuvable' });
    if (driver.referredBy)
      return res.status(400).json({ success: false, message: 'Vous avez déjà utilisé un code de parrainage' });
    if (!await isReferralActive())
      return res.status(400).json({ success: false, message: 'Le programme de parrainage est temporairement désactivé' });

    const bonus = await getReferralBonus();
    const referrer = await Driver.findOne({
      referralCode: code.trim().toUpperCase(),
      _id: { $ne: driver._id },
    });
    if (!referrer)
      return res.status(404).json({ success: false, message: 'Code de parrainage invalide' });

    await Driver.findByIdAndUpdate(driver._id, {
      referredBy: referrer._id,
      $inc: { solde: bonus.driver },
    });
    await Driver.findByIdAndUpdate(referrer._id, {
      $inc: { solde: bonus.driver, referralCount: 1 },
    });

    const updatedDriver = await Driver.findById(driver._id);
    res.json({ success: true, creditsEarned: bonus.driver, driver: updatedDriver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/drivers/me — profil du livreur connecté
router.get('/me', requireDriver, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id }).populate('currentOrder');
    if (!driver) return res.status(404).json({ success: false, message: 'Profil introuvable' });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/drivers/debug — diagnostic push + statut (livreur authentifié)
router.get('/debug', requireDriver, async (req, res) => {
  try {
    const User   = require('../models/User');
    const driver = await Driver.findOne({ user: req.user._id });
    const user   = await User.findById(req.user._id).select('pushToken firstName lastName');
    if (!driver) return res.status(404).json({ success: false, message: 'Profil introuvable' });

    const pushOk = !!(user?.pushToken &&
      (user.pushToken.startsWith('ExponentPushToken') || user.pushToken.startsWith('ExpoPushToken')));

    res.json({
      success: true,
      diagnostic: {
        nom:        `${user?.firstName} ${user?.lastName}`,
        status:     driver.status,
        driverType: driver.driverType,
        location:   driver.currentLocation,
        pushToken:  user?.pushToken || null,
        pushValide: pushOk,
        currentOrder: driver.currentOrder || null,
        problemes: [
          !pushOk                       && '❌ Pas de push token valide — les notifications push ne fonctionneront pas',
          driver.status !== 'actif'     && `❌ Statut "${driver.status}" — doit être "actif" pour recevoir des courses`,
          driver.driverType === null    && '⚠️  driverType null — toutes les courses sont reçues (comportement par défaut)',
          driver.currentOrder           && '⚠️  currentOrder non nul — livreur déjà occupé',
        ].filter(Boolean),
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/drivers/debug/test-push — envoie un push de test au livreur connecté
router.post('/debug/test-push', requireDriver, async (req, res) => {
  try {
    const User = require('../models/User');
    const { sendPush } = require('../utils/push');
    const user = await User.findById(req.user._id).select('pushToken firstName');
    if (!user?.pushToken)
      return res.status(400).json({ success: false, message: 'Aucun push token enregistré pour ce livreur' });
    sendPush(user.pushToken, '🧪 Test Amder', 'Si vous lisez ceci, les push fonctionnent !', { type: 'test' });
    res.json({ success: true, message: `Push de test envoyé à ${user.pushToken}` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
