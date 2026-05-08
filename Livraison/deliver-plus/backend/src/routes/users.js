const express = require('express');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/profile', (req, res) => res.json({ success:true, user: req.user }));
router.patch('/profile', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, req.body, { new:true });
    res.json({ success:true, user });
  } catch (err) { res.status(500).json({ success:false, message: err.message }); }
});
router.get('/', requireAdmin, async (req, res) => {
  try { res.json({ success:true, users: await User.find().sort({ createdAt:-1 }) }); }
  catch (err) { res.status(500).json({ success:false, message: err.message }); }
});

module.exports = router;
