const mongoose = require('mongoose');

const tarifSchema = new mongoose.Schema({
  serviceType:         { type: String, enum: ['nourriture','courses','colis','pharmacie'], required: true, unique: true },
  baseFee:             { type: Number, required: true },
  perKmFee:            { type: Number, default: 30 },
  urgentSurcharge:     { type: Number, default: 100 },
  nightSurchargePercent: { type: Number, default: 50 },
  platformCommission:  { type: Number, default: 15 },
  freeKmRadius:        { type: Number, default: 3 },
  isActive:            { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Tarif', tarifSchema);
