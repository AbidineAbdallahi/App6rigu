const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  client:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driver:      { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
  serviceType: { type: String, enum: ['nourriture','courses','colis','pharmacie'], required: true },
  items: [{ name: String, quantity: { type: Number, default: 1 }, price: Number }],
  pickupAddress: { label: String, street: String, zone: String, lat: Number, lng: Number },
  deliveryAddress: { label: String, street: String, zone: String, lat: Number, lng: Number },
  status: {
    type: String,
    enum: ['en_attente','diffuse','accepte','en_preparation','en_route','livre','annule'],
    default: 'en_attente',
  },
  statusHistory: [{ status: String, timestamp: { type: Date, default: Date.now }, note: String }],
  pricing: {
    subtotal:           { type: Number, default: 0 },
    deliveryFee:        { type: Number, default: 0 },
    extraFees:          { type: Number, default: 0 },
    total:              { type: Number, default: 0 },
    commission:         { type: Number, default: 0 }, // part entreprise
    driverEarning:      { type: Number, default: 0 }, // gain net livreur
    commissionPercent:  { type: Number, default: 15 },
    minSoldeRequired:   { type: Number, default: 0 }, // solde minimum requis
  },
  // Livreurs notifiés (dans rayon 2km)
  notifiedDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
  // Livreurs ayant refusé
  rejectedByDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
  // Rayon de diffusion en km
  broadcastRadius: { type: Number, default: 3 },
  // Position acceptation (pour suivi depuis début trajet)
  acceptedAt:       { type: Date, default: null },
  acceptedLocation: { lat: Number, lng: Number },
  // Trajet complet du livreur enregistré
  driverTrail: [{ lat: Number, lng: Number, timestamp: { type: Date, default: Date.now } }],
  // Commission prélevée
  commissionDeducted: { type: Boolean, default: false },
  estimatedTime: { type: Number, default: 0 },
  rating:  { score: { type: Number, min: 1, max: 5, default: null }, comment: String },
  notes:   { type: String, default: '' },
}, { timestamps: true });

orderSchema.pre('save', function(next) {
  if (this.isModified('status'))
    this.statusHistory.push({ status: this.status, timestamp: new Date() });
  next();
});

module.exports = mongoose.model('Order', orderSchema);
