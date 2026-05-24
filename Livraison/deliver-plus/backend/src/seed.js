require('dotenv').config();
const mongoose = require('mongoose');
const User   = require('./models/User');
const Driver = require('./models/Driver');
const Tarif  = require('./models/Tarif');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connecté à', process.env.MONGODB_URI);

  // Admin
  const adminExists = await User.findOne({ email: 'admin@amnir.mr' });
  if (!adminExists) {
    await User.create({ firstName:'Admin', lastName:'Amnir', email:'admin@amnir.mr',
      phone:'+222 00 00 00 01', password:'admin123', role:'admin' });
    console.log('✅ Admin créé  →  admin@amnir.mr / admin123');
  } else {
    console.log('ℹ️  Admin déjà existant');
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
  const driverUserExists = await User.findOne({ email: 'driver@amnir.mr' });
  if (!driverUserExists) {
    const u = await User.create({ firstName:'Khalil', lastName:'Diallo', email:'driver@amnir.mr',
      phone:'+222 36 00 00 02', password:'driver123', role:'driver' });
    await Driver.create({ user: u._id, zone:'Tevragh Zeïna', vehicleType:'moto' });
    console.log('✅ Livreur test  →  driver@amnir.mr / driver123');
  } else {
    console.log('ℹ️  Livreur test déjà existant');
  }

  console.log('🎉 Seed terminé');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
