const jwt    = require('jsonwebtoken');
const Driver = require('../models/Driver');
const Order  = require('../models/Order');

module.exports = function socketHandler(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token manquant'));
    try { socket.userId = jwt.verify(token, process.env.JWT_SECRET).id; next(); }
    catch { next(new Error('Token invalide')); }
  });

  io.on('connection', socket => {
    console.log(`🔌 Socket connecté: ${socket.id}`);

    // Admin rejoint sa room
    socket.on('join_admin', () => {
      socket.join('admin');
      socket.join('staff');
      console.log(`👨‍💼 Admin connecté`);
    });

    // Agent rejoint sa room
    socket.on('join_agent', () => {
      socket.join('agent');
      socket.join('staff');
      console.log(`🧑‍💼 Agent connecté`);
    });

    // Livreur s'identifie
    socket.on('join_driver', driverId => {
      socket.join(`driver_${driverId}`);
      socket.driverId = driverId;
      const rooms = [...socket.rooms].join(', ');
      console.log(`🛵 join_driver reçu | driverId:${driverId} | rooms:[${rooms}]`);
    });

    // Client suit une commande
    socket.on('track_order', orderId => {
      socket.join(`order_${orderId}`);
    });

    // Livreur envoie sa position GPS (toutes les ~2-4 secondes)
    socket.on('update_location', async ({ driverId, lat, lng, orderId }) => {
      try {
        // Valider les coordonnées
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

        // Mettre à jour position courante du livreur
        await Driver.findByIdAndUpdate(driverId, {
          currentLocation: { lat, lng, updatedAt: new Date() },
        });

        // Diffuser position à l'admin avec driverId en string pour cohérence
        io.to('staff').emit('driver_location', { driverId: driverId.toString(), lat, lng, timestamp: new Date() });

        // Si commande en cours → enregistrer le trajet + notifier client
        if (orderId) {
          await Order.findByIdAndUpdate(orderId, {
            $push: { driverTrail: { lat, lng, timestamp: new Date() } },
          });
          io.to(`order_${orderId}`).emit('driver_location', { driverId, lat, lng });
          io.to('staff').emit('driver_trail_update', { orderId, driverId, lat, lng, timestamp: new Date() });
        } else {
          // Vérifier si le livreur a une commande active
          const driver = await Driver.findById(driverId).select('currentOrder');
          if (driver?.currentOrder) {
            await Order.findByIdAndUpdate(driver.currentOrder, {
              $push: { driverTrail: { lat, lng, timestamp: new Date() } },
            });
            io.to(`order_${driver.currentOrder}`).emit('driver_location', { driverId, lat, lng });
            io.to('staff').emit('driver_trail_update', {
              orderId: driver.currentOrder, driverId, lat, lng, timestamp: new Date(),
            });
          }
        }
      } catch (e) { console.error('Erreur update_location:', e.message); }
    });

    // Livreur change son statut
    socket.on('update_driver_status', async ({ driverId, status }) => {
      try {
        await Driver.findByIdAndUpdate(driverId, { status });
        io.to('staff').emit('driver_status_update', { driverId, status, timestamp: new Date() });
      } catch (e) { console.error('Erreur status:', e.message); }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Déconnecté: ${socket.id}`);
    });
  });
};
