const jwt    = require('jsonwebtoken');
const Driver = require('../models/Driver');
const Order  = require('../models/Order');
const { getRouteInfo } = require('../utils/routeInfo');

// Throttle ETA : { orderId → lastCalcMs }
const etaThrottle = new Map();
const ETA_INTERVAL_MS = 15000;

// ── Centre d'appel support ─────────────────────────────────────────────────
const agentSockets       = new Set();   // tous les agents connectés
const availableAgents    = new Set();   // agents prêts à prendre un appel
const callQueue          = [];          // [{ socketId, callerName, callerType }]
const activeSupportCalls = new Map();   // callerSocketId → agentSocketId

function broadcastAgentCount(io) {
  io.emit('support_agents_count', {
    available: availableAgents.size,
    total:     agentSockets.size,
  });
}

function processQueue(io) {
  while (callQueue.length > 0 && availableAgents.size > 0) {
    const agentSocketId = [...availableAgents][0];
    const caller        = callQueue.shift();
    availableAgents.delete(agentSocketId);
    broadcastAgentCount(io);
    // Mettre à jour les positions des callers restants
    callQueue.forEach((c, i) => {
      io.to(c.socketId).emit('support_queue_position', { position: i + 1 });
    });
    activeSupportCalls.set(caller.socketId, agentSocketId);
    io.to(agentSocketId).emit('support_call_incoming', {
      callerSocketId: caller.socketId,
      callerName:     caller.callerName,
      callerType:     caller.callerType,
    });
    io.to(caller.socketId).emit('support_call_connecting', { agentSocketId });
  }
}
// ──────────────────────────────────────────────────────────────────────────

