const express = require('express');
const Order  = require('../models/Order');
const Driver = require('../models/Driver');
const Tarif  = require('../models/Tarif');

const router = express.Router();

// ─── Haversine : distance GPS en km ──────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Calcul pricing + commission ─────────────────────────────────────────────
async function calcPricing(serviceType, distKm = 0, isUrgent = false) {
  const t          = await Tarif.findOne({ serviceType, isActive: true });
  const base       = t?.baseFee            ?? 150;
  const perKm      = t?.perKmFee           ?? 30;
  const freeKm     = t?.freeKmRadius       ?? 3;
  const commPct    = t?.platformCommission ?? 15;
  const urgentFee  = isUrgent ? (t?.urgentSurcharge ?? 100) : 0;
  const h = new Date().getHours();
  const nightMult  = (h >= 22 || h < 6) ? 1 + ((t?.nightSurchargePercent ?? 50) / 100) : 1;
  const deliveryFee   = Math.round((base + Math.max(0, distKm - freeKm) * perKm + urgentFee) * nightMult);
  const commission    = Math.round(deliveryFee * commPct / 100);
  const driverEarning = deliveryFee - commission;
  return { deliveryFee, extraFees: 0, commission, driverEarning, commissionPercent: commPct };
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (req.user.role === 'client') filter.client = req.user._id;
    if (req.user.role === 'driver') {
      const d = await Driver.findOne({ user: req.user._id });
      if (d) filter.driver = d._id;
    }
    if (status) filter.status = status;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('client','firstName lastName phone')
        .populate({ path:'driver', populate:{ path:'user', select:'firstName lastName phone' } })
        .sort({ createdAt:-1 }).limit(+limit).skip((+page-1) * +limit),
      Order.countDocuments(filter),
    ]);
    res.json({ success:true, orders, total, pages: Math.ceil(total / +limit) });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── GET /api/orders/nearby ───────────────────────────────────────────────────
router.get('/nearby', async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success:false, message:'Profil livreur introuvable' });

    const orders = await Order.find({ status:'diffuse' }).populate('client','firstName lastName');

    const nearby = orders.filter(o => {
      if (!o.pickupAddress?.lat) return false;
      const dist = haversine(
        driver.currentLocation.lat, driver.currentLocation.lng,
        o.pickupAddress.lat, o.pickupAddress.lng
      );
      const notRejected = !o.rejectedByDrivers.map(id => id.toString()).includes(driver._id.toString());
      return dist <= (o.broadcastRadius || 3) && notRejected;
    }).map(o => ({
      ...o.toObject(),
      canAccept: driver.solde >= (o.pricing.minSoldeRequired || 0),
      distance: haversine(
        driver.currentLocation.lat, driver.currentLocation.lng,
        o.pickupAddress.lat, o.pickupAddress.lng
      ).toFixed(1),
    }));

    res.json({ success:true, orders:nearby, driverSolde: driver.solde });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('client','firstName lastName phone email address')
      .populate({ path:'driver', populate:{ path:'user', select:'firstName lastName phone' } });
    if (!order) return res.status(404).json({ success:false, message:'Commande introuvable' });
    res.json({ success:true, order });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { serviceType, items, pickupAddress, deliveryAddress,
            distanceKm, isUrgent, notes, broadcastRadius = 3 } = req.body;

    const pricing  = await calcPricing(serviceType, distanceKm || 3, isUrgent || false);
    const subtotal = (items || []).reduce((s, i) => s + i.price * i.quantity, 0);
    const total    = subtotal + pricing.deliveryFee;
    pricing.subtotal         = subtotal;
    pricing.total            = total;
    pricing.minSoldeRequired = Math.round(total * 0.20);

    const order = await Order.create({
      client: req.user._id,
      serviceType, items: items || [],
      pickupAddress, deliveryAddress,
      pricing, notes: notes || '',
      broadcastRadius,
      status: 'en_attente',
    });

    const io = req.app.get('io');

    if (pickupAddress?.lat && pickupAddress?.lng) {
      const allActive = await Driver.find({ status:'actif', currentOrder:null })
        .populate('user','firstName lastName');

      const nearby = allActive.filter(d => {
        const dist = haversine(pickupAddress.lat, pickupAddress.lng,
                               d.currentLocation.lat, d.currentLocation.lng);
        return dist <= broadcastRadius;
      });

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
            minSoldeRequired: pricing.minSoldeRequired,
            driverSolde:      d.solde,
            canAccept:        d.solde >= pricing.minSoldeRequired,
          });
        });

        io.to('admin').emit('order_broadcasted', {
          order: order.toObject(),
          nearbyDriversCount: nearby.length,
          driversNotified: nearby.map(d => ({
            id: d._id,
            name: `${d.user?.firstName} ${d.user?.lastName}`,
            distance: haversine(pickupAddress.lat, pickupAddress.lng,
                                d.currentLocation.lat, d.currentLocation.lng).toFixed(1),
            solde:     d.solde,
            canAccept: d.solde >= pricing.minSoldeRequired,
          })),
        });
      } else {
        await order.save();
        io.to('admin').emit('new_order', { order:order.toObject(), nearbyDriversCount:0 });
      }
    } else {
      await order.save();
      io.to('admin').emit('new_order', { order:order.toObject() });
    }

    res.status(201).json({ success:true, order });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── POST /api/orders/:id/accept ─────────────────────────────────────────────
