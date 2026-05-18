const admin = require('firebase-admin');
const serviceAccount = require('./amder-157e9-firebase-adminsdk-fbsvc-399dddb9b4.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
