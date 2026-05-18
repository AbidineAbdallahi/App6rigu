const mongoose = require('mongoose');

const tarifSchema = new mongoose.Schema({
  serviceType:           { type: String, enum: ['nourriture','courses','colis','pharmacie','course'], required: true, unique: true },
  baseFee:               { type: Number, required: true },
  perKmFee:              { type: Number, default: 30 },
  minimumFare:           { type: Number, default: 400 },
  perMinuteFee:          { type: Number, default: 10 },
  urgentSurcharge:       { type: Number, default: 100 },
  nightSurchargePercent: { type: Number, default: 30 },
  platformCommission:    { type: Number, default: 15 },
  freeKmRadius:          { type: Number, default: 0 },
  isActive:              { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Tarif', tarifSchema);
