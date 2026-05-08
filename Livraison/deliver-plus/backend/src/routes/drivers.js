const express = require('express');
const Driver = require('../models/Driver');
const Order  = require('../models/Order');
const { requireAdmin, requireDriver } = require('../middleware/auth');

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
    req.app.get('io').to('admin').emit('driver_status_update', { driverId: driver._id, status: req.body.status });
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
    io.to('admin').emit('driver_location', { driverId: driver._id, lat, lng });
    if (driver.currentOrder)
      io.to(`order_${driver.currentOrder}`).emit('driver_location', { driverId: driver._id, lat, lng });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
