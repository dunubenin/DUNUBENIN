import { config } from '../config.js';

const NETWORK_PATHS = Object.freeze({
  mtn: '/api/transactions/public/requesttopay/mtn',
  moov: '/api/transactions/public/requesttopay/moov',
  celtiis: '/api/transactions/public/requesttopay/celtiis_bj'
});

export async function feexpayRequest(path, body) {
  if (!config.feexpay.apiKey || !config.feexpay.shopId) {
    throw new Error('Configuration FeexPay incomplète (API KEY ou SHOP ID)');
  }
  const response = await fetch(`${config.feexpay.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.feexpay.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...body, shop: config.feexpay.shopId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.error || `Erreur FeexPay (${response.status})`;
    throw new Error(String(message).slice(0, 240));
  }
  return data;
}

export async function createFeexPayin({ network, phone, amount, orderCode, firstName = 'Client', lastName = 'DUNU' }) {
  const path = NETWORK_PATHS[String(network || '').toLowerCase()];
  if (!path) throw new Error('Opérateur non pris en charge. Choisissez MTN, Moov ou Celtiis.');
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!/^22901[0-9]{8}$/.test(digits)) throw new Error('Utilisez un numéro béninois au format 22901XXXXXXXX.');
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 100 || value > 2000000) throw new Error('Le montant doit être compris entre 100 et 2 000 000 FCFA.');
  return feexpayRequest(path, {
    phoneNumber: digits,
    amount: value,
    callback_info: `DUNU_${orderCode}`,
    description: `Commande DUNU ${orderCode}`.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40),
    first_name: String(firstName).slice(0, 60),
    last_name: String(lastName).slice(0, 60)
  });
}

export async function getFeexPayStatus(reference) {
  if (!config.feexpay.apiKey) throw new Error('FEEXPAY_API_KEY manquant');
  const response = await fetch(`${config.feexpay.baseUrl}/api/transactions/public/single/status/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.feexpay.apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Erreur vérification FeexPay (${response.status})`);
  return data;
}


const PAYOUT_PATHS = Object.freeze({
  MTN: '/api/payouts/public/transfer/global',
  MOOV: '/api/payouts/public/transfer/global',
  'CELTIIS BJ': '/api/payouts/public/celtiis_bj'
});

export async function createFeexPayout({ network, phone, amount, callbackInfo, motif = 'DUNU Reversement' }) {
  const normalizedNetwork = String(network || '').trim().toUpperCase();
  const path = PAYOUT_PATHS[normalizedNetwork];
  if (!path) throw new Error('Réseau de reversement non pris en charge.');
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!/^22901[0-9]{8}$/.test(digits)) throw new Error('Numéro béninois invalide. Format attendu : 22901XXXXXXXX.');
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 50 || value > 2000000) throw new Error('Le reversement doit être compris entre 50 et 2 000 000 FCFA.');
  const cleanMotif = String(motif).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'DUNU Reversement';
  const networkValue = normalizedNetwork === 'CELTIIS BJ' ? 'CELTIIS BJ' : normalizedNetwork;
  return feexpayRequest(path, {
    phoneNumber: digits,
    amount: value,
    network: networkValue,
    motif: cleanMotif,
    callback_info: String(callbackInfo || '').slice(0, 100)
  });
}

export async function getFeexPayoutStatus(reference) {
  if (!config.feexpay.apiKey) throw new Error('FEEXPAY_API_KEY manquant');
  const response = await fetch(`${config.feexpay.baseUrl}/api/payouts/status/public/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.feexpay.apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Erreur statut Payout FeexPay (${response.status})`);
  return data;
}