module.exports = function socketHandler(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token manquant'));
    try { socket.userId = jwt.verify(token, process.env.JWT_SECRET).id; next(); }
    catch { next(new Error('Token invalide')); }
  });

  io.on('connection', socket => {
    console.log(`🔌 Socket connecté: ${socket.id}`);

    // Envoyer immédiatement le compte d'agents au nouveau socket
    socket.emit('support_agents_count', {
      available: availableAgents.size,
      total:     agentSockets.size,
    });

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
      socket.isAgent = true;
      agentSockets.add(socket.id);
      broadcastAgentCount(io);
      console.log(`🧑‍💼 Agent connecté: ${socket.id}`);
    });

    // Agent se déclare disponible (prêt à prendre des appels)
    socket.on('agent_available', ({ agentName } = {}) => {
      if (!socket.isAgent) {
        socket.isAgent = true;
        agentSockets.add(socket.id);
      }
      socket.agentName = agentName || 'Agent';
      availableAgents.add(socket.id);
      broadcastAgentCount(io);
      processQueue(io);
    });

    // Agent se marque indisponible
    socket.on('agent_unavailable', () => {
      availableAgents.delete(socket.id);
      broadcastAgentCount(io);
    });

    // Client/livreur demande à parler au support
    socket.on('support_call_request', ({ callerName, callerType } = {}) => {
      // Dédoublonnage : supprimer de la file si déjà présent
      const existingIdx = callQueue.findIndex(c => c.socketId === socket.id);
      if (existingIdx !== -1) callQueue.splice(existingIdx, 1);

      if (availableAgents.size > 0) {
        const agentSocketId = [...availableAgents][0];
        availableAgents.delete(agentSocketId);
        broadcastAgentCount(io);
        activeSupportCalls.set(socket.id, agentSocketId);
        io.to(agentSocketId).emit('support_call_incoming', {
          callerSocketId: socket.id,
          callerName:     callerName || 'Utilisateur',
          callerType:     callerType || 'client',
        });
        socket.emit('support_call_connecting', { agentSocketId });
      } else {
        callQueue.push({
          socketId:   socket.id,
          callerName: callerName || 'Utilisateur',
          callerType: callerType || 'client',
        });
        socket.emit('support_call_queued', { position: callQueue.length });
      }
    });

    // Caller annule depuis la file d'attente
    socket.on('support_call_cancel', () => {
      const idx = callQueue.findIndex(c => c.socketId === socket.id);
      if (idx !== -1) {
        callQueue.splice(idx, 1);
        callQueue.forEach((c, i) => {
          io.to(c.socketId).emit('support_queue_position', { position: i + 1 });
        });
      }
    });

    // Agent accepte l'appel entrant → le caller peut démarrer WebRTC
    socket.on('support_call_accepted', ({ callerSocketId } = {}) => {
      io.to(callerSocketId).emit('support_call_accepted', { agentSocketId: socket.id });
    });

    // L'un ou l'autre raccroche
    socket.on('support_call_ended', ({ peerSocketId } = {}) => {
      if (peerSocketId) io.to(peerSocketId).emit('support_call_ended', {});

      if (socket.isAgent) {
        // Agent raccroche → retirer de l'appel actif et redevenir disponible
        activeSupportCalls.forEach((agId, callId) => {
          if (agId === socket.id) activeSupportCalls.delete(callId);
        });
        availableAgents.add(socket.id);
        broadcastAgentCount(io);
        processQueue(io);
      } else {
        // Caller raccroche → libérer l'agent associé
        const agentSocketId = activeSupportCalls.get(socket.id);
        activeSupportCalls.delete(socket.id);
        if (agentSocketId) {
          availableAgents.add(agentSocketId);
          broadcastAgentCount(io);
          processQueue(io);
        }
      }
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

    // Livreur ou client rejoint la room chat d'une commande
    socket.on('join_order_chat', orderId => {
      socket.join(`order_${orderId}`);
    });

    // ── Signalisation appels VoIP ──────────────────────────────────────────
    // Client invite le livreur
    socket.on('call_invite', ({ orderId, driverId, callerName }) => {
      io.to(`driver_${driverId}`).emit('call_incoming', {
        orderId, callerName, callerSocketId: socket.id,
      });
    });

    // Livreur invite le client (via la room de la commande)
    socket.on('call_invite_driver', ({ orderId, driverName }) => {
      io.to(`order_${orderId}`).emit('call_incoming', {
        orderId, callerName: driverName, callerSocketId: socket.id,
      });
    });

    // Livreur accepte
    socket.on('call_accepted', ({ callerSocketId, orderId }) => {
      io.to(callerSocketId).emit('call_accepted', {
        answererSocketId: socket.id, orderId,
      });
    });

    // Livreur refuse
    socket.on('call_rejected', ({ callerSocketId }) => {
      io.to(callerSocketId).emit('call_rejected');
    });

    // L'un ou l'autre raccroche
    socket.on('call_ended', ({ targetSocketId }) => {
      io.to(targetSocketId).emit('call_ended');
    });

    // Échange SDP / ICE
    socket.on('webrtc_offer', ({ sdp, targetSocketId }) => {
      io.to(targetSocketId).emit('webrtc_offer', { sdp, fromSocketId: socket.id });
    });
    socket.on('webrtc_answer', ({ sdp, targetSocketId }) => {
      io.to(targetSocketId).emit('webrtc_answer', { sdp });
    });
    socket.on('webrtc_ice', ({ candidate, targetSocketId }) => {
      io.to(targetSocketId).emit('webrtc_ice', { candidate });
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

        // Si commande en cours → enregistrer le trajet + notifier client + ETA
        const activeOrderId = orderId || (await Driver.findById(driverId).select('currentOrder'))?.currentOrder;

        if (activeOrderId) {
          await Order.findByIdAndUpdate(activeOrderId, {
            $push: { driverTrail: { lat, lng, timestamp: new Date() } },
          });

          // Calcul ETA throttlé (toutes les 15s)
          let eta = null;
          const key       = activeOrderId.toString();
          const lastCalc  = etaThrottle.get(key) || 0;
          if (Date.now() - lastCalc >= ETA_INTERVAL_MS) {
            etaThrottle.set(key, Date.now());
            try {
              const order = await Order.findById(activeOrderId).select('status pickupAddress deliveryAddress orderType trajetOuvert');
              if (order) {
                let dest = null;
                // Détermine la destination selon le statut
                if (['accepte', 'en_route'].includes(order.status) && order.orderType === 'course') {
                  // Course : chauffeur va chercher le client
                  dest = order.pickupAddress;
                } else if (order.status === 'accepte' && order.orderType === 'livraison') {
                  dest = order.pickupAddress;
                } else if (order.status === 'en_route' && order.orderType === 'livraison') {
                  dest = order.deliveryAddress;
                }
                if (dest?.lat && dest?.lng) {
                  eta = await getRouteInfo(lat, lng, dest.lat, dest.lng);
                }
              }
            } catch {}
          }

          io.to(`order_${activeOrderId}`).emit('driver_location', { driverId, lat, lng, eta });
          io.to('staff').emit('driver_trail_update', { orderId: activeOrderId, driverId, lat, lng, timestamp: new Date() });
        } else {
          // Pas de commande active : position visible staff seulement
        }
      } catch (e) { console.error('Erreur update_location:', e.message); }
    });

    // Livreur signale son arrivée (auto-détection géofencing)
    socket.on('driver_arrived', ({ orderId, type }) => {
      io.to(`order_${orderId}`).emit('driver_arrived', { type });
      io.to('staff').emit('driver_arrived', { orderId, type, driverId: socket.driverId });
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

      if (socket.isAgent) {
        agentSockets.delete(socket.id);
        availableAgents.delete(socket.id);
        broadcastAgentCount(io);
        // Notifier le caller en cours et libérer
        activeSupportCalls.forEach((agId, callId) => {
          if (agId === socket.id) {
            io.to(callId).emit('support_call_ended', {});
            activeSupportCalls.delete(callId);
          }
        });
        processQueue(io);
      } else {
        // Supprimer de la file si présent
        const idx = callQueue.findIndex(c => c.socketId === socket.id);
        if (idx !== -1) {
          callQueue.splice(idx, 1);
          callQueue.forEach((c, i) => {
            io.to(c.socketId).emit('support_queue_position', { position: i + 1 });
          });
        }
        // Libérer l'agent si en appel actif avec ce caller
        const agentSocketId = activeSupportCalls.get(socket.id);
        activeSupportCalls.delete(socket.id);
        if (agentSocketId) {
          availableAgents.add(agentSocketId);
          broadcastAgentCount(io);
          io.to(agentSocketId).emit('support_call_ended', {});
          processQueue(io);
        }
      }
    });
  });
};
