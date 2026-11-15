import { Router } from 'express';
import mongoose from 'mongoose';
import { auth, allow } from '../middleware/auth.js';
import { Restaurant, Ledger, PayoutRequest, Notification, AuditLog, Payment, User } from '../models/index.js';
import { addEntry } from '../services/finance.js';
import { createFeexPayout, getFeexPayoutStatus, createFeexPayin } from '../services/feexpay.js';

const r = Router();
const MIN_TOPUP = 1000;
const MIN_PAYOUT = 50;

async function walletContext(user) {
  if (user.role === 'restaurant') {
    const restaurant = await Restaurant.findOne({ owner: user._id });
    if (!restaurant) return null;
    const rows = await Ledger.aggregate([
      { $match: { accountType: { $in: ['restaurant_proceeds', 'restaurant'] }, accountId: restaurant._id, kind: { $in: ['online_credit', 'restaurant_sale_income', 'withdrawal', 'refund', 'adjustment'] }, status: { $ne: 'reversed' } } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } }
    ]);
    const credits = rows.find(x => x._id === 'credit')?.total || 0;
    const debits = rows.find(x => x._id === 'debit')?.total || 0;
    return { accountType: 'restaurant_proceeds', accountId: restaurant._id, restaurant, balance: credits - debits };
  }
  if (user.role === 'rider' || user.role === 'master') {
    const accountType = user.role;
    const kinds = user.role === 'rider' ? ['rider_earning', 'withdrawal', 'refund', 'adjustment'] : ['commission_income', 'withdrawal', 'refund', 'adjustment'];
    const rows = await Ledger.aggregate([
      { $match: { accountType, accountId: user._id, kind: { $in: kinds }, status: { $ne: 'reversed' } } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } }
    ]);
    const credits = rows.find(x => x._id === 'credit')?.total || 0;
    const debits = rows.find(x => x._id === 'debit')?.total || 0;
    return { accountType, accountId: user._id, balance: credits - debits };
  }
  return null;
}

