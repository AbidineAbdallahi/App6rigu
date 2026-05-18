const mongoose = require('mongoose');

// Document singleton — un seul enregistrement existe toujours
const settingsSchema = new mongoose.Schema({
  referralEnabled:     { type: Boolean, default: true  },
  referralClientBonus: { type: Number,  default: 500   }, // MRU offerts au client
  referralDriverBonus: { type: Number,  default: 500   }, // MRU offerts au livreur
  referralStartDate:   { type: Date,    default: null  }, // null = pas de limite
  referralEndDate:     { type: Date,    default: null  }, // null = pas de limite
}, { timestamps: true });

// Helper statique : retourne les settings (crée si inexistant)
settingsSchema.statics.get = async function () {
  let s = await this.findOne();
  if (!s) s = await this.create({});
  return s;
};

module.exports = mongoose.model('Settings', settingsSchema);
