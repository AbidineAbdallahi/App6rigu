const express = require('express');
const router  = express.Router();
const Payment = require('../models/Payment');
const Driver  = require('../models/Driver');
const { verifyToken, requireDriver } = require('../middleware/auth');
const { initiateBankilyPayment, initiateMasriviPayment, SANDBOX } = require('../utils/paymentProviders');

const MIN_AMOUNT = 100;

async function confirmPayment(paymentId, io) {
  const payment = await Payment.findById(paymentId);
  if (!payment || payment.status !== 'pending') return;

  payment.status = 'success';
  await payment.save();

  const driver = await Driver.findByIdAndUpdate(
    payment.driver,
    { $inc: { solde: payment.amount } },
    { new: true }
  );

  if (io) {
    io.to(`driver_${payment.driver}`).emit('payment_confirmed', {
      paymentId: payment._id,
      amount:    payment.amount,
      newSolde:  driver?.solde ?? 0,
      provider:  payment.provider,
      sandbox:   payment.sandbox,
    });
  }
}

// POST /api/payments/driver/recharge
router.post('/driver/recharge', verifyToken, requireDriver, async (req, res) => {
  try {
    const { amount, provider, phone } = req.body;

    if (!amount || amount < MIN_AMOUNT)
      return res.status(400).json({ success: false, message: `Montant minimum : ${MIN_AMOUNT} MRU` });
    if (!['bankily', 'masrivi'].includes(provider))
      return res.status(400).json({ success: false, message: 'Opérateur invalide' });
    if (!phone || !/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g, '')))
      return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });

    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Profil livreur introuvable' });

    const payment = await Payment.create({
      driver: driver._id, amount, provider,
      phone: phone.replace(/\s/g, ''),
      sandbox: SANDBOX,
    });

    const reference = `AMDER-${payment._id}`;
    let providerResult;
    try {
      if (provider === 'bankily') providerResult = await initiateBankilyPayment({ amount, phone, reference });
      else                        providerResult = await initiateMasriviPayment({ amount, phone, reference });
    } catch (err) {
      payment.status = 'failed';
      await payment.save();
      return res.status(502).json({ success: false, message: err.message });
    }

    payment.providerRef = providerResult.providerRef;
    await payment.save();

    if (SANDBOX) {
      const io = req.app.get('io');
      setTimeout(() => confirmPayment(payment._id, io), 3000);
    }

    res.json({
      success:   true,
      paymentId: payment._id,
      sandbox:   SANDBOX,
      message:   SANDBOX
        ? 'Mode test — confirmation automatique dans 3 secondes'
        : 'Un message USSD va apparaître sur votre téléphone pour confirmer.',
    });
  } catch (err) {
    console.error('recharge error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/payments/driver/history
router.get('/driver/history', verifyToken, requireDriver, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id }).select('_id');
    if (!driver) return res.status(404).json({ success: false, message: 'Profil livreur introuvable' });

    const payments = await Payment.find({ driver: driver._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('amount provider phone status createdAt sandbox');
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/payments/webhook/bankily — callback Bankily (public)
router.post('/webhook/bankily', async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    const payment = await Payment.findOne({ providerRef: transactionId, provider: 'bankily' });
    if (!payment) return res.status(404).json({ success: false });

    if (status === 'success') await confirmPayment(payment._id, req.app.get('io'));
    else { payment.status = 'failed'; await payment.save(); }

    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// POST /api/payments/webhook/masrivi — callback Masrivi (public)
router.post('/webhook/masrivi', async (req, res) => {
  try {
    const { paymentRef, status } = req.body;
    const payment = await Payment.findOne({ providerRef: paymentRef, provider: 'masrivi' });
    if (!payment) return res.status(404).json({ success: false });

    if (status === 'success') await confirmPayment(payment._id, req.app.get('io'));
    else { payment.status = 'failed'; await payment.save(); }

    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

module.exports = router;