async function reservedAmount(accountType, accountId) {
  const rows = await PayoutRequest.aggregate([
    { $match: { accountType, accountId, status: { $in: ['requested', 'approved', 'processing'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return rows[0]?.total || 0;
}

r.post('/restaurant/commission-topup', auth, allow('restaurant'), async (req, res) => {
  let payment;
  try {
    const amount = Number(req.body?.amount);
    const network = String(req.body?.network || '').toLowerCase();
    const phone = String(req.body?.phone || req.user.phone || '');
    if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP || amount > 2000000) return res.status(400).json({ error: `Recharge comprise entre ${MIN_TOPUP.toLocaleString('fr-FR')} et 2 000 000 FCFA.` });
    const restaurant = await Restaurant.findOne({ owner: req.user._id, approved: true, active: true });
    if (!restaurant) return res.status(403).json({ error: 'Restaurant non validé ou inactif.' });
    const pending = await Payment.findOne({ restaurant: restaurant._id, purpose: 'restaurant_topup', status: { $in: ['INITIATING','PENDING'] } });
    if (pending) return res.status(409).json({ error: 'Une recharge est déjà en cours. Attendez sa confirmation.' });
    const callbackInfo = `DUNU_TOPUP_${new mongoose.Types.ObjectId()}`;
    payment = await Payment.create({ purpose:'restaurant_topup', restaurant:restaurant._id, provider:'feexpay', network, amount, currency:'XOF', status:'INITIATING', raw:{ callback_info:callbackInfo } });
    const result = await createFeexPayin({ network, phone, amount, orderCode:`TOPUP_${payment._id}`, firstName:req.user.name || 'Restaurant', lastName:restaurant.name || 'DUNU' });
    if (!result.reference) throw new Error('FeexPay n’a pas retourné de référence de paiement.');
    payment.providerReference = String(result.reference);
    payment.status = 'PENDING';
    payment.raw = { ...result, callback_info: result.callback_info || `DUNU_TOPUP_${payment._id}` };
    await payment.save();
    res.status(202).json({ message:'Recharge initiée. Le portefeuille sera crédité uniquement après confirmation FeexPay.', reference:payment.providerReference, status:payment.status });
  } catch (error) {
    if (payment) { payment.status='INITIATION_FAILED'; payment.raw={...(payment.raw||{}),error:String(error.message||'Erreur FeexPay').slice(0,250)}; await payment.save().catch(()=>{}); }
    res.status(502).json({ error:error.message || 'Impossible d’initier la recharge.' });
  }
});

r.get('/restaurant/me', auth, allow('restaurant'), async (req, res) => {
  const restaurant = await Restaurant.findOne({ owner: req.user._id });
  if (!restaurant) return res.status(404).json({ error: 'Restaurant non créé' });
  const entries = await Ledger.find({ accountType: { $in:['restaurant_commission','restaurant'] }, accountId: restaurant._id, kind: { $in:['topup','cod_commission'] } }).sort({ createdAt:-1 }).limit(100);
  res.json({ walletBalance: restaurant.walletBalance, billingMode:restaurant.billingMode, minimumInitial:MIN_TOPUP, codThreshold:1000, codEnabled:restaurant.walletBalance >= 1000, entries });
});

r.get('/wallet/me', auth, allow('restaurant', 'rider', 'master'), async (req, res) => {
  const context = await walletContext(req.user);
  if (!context) return res.status(404).json({ error: 'Portefeuille introuvable.' });
  const reserved = await reservedAmount(context.accountType, context.accountId);
  const entries = await Ledger.find({ accountType: context.accountType, accountId: context.accountId }).sort({ createdAt: -1 }).limit(100);
  const requests = await PayoutRequest.find({ beneficiary: req.user._id }).sort({ createdAt: -1 }).limit(30);
  const restaurant = context.restaurant;
  res.json({ accountType: context.accountType, balance: context.balance, reserved, available: context.balance - reserved, entries, payoutRequests: requests,
    ...(restaurant ? { billingMode:restaurant.billingMode, commissionBalance:restaurant.walletBalance, commissionReserved:restaurant.walletReserved||0, commissionAvailable:Math.max(0,(restaurant.walletBalance||0)-(restaurant.walletReserved||0)), commissionMinimum:1000, canReceiveOrders:restaurant.walletBalance>=1000 } : {}) });
});

r.post('/wallet/withdraw', auth, allow('restaurant', 'rider', 'master'), async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const phoneNumber = String(req.body?.phoneNumber || req.user.phone || '').replace(/[^0-9]/g, '');
    const network = String(req.body?.network || '').trim().toUpperCase();
    if (!Number.isSafeInteger(amount) || amount < MIN_PAYOUT) return res.status(400).json({ error: 'Montant minimum de reversement : 50 FCFA.' });
    if (!/^22901[0-9]{8}$/.test(phoneNumber)) return res.status(400).json({ error: 'Numéro Mobile Money béninois invalide.' });
    if (!['MTN', 'MOOV', 'CELTIIS BJ'].includes(network)) return res.status(400).json({ error: 'Choisissez MTN, MOOV ou CELTIIS.' });
    const context = await walletContext(req.user);
    if (!context) return res.status(404).json({ error: 'Portefeuille introuvable.' });
    const reserved = await reservedAmount(context.accountType, context.accountId);
    if (amount > context.balance - reserved) return res.status(409).json({ error: 'Solde disponible insuffisant.' });
    const callbackInfo = `DUNU_PAYOUT_${new mongoose.Types.ObjectId().toString()}`;
    const payout = await PayoutRequest.create({
      beneficiary: req.user._id, accountType: context.accountType, accountId: context.accountId,
      ...(context.restaurant ? { restaurant: context.restaurant._id } : {}),
      amount, phoneNumber, network, callbackInfo
    });
    const admins = await (await import('../models/index.js')).User.find({ role: 'admin', status: 'active' }).select('_id');
    const notices = await Notification.insertMany(admins.map(a => ({
      user: a._id, type: 'finance', title: 'Nouvelle demande de reversement',
      body: `${req.user.name} demande ${amount.toLocaleString('fr-FR')} FCFA.`,
      link: '/dashboard', metadata: { payoutId: String(payout._id) }
    })));
    const io = req.app.get('io');
    for (const n of notices) io?.to(`user:${n.user}`).emit('notification:new', n);
    res.status(201).json({ message: 'Demande transmise à l’administration nationale pour validation.', payout });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Impossible de créer la demande.' });
  }
});

r.get('/admin/payouts', auth, allow('admin'), async (_req, res) => {
  const rows = await PayoutRequest.find().populate('beneficiary', 'name phone email role city').populate('restaurant', 'name city').populate('reviewedBy', 'name').sort({ createdAt: -1 }).limit(500);
  // Dans la liste opérationnelle, une tentative remplacée ne doit plus apparaître :
  // dès qu'une nouvelle demande (retryOf) existe, on affiche uniquement la plus récente.
  // L'ancienne demande annulée reste conservée en base pour l'audit et la traçabilité.
  const supersededIds = new Set(rows.filter(row => row.retryOf).map(row => String(row.retryOf)));
  const currentRows = rows.filter(row => !(row.status === 'cancelled' && supersededIds.has(String(row._id))));
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate').set('Pragma', 'no-cache').set('Expires', '0');
  res.json(currentRows);
});

r.patch('/admin/payouts/:id/approve', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Demande invalide.' });
  const payout = await PayoutRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'requested' },
    { $set: { status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date() } },
    { new: true }
  );
  if (!payout) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée.' });
  try {
    const result = await createFeexPayout({
      network: payout.network, phone: payout.phoneNumber, amount: payout.amount,
      callbackInfo: payout.callbackInfo, motif: `DUNU ${payout.accountType}`
    });
    if (!result.reference) throw new Error('FeexPay n’a pas retourné de référence de reversement.');
    payout.providerReference = String(result.reference);
    payout.providerRaw = result;
    payout.status = String(result.status || '').toUpperCase() === 'FAILED' ? 'FAILED' : 'processing';
    await payout.save();
    await AuditLog.create({ actor: req.user._id, actorRole: req.user.role, action: 'payout.initiated', targetType: 'PayoutRequest', targetId: String(payout._id), details: { amount: payout.amount, network: payout.network, providerReference: payout.providerReference } });
    res.status(202).json({ message: 'Demande envoyée à FeexPay. Le statut final doit être vérifié.', payout });
  } catch (error) {
    // A timeout can happen after FeexPay accepted the transfer. Keep the request reserved
    // and in an indeterminate processing state until the provider status is checked.
    payout.status = 'processing';
    payout.failureReason = `Vérification nécessaire : ${String(error.message || 'réponse FeexPay incertaine').slice(0, 240)}`;
    await payout.save();
    res.status(202).json({ error: payout.failureReason, payout });
  }
});

