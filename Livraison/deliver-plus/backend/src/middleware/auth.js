const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Driver = require('../models/Driver');

const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Token manquant' });
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });

    // Livreur inactif : autoriser uniquement si son dossier est 'incomplet'
    // (il doit pouvoir appeler auth/me et complete-dossier)
    if (!user.isActive && user.role === 'driver') {
      const driver = await Driver.findOne({ user: user._id }).select('approvalStatus');
      if (driver?.approvalStatus !== 'incomplet') {
        return res.status(401).json({ success: false, message: 'Compte inactif' });
      }
    } else if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Compte inactif' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
};

const requireAdmin  = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ success: false, message: 'Admins uniquement' });
const requireAgent  = (req, res, next) => ['admin','agent'].includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'Accès réservé' });
const requireDriver = (req, res, next) => ['driver','admin'].includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'Livreurs uniquement' });

module.exports = { verifyToken, requireAdmin, requireAgent, requireDriver };
