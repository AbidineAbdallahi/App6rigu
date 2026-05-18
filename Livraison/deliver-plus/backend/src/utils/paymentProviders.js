const SANDBOX = process.env.PAYMENT_SANDBOX !== 'false';

async function initiateBankilyPayment({ amount, phone, reference }) {
  if (SANDBOX) {
    return { success: true, providerRef: `BANKILY-SANDBOX-${Date.now()}`, sandbox: true };
  }
  // TODO: replace with real Bankily API call when credentials available
  // const axios = require('axios');
  // const response = await axios.post('https://api.bankily.mr/v1/collect', {
  //   amount, phone, reference,
  //   apiKey: process.env.BANKILY_API_KEY,
  // });
  // return { success: response.data.success, providerRef: response.data.transactionId };
  throw new Error('Bankily API non configurée — activez le mode sandbox.');
}

async function initiateMasriviPayment({ amount, phone, reference }) {
  if (SANDBOX) {
    return { success: true, providerRef: `MASRIVI-SANDBOX-${Date.now()}`, sandbox: true };
  }
  // TODO: replace with real Masrivi API call when credentials available
  // const axios = require('axios');
  // const response = await axios.post('https://api.masrivi.mr/v1/debit', {
  //   amount, phone, reference,
  //   merchantId: process.env.MASRIVI_MERCHANT_ID,
  //   secretKey:  process.env.MASRIVI_SECRET_KEY,
  // });
  // return { success: response.data.success, providerRef: response.data.paymentRef };
  throw new Error('Masrivi API non configurée — activez le mode sandbox.');
}

module.exports = { initiateBankilyPayment, initiateMasriviPayment, SANDBOX };