async function reconcilePayout(payout, providerStatus, actorId) {
  const status = String(providerStatus.status || '').toUpperCase();
  if (status === 'PENDING' || status === 'IN PENDING STATE') return { status: 'processing' };
  if (!['SUCCESSFUL', 'FAILED'].includes(status)) throw new Error('Statut Payout FeexPay non reconnu.');
  if (Number(providerStatus.amount) !== Number(payout.amount)) throw new Error('Le montant confirmé par FeexPay ne correspond pas à la demande.');
  const providerPhone = String(providerStatus.phoneNumber || providerStatus.phone_number || '').replace(/[^0-9]/g, '');
  if (providerPhone && providerPhone !== payout.phoneNumber) throw new Error('Le numéro confirmé par FeexPay ne correspond pas au bénéficiaire.');
  if (payout.status === 'SUCCESSFUL' || payout.status === 'FAILED') return { status: payout.status, duplicate: true };
  if (status === 'SUCCESSFUL') {
    const ref = `PAYOUT-${payout._id}`;
    try {
      await addEntry({
        accountType: payout.accountType, accountId: payout.accountId, kind: 'withdrawal',
        direction: 'debit', amount: payout.amount, reference: ref,
        description: `Reversement FeexPay ${payout.providerReference}`
      });
    } catch (error) {
      // The unique ledger reference makes concurrent/retried status checks idempotent.
      if (error?.code !== 11000) throw error;
    }
    payout.status = 'SUCCESSFUL';
    payout.completedAt = new Date();
  } else {
    payout.status = 'FAILED';
    payout.failureReason = String(providerStatus.reason || providerStatus.responsemsg || 'Reversement refusé par FeexPay').slice(0, 300);
  }
  payout.providerRaw = providerStatus;
  await payout.save();
  return { status: payout.status };
}

