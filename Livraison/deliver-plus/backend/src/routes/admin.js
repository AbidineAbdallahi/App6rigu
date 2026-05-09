const express = require('express');
const User   = require('../models/User');
const Driver = require('../models/Driver');
const Order  = require('../models/Order');
const { requireAdmin, requireAgent } = require('../middleware/auth');

const router = express.Router();

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Routes accessibles agents + admin ───────────────────────────────────────

// GET /api/admin/dashboard
router.get('/dashboard', requireAgent, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [totalDrivers, activeDrivers, todayOrders, pendingOrders, deliveredToday] =
      await Promise.all([
        Driver.countDocuments(),
        Driver.countDocuments({ status: 'actif' }),
        Order.countDocuments({ createdAt: { $gte: today } }),
        Order.countDocuments({ status: 'en_attente' }),
        Order.countDocuments({ status: 'livre', updatedAt: { $gte: today } }),
      ]);
    const rev = req.user.role === 'admin'
      ? await Order.aggregate([
          { $match: { status: 'livre', updatedAt: { $gte: today } } },
          { $group: { _id: null, total: { $sum: '$pricing.total' } } },
        ])
      : [];
    const [recentOrders, onlineDrivers] = await Promise.all([
      Order.find()
        .populate('client','firstName lastName phone')
        .populate({ path:'driver', populate:{ path:'user', select:'firstName lastName phone' } })
        .sort({ createdAt:-1 }).limit(10),
      Driver.find({ status: { $in:['actif','pause'] } })
        .populate('user','firstName lastName phone').limit(15),
    ]);
    res.json({ success: true,
      stats: { totalDrivers, activeDrivers, todayOrders, pendingOrders, deliveredToday, revenueToday: rev[0]?.total || 0 },
      recentOrders, onlineDrivers,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/orders — créer une commande (agent + admin)
router.post('/orders', requireAgent, async (req, res) => {
  try {
    const {
      serviceType, pickupAddress, deliveryAddress,
      price, broadcastRadius = 5, commissionPercent = 15,
    } = req.body;

    if (!serviceType || !pickupAddress?.lat || !deliveryAddress?.lat || !price) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    const commission       = Math.round(Number(price) * commissionPercent / 100);
    const minSoldeRequired = commission;

    const order = await Order.create({
      client: req.user._id,
      serviceType,
      pickupAddress,
      deliveryAddress,
      pricing: {
        subtotal: 0,
        deliveryFee: Number(price),
        total: Number(price),
        commission,
        driverEarning: 0,
        commissionPercent,
        minSoldeRequired,
      },
      broadcastRadius,
      status: 'en_attente',
    });

    const io = req.app.get('io');

    const allActive = await Driver.find({ status: 'actif', currentOrder: null })
      .populate('user', 'firstName lastName');

    console.log(`\n📡 DIFFUSION COMMANDE ${order._id}`);
    console.log(`   Livreurs actifs en BD : ${allActive.length}`);
    allActive.forEach(d => {
      const dist = d.currentLocation?.lat
        ? haversine(pickupAddress.lat, pickupAddress.lng, d.currentLocation.lat, d.currentLocation.lng).toFixed(2)
        : '??';
      console.log(`   - ${d.user?.firstName} ${d.user?.lastName} | solde:${d.solde} | dist:${dist}km`);
    });

    const nearby = allActive.filter(d => {
      if (!d.currentLocation?.lat) return false;
      const dist = haversine(pickupAddress.lat, pickupAddress.lng,
                             d.currentLocation.lat, d.currentLocation.lng);
      return dist <= broadcastRadius;
    });

    console.log(`   Dans le rayon (${broadcastRadius}km) : ${nearby.length} livreur(s)`);

    if (nearby.length > 0) {
      order.status          = 'diffuse';
      order.notifiedDrivers = nearby.map(d => d._id);
      await order.save();

      nearby.forEach(d => {
        const dist = haversine(pickupAddress.lat, pickupAddress.lng,
                               d.currentLocation.lat, d.currentLocation.lng);
        io.to(`driver_${d._id}`).emit('new_order_nearby', {
          order:            order.toObject(),
          distance:         dist.toFixed(1),
          minSoldeRequired,
          driverSolde:      d.solde,
          canAccept:        d.solde >= minSoldeRequired,
        });
      });

      io.to('staff').emit('order_broadcasted', {
        order:              order.toObject(),
        nearbyDriversCount: nearby.length,
        driversNotified:    nearby.map(d => ({
          id:       d._id,
          name:     `${d.user?.firstName} ${d.user?.lastName}`,
          distance: haversine(pickupAddress.lat, pickupAddress.lng,
                              d.currentLocation.lat, d.currentLocation.lng).toFixed(1),
          solde:    d.solde,
        })),
      });

      setTimeout(async () => {
        try {
          const fresh = await Order.findById(order._id);
          if (fresh && fresh.status === 'diffuse') {
            fresh.status = 'en_attente';
            await fresh.save();
            fresh.notifiedDrivers.forEach(dId => {
              io.to(`driver_${dId}`).emit('order_expired', { orderId: order._id });
            });
            io.to('staff').emit('order_broadcast_expired', {
              orderId: order._id,
              message: 'Aucun livreur n\'a accepté dans les 20 secondes',
            });
          }
        } catch (e) { console.error('Erreur timer 20s:', e.message); }
      }, 20000);

    } else {
      await order.save();
      io.to('staff').emit('new_order', { order: order.toObject(), nearbyDriversCount: 0 });
    }

    res.status(201).json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Routes admin uniquement ──────────────────────────────────────────────────

// POST /api/admin/agents — créer un compte agent
router.post('/agents', requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;
    if (!firstName || !lastName || !email || !phone || !password)
      return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
    if (await User.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    const user = await User.create({ firstName, lastName, email, phone, password, role: 'agent' });
    res.status(201).json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/drivers — créer un compte livreur
router.post('/drivers', requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, zone, vehicleType, services } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    const user   = await User.create({ firstName, lastName, email, phone, password, role: 'driver' });
    const driver = await Driver.create({ user: user._id, zone, vehicleType: vehicleType || 'moto',
      services: services || ['nourriture','courses','colis','pharmacie'] });
    res.status(201).json({ success: true, user, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/drivers/:id
router.patch('/drivers/:id', requireAdmin, async (req, res) => {
  try {
    const { status, zone, services, vehicleType, motif } = req.body;
    const update = {};
    if (status)      update.status      = status;
    if (zone)        update.zone        = zone;
    if (services)    update.services    = services;
    if (vehicleType) update.vehicleType = vehicleType;

    const driver = await Driver.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });

    if (status === 'suspendu') {
      await User.findByIdAndUpdate(driver.user, { isActive: false });
      req.app.get('io').to(`driver_${driver._id}`).emit('account_suspended', {
        message: motif || 'Votre compte a été suspendu par l\'administrateur.',
      });
    }
    if (status === 'actif' || status === 'hors_ligne') {
      await User.findByIdAndUpdate(driver.user, { isActive: true });
      req.app.get('io').to(`driver_${driver._id}`).emit('account_reactivated', {
        message: motif || 'Votre compte a été réactivé.',
      });
    }

    req.app.get('io').to('staff').emit('driver_status_update', { driverId: driver._id, status });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/drivers/:id/solde
router.get('/drivers/:id/solde', requireAdmin, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate('user','firstName lastName')
      .select('solde transactions stats user');
    if (!driver) return res.status(404).json({ success:false, message:'Livreur introuvable' });
    res.json({ success:true, solde: driver.solde, transactions: driver.transactions.slice(-30), stats: driver.stats });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// POST /api/admin/drivers/:id/solde
router.post('/drivers/:id/solde', requireAdmin, async (req, res) => {
  try {
    const { type, montant, motif } = req.body;
    if (!['credit','debit'].includes(type))
      return res.status(400).json({ success:false, message:'Type invalide' });
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success:false, message:'Livreur introuvable' });
    if (type === 'credit') driver.solde += Number(montant);
    else driver.solde = Math.max(0, driver.solde - Number(montant));
    driver.transactions.push({ type, montant: Number(montant), motif: motif || 'Ajustement admin' });
    await driver.save();
    req.app.get('io').to(`driver_${driver._id}`).emit('solde_updated', {
      solde: driver.solde,
      message: `Solde mis à jour : ${type === 'credit' ? '+' : '-'}${montant} MRU`,
    });
    res.json({ success:true, solde: driver.solde });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// GET /api/admin/stats/drivers
router.get('/stats/drivers', requireAdmin, async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    const from = new Date();
    if (period === 'week') from.setDate(from.getDate() - 7);
    else if (period === 'month') from.setMonth(from.getMonth() - 1);
    else from.setFullYear(from.getFullYear() - 1);
    const stats = await Order.aggregate([
      { $match: { status:'livre', createdAt:{ $gte: from } } },
      { $group: { _id:'$driver', deliveries:{ $sum:1 }, earnings:{ $sum:'$pricing.deliveryFee' }, avgRating:{ $avg:'$rating.score' } } },
      { $lookup: { from:'drivers', localField:'_id', foreignField:'_id', as:'driver' } }, { $unwind:'$driver' },
      { $lookup: { from:'users', localField:'driver.user', foreignField:'_id', as:'user' } }, { $unwind:'$user' },
      { $sort: { deliveries:-1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Livreurs en attente d'approbation ───────────────────────────────────────

// GET /api/admin/drivers/pending?status=en_attente|approuve|rejete|all
router.get('/drivers/pending', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = (!status || status === 'all')
      ? {}
      : { approvalStatus: status };
    // Sans param → seulement en_attente (pour le badge dans le Layout)
    const query = !status ? { approvalStatus: 'en_attente' } : filter;
    const drivers = await Driver.find(query)
      .populate('user', 'firstName lastName email phone createdAt isActive')
      .sort({ createdAt: -1 });
    res.json({ success: true, drivers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/drivers/:id/request-documents
router.patch('/drivers/:id/request-documents', requireAdmin, async (req, res) => {
  try {
    const { missingDocuments = [], note = '' } = req.body;
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'incomplet', missingDocuments, missingInfoNote: note || null },
      { new: true }
    ).populate('user', 'firstName lastName phone');
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });

    // Activer le compte pour que le livreur puisse se connecter et compléter son dossier
    await User.findByIdAndUpdate(driver.user._id, { isActive: true });

    const msg = missingDocuments.length
      ? `Documents manquants : ${missingDocuments.join(', ')}. ${note || ''}`
      : note || 'Veuillez compléter votre dossier.';

    req.app.get('io').to(`driver_${driver._id}`).emit('documents_required', {
      missingDocuments,
      note: note || null,
      message: msg.trim(),
    });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/drivers/:id/approve
router.patch('/drivers/:id/approve', requireAdmin, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'approuve', status: 'hors_ligne', rejectionReason: null },
      { new: true }
    ).populate('user', 'firstName lastName phone');
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });
    await User.findByIdAndUpdate(driver.user._id, { isActive: true });
    req.app.get('io').to(`driver_${driver._id}`).emit('account_approved', {
      message: 'Votre compte livreur a été approuvé ! Vous pouvez maintenant vous connecter.',
    });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/drivers/:id/reject
router.patch('/drivers/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejete', rejectionReason: reason || 'Dossier incomplet ou non conforme' },
      { new: true }
    ).populate('user', 'firstName lastName phone');
    if (!driver) return res.status(404).json({ success: false, message: 'Livreur introuvable' });
    req.app.get('io').to(`driver_${driver._id}`).emit('account_rejected', {
      message: reason || 'Votre dossier a été refusé. Contactez l\'administrateur.',
    });
    res.json({ success: true, driver });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
