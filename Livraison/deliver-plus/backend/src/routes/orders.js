const express = require('express');
const http   = require('http');
const Order  = require('../models/Order');
const Driver = require('../models/Driver');
const Tarif  = require('../models/Tarif');
const User   = require('../models/User');
const { sendPush } = require('../utils/push');
const { sendFcmToDriver } = require('../utils/fcm');
const { isReferralActive, getReferralBonus } = require('../utils/referral');

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

// ─── Distance réelle routière via OSRM (fallback haversine×1.3) ──────────────
function getRoadDistanceKm(lat1, lng1, lat2, lng2) {
  const fallback = Math.round(haversine(lat1, lng1, lat2, lng2) * 1.3 * 10) / 10;
  return new Promise((resolve) => {
    try {
      const options = {
        hostname: 'router.project-osrm.org',
        path: `/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`,
        method: 'GET',
        timeout: 4000,
      };
      const req = http.get(options, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const dist = json.routes?.[0]?.distance;
            resolve(dist ? Math.round(dist / 100) / 10 : fallback);
          } catch { resolve(fallback); }
        });
      });
      req.on('error', () => resolve(fallback));
      req.on('timeout', () => { req.destroy(); resolve(fallback); });
    } catch { resolve(fallback); }
  });
}

// ─── Calcul pricing + commission ─────────────────────────────────────────────
async function calcPricing(serviceType, distKm = 0, isUrgent = false) {
  const sType = serviceType || 'colis';
  const t          = await Tarif.findOne({ serviceType: sType, isActive: true });
  const base       = t?.baseFee            ?? (sType === 'course' ? 0    : 150);
  const perKm      = t?.perKmFee           ?? (sType === 'course' ? 30   : 30);
  const freeKm     = t?.freeKmRadius       ?? (sType === 'course' ? 0    : 3);
  const minFare    = t?.minimumFare        ?? (sType === 'course' ? 100  : 0);
  const commPct    = t?.platformCommission ?? (sType === 'course' ? 10   : 15);
  const urgentFee  = isUrgent ? (t?.urgentSurcharge ?? 100) : 0;
  const h = new Date().getHours();
  const isNight    = h >= 22 || h < 6;
  const nightMult  = isNight ? 1 + ((t?.nightSurchargePercent ?? (sType === 'course' ? 30 : 50)) / 100) : 1;
  const raw        = Math.round((base + Math.max(0, distKm - freeKm) * perKm + urgentFee) * nightMult);
  const deliveryFee   = Math.max(raw, minFare);
  const commission    = Math.round(deliveryFee * commPct / 100);
  const driverEarning = deliveryFee - commission;
  return {
    deliveryFee, extraFees: 0, commission, driverEarning,
    commissionPercent: commPct, base, perKm, minFare, isNight,
  };
}