async function refreshPayoutStatus(req, res) {
  // Cette réponse contient un état financier temps réel : elle ne doit jamais être réutilisée depuis le cache HTTP.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate').set('Pragma', 'no-cache').set('Expires', '0');
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Demande invalide.' });
    const payout = await PayoutRequest.findById(req.params.id);
    if (!payout) return res.status(404).json({ error: 'Demande introuvable.' });
    if (!payout.providerReference) return res.json({ status: payout.status, message: 'Aucune référence FeexPay.' });
    if (['SUCCESSFUL', 'FAILED', 'rejected'].includes(payout.status)) return res.json({ status: payout.status, payout });
    const providerStatus = await getFeexPayoutStatus(payout.providerReference);
    const result = await reconcilePayout(payout, providerStatus, req.user._id);
    return res.status(200).json({ ...result, payout: await PayoutRequest.findById(payout._id) });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Vérification du reversement impossible.' });
  }
}

// POST évite les réponses conditionnelles 304 lors d'une vérification manuelle depuis le navigateur.
r.post('/admin/payouts/:id/status/refresh', auth, allow('admin'), refreshPayoutStatus);
// Ancienne route conservée pour compatibilité avec les anciennes versions du client.
r.get('/admin/payouts/:id/status', auth, allow('admin'), refreshPayoutStatus);

// Annulation exceptionnelle d'une demande sans référence FeexPay.
// L'administrateur doit avoir vérifié manuellement dans FeexPay qu'aucun transfert n'a été exécuté.
r.patch('/admin/payouts/:id/cancel-unreferenced', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Demande invalide.' });
  if (String(req.body?.confirmation || '') !== 'AUCUN VERSEMENT FEEXPAY') {
    return res.status(400).json({ error: 'Confirmation explicite requise.' });
  }
  const payout = await PayoutRequest.findOne({ _id: req.params.id, status: { $in: ['approved', 'processing'] }, providerReference: { $exists: false } });
  if (!payout || payout.providerReference) return res.status(409).json({ error: 'Annulation impossible : demande introuvable, déjà traitée ou référence FeexPay présente.' });
  payout.status = 'cancelled';
  payout.cancelledAt = new Date();
  payout.cancelledBy = req.user._id;
  payout.cancellationReason = 'Annulation administrative après vérification manuelle FeexPay : aucun transfert exécuté.';
  payout.failureReason = payout.cancellationReason;
  await payout.save();
  await AuditLog.create({ actor: req.user._id, actorRole: req.user.role, action: 'payout.cancelled_unreferenced', targetType: 'PayoutRequest', targetId: String(payout._id), details: { amount: payout.amount, network: payout.network, phoneNumber: payout.phoneNumber } });
  res.json({ status: payout.status, payout, message: 'Demande annulée. Elle reste conservée dans l’historique.' });
});

// Nouvelle demande distincte, uniquement à partir d'une demande annulée sans référence fournisseur.
r.post('/admin/payouts/:id/retry', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Demande invalide.' });
  const original = await PayoutRequest.findOne({ _id: req.params.id, status: 'cancelled', providerReference: { $exists: false } });
  if (!original || original.providerReference) return res.status(409).json({ error: 'Seule une demande annulée sans référence FeexPay peut être reprise.' });
  const existingRetry = await PayoutRequest.findOne({ retryOf: original._id });
  if (existingRetry) return res.status(409).json({ error: 'Une nouvelle tentative existe déjà pour cette demande.', payout: existingRetry });
  const retry = await PayoutRequest.create({
    beneficiary: original.beneficiary, accountType: original.accountType, accountId: original.accountId,
    ...(original.restaurant ? { restaurant: original.restaurant } : {}),
    amount: original.amount, phoneNumber: original.phoneNumber, network: original.network,
    callbackInfo: `DUNU_PAYOUT_RETRY_${new mongoose.Types.ObjectId()}`, retryOf: original._id,
    status: 'requested'
  });
  await AuditLog.create({ actor: req.user._id, actorRole: req.user.role, action: 'payout.retry_created', targetType: 'PayoutRequest', targetId: String(retry._id), details: { originalPayoutId: String(original._id), amount: retry.amount } });
  res.status(201).json({ message: 'Nouvelle demande créée. Elle doit être validée avant tout nouvel envoi à FeexPay.', payout: retry });
});

