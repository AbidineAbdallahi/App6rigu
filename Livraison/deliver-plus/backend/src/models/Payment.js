const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  driver:      { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
  amount:      { type: Number, required: true },
  provider:    { type: String, enum: ['bankily', 'masrivi'], required: true },
  phone:       { type: String, required: true },
  status:      { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  providerRef: { type: String },
  sandbox:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
