const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Token manquant' });
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: 'Utilisateur inactif' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
};

const requireAdmin  = (req, res, next) => req.user.role === 'admin'  ? next() : res.status(403).json({ success: false, message: 'Admins uniquement' });
const requireDriver = (req, res, next) => ['driver','admin'].includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'Livreurs uniquement' });

module.exports = { verifyToken, requireAdmin, requireDriver };