r.patch('/admin/payouts/:id/reject', auth, allow('admin'), async (req, res) => {
  const payout = await PayoutRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'requested' },
    { $set: { status: 'rejected', reviewedBy: req.user._id, reviewedAt: new Date(), failureReason: String(req.body?.reason || 'Demande refusée').slice(0, 300) } },
    { new: true }
  );
  if (!payout) return res.status(409).json({ error: 'Demande introuvable ou déjà traitée.' });
  res.json({ status: payout.status, payout });
});

r.get('/admin/ledger', auth, allow('admin', 'finance'), async (_req, res) => res.json(await Ledger.find().sort({ createdAt: -1 }).limit(500).populate('order', 'code')));

r.patch('/admin/ledger/:id/assign-master', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.body?.masterId)) {
    return res.status(400).json({ error: 'Écriture ou compte Master invalide.' });
  }
  const entry = await Ledger.findOne({ _id: req.params.id, accountType: 'master', status: 'pending', $or: [{ accountId: { $exists: false } }, { accountId: null }] });
  if (!entry) return res.status(409).json({ error: 'Cette part Master n’est plus en attente d’affectation.' });
  const city = String(entry.beneficiaryCity || '').trim();
  const master = await User.findOne({
    _id: req.body.masterId, role: 'master', status: 'active',
    $or: [{ city }, { masterCities: city }]
  }).select('_id name');
  if (!master) return res.status(400).json({ error: 'Ce Master actif ne couvre pas la ville de cette livraison.' });
  const updated = await Ledger.findOneAndUpdate(
    { _id: entry._id, accountType: 'master', status: 'pending', $or: [{ accountId: { $exists: false } }, { accountId: null }] },
    { $set: { accountId: master._id, status: 'available', description: `Part Master (3 %) · ${city} · affectée à ${master.name} · ${entry.description || ''}` } },
    { new: true }
  );
  if (!updated) return res.status(409).json({ error: 'Cette écriture vient d’être affectée par une autre opération.' });
  await AuditLog.create({ actor: req.user._id, actorRole: req.user.role, action: 'delivery_master_share.assigned', targetType: 'Ledger', targetId: String(updated._id), city, details: { masterId: String(master._id), amount: updated.amount, reference: updated.reference } });
  res.json({ entry: updated, master: { id: master._id, name: master.name } });
});

r.post('/admin/restaurant-credit', auth, allow('admin', 'finance'), async (req, res) => {
  const { restaurantId, amount, reference } = req.body || {};
  const n = Number(amount);
  if (!Number.isSafeInteger(n) || n <= 0 || !reference) return res.status(400).json({ error: 'Montant et référence obligatoires.' });
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable.' });
  const session = await mongoose.startSession();
  let updatedBalance = restaurant.walletBalance;
  try {
    await session.withTransaction(async () => {
      const exists = await Ledger.findOne({ reference }).session(session);
      if (exists) throw Object.assign(new Error('Référence déjà utilisée.'), { statusCode: 409 });
      await addEntry({ accountType:'restaurant_commission', accountId:restaurant._id, kind:'topup', direction:'credit', amount:n, reference, description:'Recharge vérifiée par le service financier' }, session);
      const updated = await Restaurant.findOneAndUpdate({ _id:restaurant._id }, { $inc:{ walletBalance:n } }, { new:true, session });
      if (!updated) throw new Error('Restaurant introuvable pendant le crédit.');
      updatedBalance = updated.walletBalance;
      await AuditLog.create([{ actor:req.user._id, actorRole:req.user.role, action:'restaurant.wallet.topup.manual', targetType:'Restaurant', targetId:String(restaurant._id), restaurant:restaurant._id, details:{ amount:n, reference } }], { session });
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error:'Référence déjà utilisée.' });
    return res.status(error.statusCode || 400).json({ error:error.message || 'Crédit du portefeuille impossible.' });
  } finally { await session.endSession(); }
  res.json({ walletBalance: updatedBalance });
});

export default r;
