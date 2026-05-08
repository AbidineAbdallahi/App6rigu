require('dotenv').config();
const mongoose = require('mongoose');
const User   = require('./models/User');
const Driver = require('./models/Driver');
const Tarif  = require('./models/Tarif');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connecté');

  // Admin
  const adminExists = await User.findOne({ email: 'admin@deliver.mr' });
  if (!adminExists) {
    await User.create({ firstName:'Admin', lastName:'Deliver', email:'admin@deliver.mr',
      phone:'+222 XX XX XX XX', password:'admin123', role:'admin' });
    console.log('✅ Admin créé  →  admin@deliver.mr / admin123');
  }

  // Tarifs par défaut
  const tarifs = [
    { serviceType:'nourriture', baseFee:150 },
    { serviceType:'courses',    baseFee:200 },
    { serviceType:'colis',      baseFee:250 },
    { serviceType:'pharmacie',  baseFee:180 },
  ];
  for (const t of tarifs) {
    await Tarif.findOneAndUpdate({ serviceType: t.serviceType }, t, { upsert:true });
  }
  console.log('✅ Tarifs par défaut créés');

  // Livreur test
  const driverUserExists = await User.findOne({ email: 'khalil@deliver.mr' });
  if (!driverUserExists) {
    const u = await User.create({ firstName:'Khalil', lastName:'Diallo', email:'khalil@deliver.mr',
      phone:'+222 36 00 00 01', password:'driver123', role:'driver' });
    await Driver.create({ user: u._id, zone:'Tevragh Zeïna', vehicleType:'moto' });
    console.log('✅ Livreur test  →  khalil@deliver.mr / driver123');
  }

  console.log('🎉 Seed terminé');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
