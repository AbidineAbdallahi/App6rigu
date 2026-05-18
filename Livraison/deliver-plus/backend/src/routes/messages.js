const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { verifyToken } = require('../middleware/auth');
const Message = require('../models/Message');
const Order   = require('../models/Order');
const Driver  = require('../models/Driver');

const router = express.Router();

// ─── Multer : stockage des messages vocaux ─────────────────────────────────
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/audio');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.m4a`);
  },
});
const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /audio/i.test(file.mimetype) ||
               /\.(m4a|mp3|ogg|wav|aac|3gp|webm)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// ─── Helper : vérifie que l'utilisateur est client ou livreur de la commande
async function checkAccess(req, orderId) {
  const order = await Order.findById(orderId);
  if (!order) return null;
  const userId = req.user._id.toString();
  if (order.client?.toString() === userId) return { order, role: 'client' };
  if (req.user.role === 'driver') {
    const drv = await Driver.findOne({ user: req.user._id });
    if (drv && order.driver?.toString() === drv._id.toString()) return { order, role: 'driver' };
  }
  return null;
}

// GET /api/messages/:orderId — historique
router.get('/:orderId', verifyToken, async (req, res) => {
  try {
    const access = await checkAccess(req, req.params.orderId);
    if (!access) return res.status(403).json({ success: false, message: 'Accès refusé' });

    const messages = await Message.find({ order: req.params.orderId })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'firstName lastName');

    res.json({ success: true, messages });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/messages/:orderId — envoyer un message texte
router.post('/:orderId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Message vide' });
    if (text.trim().length > 500) return res.status(400).json({ success: false, message: 'Message trop long' });

    const access = await checkAccess(req, req.params.orderId);
    if (!access) return res.status(403).json({ success: false, message: 'Accès refusé' });

    const msg = await Message.create({
      order:       req.params.orderId,
      sender:      req.user._id,
      senderRole:  access.role,
      messageType: 'text',
      text:        text.trim(),
    });

    const payload = {
      _id:         msg._id,
      senderRole:  msg.senderRole,
      senderName:  `${req.user.firstName} ${req.user.lastName}`,
      messageType: 'text',
      text:        msg.text,
      createdAt:   msg.createdAt,
    };

    const io = req.app.get('io');
    if (io) io.to(`order_${req.params.orderId}`).emit('chat_message', payload);

    res.status(201).json({ success: true, message: payload });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/messages/:orderId/audio — envoyer un message vocal
router.post('/:orderId/audio', verifyToken, uploadAudio.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Fichier audio manquant' });

    const access = await checkAccess(req, req.params.orderId);
    if (!access) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const audioUrl     = `/uploads/audio/${req.file.filename}`;
    const audioDuration = Math.max(1, Math.round(parseFloat(req.body.duration) || 1));

    const msg = await Message.create({
      order:         req.params.orderId,
      sender:        req.user._id,
      senderRole:    access.role,
      messageType:   'audio',
      audioUrl,
      audioDuration,
    });

    const payload = {
      _id:           msg._id,
      senderRole:    msg.senderRole,
      senderName:    `${req.user.firstName} ${req.user.lastName}`,
      messageType:   'audio',
      audioUrl,
      audioDuration,
      createdAt:     msg.createdAt,
    };

    const io = req.app.get('io');
    if (io) io.to(`order_${req.params.orderId}`).emit('chat_message', payload);

    res.status(201).json({ success: true, message: payload });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
