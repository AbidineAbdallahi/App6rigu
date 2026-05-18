const Settings = require('../models/Settings');

// Vérifie si le parrainage est actif en ce moment (flag + dates de campagne)
async function isReferralActive() {
  try {
    const s = await Settings.get();
    if (!s.referralEnabled) return false;
    const now = new Date();
    if (s.referralStartDate && now < s.referralStartDate) return false;
    if (s.referralEndDate   && now > s.referralEndDate)   return false;
    return true;
  } catch { return false; }
}

// Retourne les bonus configurés
async function getReferralBonus() {
  try {
    const s = await Settings.get();
    return { client: s.referralClientBonus ?? 500, driver: s.referralDriverBonus ?? 500 };
  } catch { return { client: 500, driver: 500 }; }
}

module.exports = { isReferralActive, getReferralBonus };