// ─── POST /api/orders/estimate ────────────────────────────────────────────────
router.post('/estimate', async (req, res) => {
  try {
    const { orderType, serviceType, pickupLat, pickupLng, deliveryLat, deliveryLng } = req.body;
    if (!pickupLat || !pickupLng) return res.status(400).json({ success:false, message:'Position de départ manquante' });

    const trajetOuvert = !deliveryLat || !deliveryLng;
    const sType = orderType === 'course' ? 'course' : (serviceType || 'colis');

    let distanceKm = 0;
    if (!trajetOuvert) {
      distanceKm = await getRoadDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng);
    }

    const pricing = await calcPricing(sType, distanceKm);

    res.json({
      success: true,
      distanceKm,
      trajetOuvert,
      pricing: { ...pricing, total: pricing.deliveryFee },
    });
  } catch (err) { res.status(500).json({ success:false, message: err.message }); }
});

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

    const TWO_MIN_AGO = new Date(Date.now() - 2 * 60 * 1000);
    const orders = await Order.find({
      status: 'diffuse',
      orderType: driver.driverType,
      createdAt: { $gte: TWO_MIN_AGO },
    }).populate('client','firstName lastName');

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
    const { orderType, serviceType, items, pickupAddress, deliveryAddress,
            distanceKm, isUrgent, notes, broadcastRadius = 3, trajetOuvert = false } = req.body;

    if (!orderType) return res.status(400).json({ success:false, message:'orderType requis (course ou livraison)' });

    const sType = orderType === 'course' ? 'course' : (serviceType || 'colis');

    // Pour les courses : distance OSRM si destination fournie, sinon tarif minimum
    let effectiveDistKm = distanceKm || 0;
    if (orderType === 'course' && !trajetOuvert && deliveryAddress?.lat && pickupAddress?.lat) {
      effectiveDistKm = await getRoadDistanceKm(
        pickupAddress.lat, pickupAddress.lng,
        deliveryAddress.lat, deliveryAddress.lng
      );
    }

    const pricing  = await calcPricing(sType, effectiveDistKm, isUrgent || false);
    const subtotal = (items || []).reduce((s, i) => s + i.price * i.quantity, 0);
    const total    = subtotal + pricing.deliveryFee;
    pricing.subtotal         = subtotal;
    pricing.total            = total;
    pricing.minSoldeRequired = Math.round(total * 0.20);

    // Appliquer les crédits de parrainage si le système est actif
    let creditsApplied = 0;
    let clientUser = null;
    if (await isReferralActive()) {
      clientUser = await User.findById(req.user._id).select('referralCredits');
      if (clientUser?.referralCredits > 0) {
        creditsApplied = Math.min(clientUser.referralCredits, pricing.total);
        pricing.total  = Math.max(0, pricing.total - creditsApplied);
        await User.findByIdAndUpdate(req.user._id, { $inc: { referralCredits: -creditsApplied } });
      }
    }

    const order = await Order.create({
      client: req.user._id,
      orderType,
      serviceType: serviceType || null,
      trajetOuvert,
      items: items || [],
      pickupAddress,
      deliveryAddress: trajetOuvert ? null : deliveryAddress,
      pricing, notes: notes || '',
      broadcastRadius,
      creditsApplied,
      status: 'en_attente',
    });

    const io = req.app.get('io');

    if (pickupAddress?.lat && pickupAddress?.lng) {
      // Accepter les livreurs dont le driverType correspond OU est null (non encore assigné)
      const allActive = await Driver.find({
        status: 'actif',
        currentOrder: null,
        $or: [{ driverType: orderType }, { driverType: null }],
      }).populate('user','firstName lastName');

      console.log(`[ORDER] Type: ${orderType} | Livreurs actifs en DB: ${allActive.length}`);
      allActive.forEach(d => console.log(`  → ${d.user?.firstName} | driverType:${d.driverType} | loc:(${d.currentLocation.lat},${d.currentLocation.lng})`));

      const nearby = allActive.filter(d => {
        const dist = haversine(pickupAddress.lat, pickupAddress.lng,
                               d.currentLocation.lat, d.currentLocation.lng);
        const inRange = dist <= broadcastRadius;
        if (!inRange) console.log(`  ✗ ${d.user?.firstName} hors rayon: ${dist.toFixed(2)} km > ${broadcastRadius} km`);
        return inRange;
      });

      console.log(`[ORDER] À proximité (≤${broadcastRadius}km): ${nearby.length}`);

      if (nearby.length > 0) {
        order.status          = 'diffuse';
        order.notifiedDrivers = nearby.map(d => d._id);
        await order.save();

        const driverUserIds = nearby.map(d => d.user?._id || d.user).filter(Boolean);
        const driverUsers = await User.find({ _id: { $in: driverUserIds } }).select('pushToken fcmToken');
        console.log(`[TOKEN] userIds cherchés: ${driverUserIds.map(id => id.toString()).join(', ')}`);
        console.log(`[TOKEN] users trouvés: ${driverUsers.length}`);
        driverUsers.forEach(u => console.log(`  userId:${u._id} fcm:${u.fcmToken ? '✅' : '❌'} push:${u.pushToken ? '✅' : '❌'}`));
        // Construire un map userId → tokens pour l'envoi individuel par livreur
        const tokenMap = {};
        driverUsers.forEach(u => { tokenMap[u._id.toString()] = { pushToken: u.pushToken, fcmToken: u.fcmToken }; });
        const isCourse = orderType === 'course';
        let pushCount = 0;
        nearby.forEach(d => {
          const uid = (d.user?._id || d.user)?.toString();
          const tokens = tokenMap[uid];
          if (!tokens?.pushToken && !tokens?.fcmToken) { console.log(`  ⚠️  Pas de token pour ${d.user?.firstName}`); return; }
          const dist = haversine(pickupAddress.lat, pickupAddress.lng, d.currentLocation.lat, d.currentLocation.lng).toFixed(1);
          const orderData = {
            type: 'new_order',
            orderId: order._id.toString(),
            orderType,
            total: String(pricing.total),
            distance: dist,
          };
          // FCM data-only → réveille l'app même fermée → plein écran Notifee
          if (tokens.fcmToken) {
            sendFcmToDriver(tokens.fcmToken, orderData).catch(() => {});
          }
          // Push Expo → bannière de secours si FCM échoue ou app pas configurée
          if (tokens.pushToken) {
            sendPush(
              tokens.pushToken,
              isCourse ? '🚖 Nouvelle course !' : '📦 Nouvelle commande !',
              `${pricing.total} MRU · À ${dist} km`,
              orderData
            );
          }
          console.log(`  fcm:${tokens.fcmToken ? '✅' : '❌'} push:${tokens.pushToken ? '✅' : '❌'}`);
          pushCount++;
        });
        if (pushCount > 0) {
          console.log(`[ORDER] ✅ Push envoyé à ${pushCount} livreur(s)`);
        } else {
          console.log('[ORDER] ⚠️  Aucun token push valide — push non envoyé');
        }

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

        io.to('staff').emit('order_broadcasted', {
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
        io.to('staff').emit('new_order', { order:order.toObject(), nearbyDriversCount:0 });
      }
    } else {
      await order.save();
      io.to('staff').emit('new_order', { order:order.toObject() });
    }

    const remainingCredits = (clientUser?.referralCredits || 0) - creditsApplied;
    res.status(201).json({ success:true, order, creditsApplied, remainingCredits: Math.max(0, remainingCredits) });
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
    io.to('staff').emit('order_accepted', {
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

    io.to(`order_${order._id}`).emit('order_status_update', {
      status: 'accepte',
      driver: {
        _id: driver._id,
        user: {
          firstName: req.user.firstName,
          lastName:  req.user.lastName,
          phone:     req.user.phone,
        },
        vehicleType:     driver.vehicleType,
        currentLocation: driver.currentLocation,
      },
    });

    // Push notification → client
    try {
      const client = await User.findById(order.client).select('pushToken');
      if (client?.pushToken) {
        const isCourse = order.orderType === 'course';
        sendPush(
          client.pushToken,
          isCourse ? '🚖 Chauffeur trouvé !' : '✅ Livreur accepté !',
          isCourse
            ? `${req.user.firstName} est en route vers vous`
            : `${req.user.firstName} récupère votre commande`,
          { orderId: order._id.toString(), type: 'order_accepted' }
        );
      }
    } catch {}

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
    io.to('staff').emit('order_status_update', { orderId:order._id, status });

    // ── Push notification → client ────────────────────────────────────────────
    try {
      const PUSH_MESSAGES = {
        en_route:       { t: '🛵 Livreur en route',       b: 'Votre commande arrive bientôt !' },
        en_preparation: { t: '📦 Commande récupérée',     b: 'Le livreur est en chemin vers vous' },
        livre:          { t: '✅ Commande livrée !',       b: 'Merci d\'avoir utilisé Amder 🎉' },
        annule:         { t: '❌ Commande annulée',        b: 'Votre commande a été annulée' },
      };
      if (PUSH_MESSAGES[status]) {
        const client = await User.findById(order.client).select('pushToken');
        if (client?.pushToken) {
          const { t: title, b: body } = PUSH_MESSAGES[status];
          sendPush(client.pushToken, title, body, {
            orderId: order._id.toString(), type: 'status_update', status,
          });
        }
      }
    } catch {}

    // ── Terminé → calcul prix + commission ───────────────────────────────────
    if (status === 'livre' && order.driver && !order.commissionDeducted) {
      const driver = await Driver.findById(order.driver);
      if (driver) {
        let commission = order.pricing?.commission || 0;
        let finalTotal = order.pricing?.total || 0;

        // ── COURSE : calcul du prix réel (distance GPS + durée) ──────────────
        if (order.orderType === 'course') {
          // Distance réelle depuis le driverTrail
          let totalKm = 0;
          const trail = order.driverTrail || [];
          for (let i = 1; i < trail.length; i++) {
            totalKm += haversine(
              trail[i-1].lat, trail[i-1].lng,
              trail[i].lat,   trail[i].lng
            );
          }
          totalKm = Math.round(totalKm * 10) / 10;

          // Durée depuis "passager à bord" (en_preparation) ou depuis acceptedAt
          const startEntry = order.statusHistory?.slice().reverse()
            .find(h => h.status === 'en_preparation');
          const startTime = startEntry?.timestamp || order.acceptedAt || new Date();
          const durationMin = Math.max(1, Math.round((Date.now() - new Date(startTime).getTime()) / 60000));

          // Tarif course
          const tarif = await Tarif.findOne({ serviceType: 'course', isActive: true });
          const base    = tarif?.baseFee            ?? 0;
          const perKm   = tarif?.perKmFee           ?? 30;
          const perMin  = tarif?.perMinuteFee        ?? 10;
          const minFare = tarif?.minimumFare         ?? 100;
          const commPct = tarif?.platformCommission  ?? 10;
          const h2 = new Date().getHours();
          const nightM = (h2 >= 22 || h2 < 6) ? 1 + ((tarif?.nightSurchargePercent ?? 30) / 100) : 1;

          const raw = Math.round((base + totalKm * perKm + durationMin * perMin) * nightM);
          finalTotal = Math.max(raw, minFare);
          commission = Math.round(finalTotal * commPct / 100);
          const driverEarning = finalTotal - commission;

          await Order.findByIdAndUpdate(order._id, {
            actualDistanceKm:  totalKm,
            actualDurationMin: durationMin,
            'pricing.deliveryFee':   finalTotal,
            'pricing.total':         finalTotal,
            'pricing.commission':    commission,
            'pricing.driverEarning': driverEarning,
          });
        }

        driver.solde -= commission;
        driver.transactions.push({
          type: 'debit', montant: commission,
          motif: order.orderType === 'course'
            ? `Commission course #${order._id.toString().slice(-6).toUpperCase()}`
            : `Commission cmd #${order._id.toString().slice(-6).toUpperCase()}`,
          orderId: order._id,
        });
        driver.stats.totalDeliveries += 1;
        driver.currentOrder = null;
        await driver.save();
        await Order.findByIdAndUpdate(order._id, { commissionDeducted: true });

        const endMsg = order.orderType === 'course'
          ? `🏁 Course terminée ! Prix final : ${finalTotal} MRU | Commission -${commission} MRU | Solde : ${driver.solde} MRU`
          : `✅ Livré ! Commission -${commission} MRU prélevée | Nouveau solde : ${driver.solde} MRU`;

        io.to('staff').emit('order_completed', {
          orderId: order._id, driverId: driver._id,
          commission, finalTotal, newDriverSolde: driver.solde,
        });
        io.to(`driver_${driver._id}`).emit('solde_updated', {
          solde: driver.solde, message: endMsg,
        });
        io.to(`order_${order._id}`).emit('course_price_final', {
          total: finalTotal, commission,
          actualDistanceKm: order.actualDistanceKm,
          actualDurationMin: order.actualDurationMin,
        });
      }
    }

    res.json({ success:true, order });
  } catch (err) {
    console.error('❌ Erreur update status:', err.message);
    res.status(500).json({ success:false, message:err.message });
  }
});

// ─── POST /api/orders/:id/cancel ─────────────────────────────────────────────
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success:false, message:'Commande introuvable' });

    // Client: avant passager à bord (avant en_preparation pour course, avant en_route pour livraison)
    // Driver: idem — pas d'annulation une fois le passager embarqué
    const clientCancellable = ['en_attente','diffuse','accepte'];
    const driverCancellable = ['accepte','en_route'];
    if (req.user.role === 'client' && !clientCancellable.includes(order.status))
      return res.status(400).json({ success:false, message:'Cette commande ne peut plus être annulée' });
    if (req.user.role === 'driver' && !driverCancellable.includes(order.status))
      return res.status(400).json({ success:false, message:'Impossible d\'annuler une fois le passager à bord' });

    const io = req.app.get('io');

    if (req.user.role === 'client') {
      if (order.client.toString() !== req.user._id.toString())
        return res.status(403).json({ success:false, message:'Non autorisé' });

      order.status = 'annule';
      order.cancelledBy = 'client';
      order.cancellationReason = reason || null;
      await order.save();

      // Restituer les crédits de parrainage si utilisés
      let creditsRestored = 0;
      if (order.creditsApplied > 0) {
        await User.findByIdAndUpdate(order.client, { $inc: { referralCredits: order.creditsApplied } });
        creditsRestored = order.creditsApplied;
      }

      if (order.driver) {
        await Driver.findByIdAndUpdate(order.driver, { currentOrder: null });
        io.to(`driver_${order.driver}`).emit('order_cancelled_by_client', { orderId: order._id });
      }
      io.to(`order_${order._id}`).emit('order_status_update', { status: 'annule' });
      io.to('staff').emit('order_cancelled', { orderId: order._id, cancelledBy: 'client' });

      return res.json({ success: true, creditsRestored });

    } else if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ user: req.user._id });
      if (!driver) return res.status(404).json({ success:false, message:'Profil livreur introuvable' });
      if (!order.driver || !driver._id.equals(order.driver))
        return res.status(403).json({ success:false, message:'Non autorisé' });
      if (!reason?.trim())
        return res.status(400).json({ success:false, message:"La raison d'annulation est obligatoire" });

      order.status = 'annule';
      order.cancelledBy = 'driver';
      order.cancellationReason = reason.trim();
      order.driverCancellationPending = true;
      await order.save();

      // Restituer les crédits au client si le livreur annule
      if (order.creditsApplied > 0) {
        await User.findByIdAndUpdate(order.client, { $inc: { referralCredits: order.creditsApplied } });
      }

      try {
        const clientUser = await User.findById(order.client).select('pushToken firstName');
        if (clientUser?.pushToken) {
          sendPush(clientUser.pushToken, '❌ Course annulée',
            order.creditsApplied > 0
              ? `Votre livreur a annulé. Vos ${order.creditsApplied} MRU ont été restitués.`
              : 'Votre livreur a annulé la commande.',
            { orderId: order._id.toString(), type: 'order_cancelled' });
        }
      } catch {}

      io.to(`order_${order._id}`).emit('order_status_update', { status: 'annule', creditsRestored: order.creditsApplied });
      io.to('staff').emit('driver_cancellation_pending', {
        orderId: order._id.toString(),
        driverId: driver._id.toString(),
        driverName: `${req.user.firstName} ${req.user.lastName}`,
        reason: reason.trim(),
      });

    } else {
      return res.status(403).json({ success:false, message:'Non autorisé' });
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success:false, message:err.message }); }
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