router.post('/:id/accept', async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success:false, message:'Profil livreur introuvable' });
    if (driver.currentOrder)
      return res.status(400).json({ success:false, message:'Vous avez déjà une commande en cours' });

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: 'diffuse' },
      { $set: { status:'accepte', driver: driver._id,
                acceptedAt: new Date(),
                acceptedLocation: { lat: driver.currentLocation.lat, lng: driver.currentLocation.lng } } },
      { new: true }
    );

    if (!order)
      return res.status(400).json({ success:false, message:'Commande déjà prise ou non disponible' });

    if (driver.solde < order.pricing.minSoldeRequired) {
      await Order.findByIdAndUpdate(order._id, { status:'diffuse', driver:null, acceptedAt:null });
      return res.status(400).json({
        success:false,
        message:`Solde insuffisant. Requis : ${order.pricing.minSoldeRequired} MRU — Votre solde : ${driver.solde} MRU`,
        required: order.pricing.minSoldeRequired,
        current:  driver.solde,
      });
    }

    driver.currentOrder = order._id;
    await driver.save();

    const io = req.app.get('io');
    io.to('admin').emit('order_accepted', {
      orderId:    order._id,
      driverId:   driver._id,
      driverName: `${req.user.firstName} ${req.user.lastName}`,
      driverSolde: driver.solde,
      startLocation: driver.currentLocation,
      order: order.toObject(),
    });

    order.notifiedDrivers.forEach(dId => {
      if (dId.toString() !== driver._id.toString())
        io.to(`driver_${dId}`).emit('order_taken', { orderId: order._id });
    });

    io.to(`order_${order._id}`).emit('order_status_update', { status:'accepte' });

    res.json({ success:true, order });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── POST /api/orders/:id/reject ─────────────────────────────────────────────
router.post('/:id/reject', async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success:false, message:'Profil livreur introuvable' });
    await Order.findByIdAndUpdate(req.params.id, { $addToSet:{ rejectedByDrivers: driver._id } });
    res.json({ success:true });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── PATCH /api/orders/:id/status ────────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    console.log('🔄 UPDATE STATUS | role:', req.user.role, '| status:', status, '| orderId:', req.params.id);

    // Chercher la commande SANS populate pour avoir les IDs bruts
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success:false, message:'Commande introuvable' });

    console.log('📦 order.driver (raw):', order.driver);
    console.log('📦 order.status actuel:', order.status);

    // Vérification permission livreur
    if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ user: req.user._id });
      if (!driver) return res.status(403).json({ success:false, message:'Profil livreur introuvable' });

      if (!order.driver) {
        return res.status(403).json({ success:false, message:'Aucun livreur assigné à cette commande' });
      }

      // equals() gère ObjectId↔ObjectId et ObjectId↔string de façon fiable
      const assignedToThisDriver = driver._id.equals(order.driver);
      const isCurrentOrder       = driver.currentOrder && driver._id.equals(order.driver);

      if (!assignedToThisDriver && !isCurrentOrder) {
        return res.status(403).json({ success:false, message:'Cette commande ne vous appartient pas' });
      }
    }

    // Mettre à jour le statut
    order.status = status;
    await order.save();
    console.log('✅ Statut mis à jour:', status);

    const io = req.app.get('io');
    io.to(`order_${order._id}`).emit('order_status_update', { orderId:order._id, status });
    io.to('admin').emit('order_status_update', { orderId:order._id, status });

    // ── Livraison terminée → commission prélevée sur le solde du livreur ────
    if (status === 'livre' && order.driver && !order.commissionDeducted) {
      const driver = await Driver.findById(order.driver);
      if (driver) {
        const commission = order.pricing?.commission || 0;

        driver.solde = driver.solde - commission;
        driver.transactions.push({
          type: 'debit', montant: commission,
          motif: `Commission cmd #${order._id.toString().slice(-6).toUpperCase()}`,
          orderId: order._id,
        });
        driver.stats.totalDeliveries += 1;
        driver.currentOrder = null;
        await driver.save();
        await Order.findByIdAndUpdate(order._id, { commissionDeducted: true });

        io.to('admin').emit('order_completed', {
          orderId: order._id, driverId: driver._id,
          commission, newDriverSolde: driver.solde,
        });
        io.to(`driver_${driver._id}`).emit('solde_updated', {
          solde:   driver.solde,
          message: `✅ Livré ! Commission -${commission} MRU prélevée | Nouveau solde : ${driver.solde} MRU`,
        });
      }
    }

    res.json({ success:true, order });
  } catch (err) {
    console.error('❌ Erreur update status:', err.message);
    res.status(500).json({ success:false, message:err.message });
  }
});

// ─── PATCH /api/orders/:id/trail ─────────────────────────────────────────────
router.patch('/:id/trail', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await Order.findByIdAndUpdate(req.params.id, {
      $push: { driverTrail: { lat, lng, timestamp: new Date() } },
    });
    req.app.get('io').to('admin').emit('driver_trail_update', {
      orderId: req.params.id, lat, lng, timestamp: new Date(),
    });
    res.json({ success:true });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

// ─── POST /api/orders/:id/rate ────────────────────────────────────────────────
router.post('/:id/rate', async (req, res) => {
  try {
    const { score, comment } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id, { rating:{ score, comment } }, { new:true }
    );
    if (!order) return res.status(404).json({ success:false, message:'Commande introuvable' });
    if (order.driver) {
      const d = await Driver.findById(order.driver);
      if (d) {
        const n = d.stats.ratingCount + 1;
        d.stats.averageRating = (d.stats.averageRating * d.stats.ratingCount + score) / n;
        d.stats.ratingCount   = n;
        await d.save();
      }
    }
    res.json({ success:true, order });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
});

module.exports = router;
