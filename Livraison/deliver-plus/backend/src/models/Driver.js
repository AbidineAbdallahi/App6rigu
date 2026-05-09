const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleType: { type: String, enum: ['moto','voiture','velo','pied'], default: 'moto' },
  zone:        { type: String, required: true },
  services:    { type: [String], enum: ['nourriture','courses','colis','pharmacie'],
                 default: ['nourriture','courses','colis','pharmacie'] },
  status:      { type: String, enum: ['actif','pause','hors_ligne','suspendu'], default: 'hors_ligne' },
  currentLocation: {
    lat: { type: Number, default: 18.0858 },
    lng: { type: Number, default: -15.9785 },
    updatedAt: { type: Date, default: Date.now },
  },
  // Solde du livreur dans l'application (MRU)
  solde: { type: Number, default: 0 },
  // Pourcentage minimum du solde requis pour accepter (ex: 20%)
  minSoldePercent: { type: Number, default: 20 },
  // Historique des transactions
  transactions: [{
    type:      { type: String, enum: ['credit','debit'], required: true },
    montant:   { type: Number, required: true },
    motif:     { type: String },
    orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    createdAt: { type: Date, default: Date.now },
  }],
  stats: {
    totalDeliveries: { type: Number, default: 0 },
    totalEarnings:   { type: Number, default: 0 },
    averageRating:   { type: Number, default: 0 },
    ratingCount:     { type: Number, default: 0 },
  },
  currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  documents: {
    photoPersonnelle: { type: String, default: null },
    photoVehicule:    { type: String, default: null },
    carteGrise:       { type: String, default: null },
    carteIdentite:    { type: String, default: null },
    assurance:        { type: String, default: null },
  },
  approvalStatus:   { type: String, enum: ['en_attente','approuve','rejete','incomplet'], default: 'approuve' },
  rejectionReason:  { type: String, default: null },
  missingDocuments: { type: [String], default: [] }, // liste des clés manquantes signalées par l'admin
  missingInfoNote:  { type: String, default: null },  // message libre de l'admin
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);
