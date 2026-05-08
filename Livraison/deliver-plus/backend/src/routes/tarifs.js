// routes/tarifs.js
const express = require('express');
const Tarif = require('../models/Tarif');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try { res.json({ success:true, tarifs: await Tarif.find() }); }
  catch (err) { res.status(500).json({ success:false, message: err.message }); }
});
router.post('/', requireAdmin, async (req, res) => {
  try { res.status(201).json({ success:true, tarif: await Tarif.create(req.body) }); }
  catch (err) { res.status(500).json({ success:false, message: err.message }); }
});
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const tarif = await Tarif.findByIdAndUpdate(req.params.id, req.body, { new:true });
    if (!tarif) return res.status(404).json({ success:false, message:'Non trouvé' });
    res.json({ success:true, tarif });
  } catch (err) { res.status(500).json({ success:false, message: err.message }); }
});

module.exports = router;
