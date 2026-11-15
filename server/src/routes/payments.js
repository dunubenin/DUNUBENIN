import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { auth, allow } from '../middleware/auth.js';
import { Order, Payment, Notification, WebhookDelivery, Restaurant, SubscriptionRequest, User } from '../models/index.js';
import { addEntry, recordOnlineRestaurantRevenueShares } from '../services/finance.js';
import { createFeexPayin, getFeexPayStatus } from '../services/feexpay.js';
import { config } from '../config.js';

const r = Router();

async function notifyMastersForOrder(order, io, title, body) {
  if (!order?.restaurant) return;
  const restaurant = await Restaurant.findById(order.restaurant).select('city').lean();
  if (!restaurant?.city) return;
  const masters = await User.find({
    role: 'master', status: 'active', deletedAt: null,
    $or: [{ city: restaurant.city }, { masterCities: restaurant.city }]
  }).select('_id').lean();
  for (const master of masters) {
    const notification = await Notification.create({
      user: master._id, type: 'order', title,
      body, link: '/dashboard', metadata: { orderCode: order.code }
    });
    io?.to(`user:${master._id}`).emit('notification:new', notification);
    io?.to(`user:${master._id}`).emit('order:new', { order: { _id: order._id, code: order.code, paymentStatus: order.paymentStatus } });
  }
}

function verifyFeexPaySignature(rawBody, headers) {
  const secret = config.feexpay.webhookSecret;
  const timestamp = headers['x-feexpay-timestamp'];
  const deliveryId = headers['x-feexpay-delivery-id'];
  const signatureHeader = headers['x-feexpay-signature'];
  if (!secret || !Buffer.isBuffer(rawBody) || !timestamp || !/^\d+$/.test(String(timestamp)) || !deliveryId || !signatureHeader) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${deliveryId}.`).update(rawBody).digest('hex');
  return String(signatureHeader).split(',').some(part => {
    const [version, value] = part.trim().split('=');
    if (version !== 'v1' || !value || !/^[a-f0-9]{64}$/i.test(value)) return false;
    const a = Buffer.from(value.toLowerCase(), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

async function applyFinalPayment({ reference, status, amount, callbackInfo, raw, deliveryId, event }, req) {
  const normalized = String(status || '').toUpperCase();
  if (!['SUCCESSFUL', 'FAILED'].includes(normalized)) return { ignored: true };
  const payment = await Payment.findOne({ provider: 'feexpay', providerReference: reference });
  if (!payment) throw new Error('Référence FeexPay inconnue');
  if (Number(amount) !== Number(payment.amount)) throw new Error('Montant FeexPay différent du montant attendu');

  if (payment.purpose && payment.purpose !== 'order') {
    const expectedCallback = payment.raw?.callback_info || payment.raw?.callbackInfo;
    if (callbackInfo && expectedCallback && callbackInfo !== expectedCallback) throw new Error('Référence de paiement incorrecte');
    const session = await mongoose.startSession();
    let result = {};
    try {
      await session.withTransaction(async () => {
        const current = await Payment.findById(payment._id).session(session);
        if (!current) throw new Error('Paiement introuvable.');
        if (['SUCCESSFUL', 'FAILED'].includes(current.status)) {
          result = { duplicate:true, purpose:current.purpose };
          return;
        }
        if (normalized === 'FAILED') {
          current.status = 'FAILED';
          current.raw = { ...(current.raw || {}), finalProviderResponse:raw };
          await current.save({ session });
          if (current.purpose === 'subscription' && current.subscriptionRequest) {
            await SubscriptionRequest.updateOne({ _id:current.subscriptionRequest, status:'pending' }, { $set:{ status:'rejected', note:'Paiement FeexPay échoué.' } }, { session });
          }
          result = { failed:true, purpose:current.purpose };
          return;
        }
        if (current.purpose === 'restaurant_topup') {
          const ref = `TOPUP-${current._id}`;
          await addEntry({
            accountType:'restaurant_commission', accountId:current.restaurant,
            kind:'topup', direction:'credit', amount:current.amount,
            reference:ref, description:'Recharge portefeuille commissions via FeexPay'
          }, session);
          await Restaurant.updateOne({ _id:current.restaurant }, { $inc:{ walletBalance:current.amount } }, { session });
        } else if (current.purpose === 'subscription') {
          const request = await SubscriptionRequest.findById(current.subscriptionRequest).session(session);
          if (!request) throw new Error('Demande d’abonnement introuvable.');
          if (request.status !== 'paid') {
            const restaurant = await Restaurant.findById(current.restaurant).session(session);
            if (!restaurant) throw new Error('Restaurant introuvable.');
            const now = new Date();
            const expiry = restaurant.subscription?.expiresAt;
            const startsAt = expiry && expiry > now ? expiry : now;
            restaurant.subscription = { plan:request.plan, expiresAt:new Date(startsAt.getTime()+30*86400000) };
            restaurant.billingMode = 'subscription';
            await restaurant.save({ session });
            request.status = 'paid';
            request.paymentReference = String(reference);
            request.processedAt = new Date();
            await request.save({ session });
          }
        } else {
          throw new Error('Type de paiement restaurant inconnu.');
        }
        current.status = 'SUCCESSFUL';
        current.raw = { ...(current.raw || {}), finalProviderResponse:raw };
        await current.save({ session });
        result = { paid:true, purpose:current.purpose };
      });
    } finally {
      await session.endSession();
    }
    if (result.paid && result.purpose === 'restaurant_topup') {
      const restaurant = await Restaurant.findById(payment.restaurant).select('owner name walletBalance');
      if (restaurant?.owner) {
        const notification = await Notification.create({
          user: restaurant.owner, type: 'finance', title: 'Recharge Commission confirmée',
          body: `Le portefeuille Commission de ${restaurant.name} a été crédité de ${Number(payment.amount).toLocaleString('fr-FR')} FCFA.`,
          link: '/dashboard', metadata: { purpose: 'restaurant_topup', amount: payment.amount }
        });
        req.app.get('io')?.to(`user:${notification.user}`).emit('notification:new', notification);
      }
    }
    return result;
  }

  const order = await Order.findById(payment.order);
  if (!order) throw new Error('Commande associée introuvable');
  if (Number(amount) !== Number(order.total)) throw new Error('Montant FeexPay différent du montant de la commande');
  if (callbackInfo && callbackInfo !== `DUNU_${order.code}`) throw new Error('Référence de commande incorrecte');

  const session = await mongoose.startSession();
  let paymentResult = {};
  try {
    await session.withTransaction(async () => {
      const currentPayment = await Payment.findById(payment._id).session(session);
      const currentOrder = await Order.findById(order._id).session(session);
      if (!currentPayment || !currentOrder) throw new Error('Paiement ou commande introuvable.');
      if (['SUCCESSFUL', 'FAILED'].includes(currentPayment.status) || currentOrder.paymentStatus === 'paid') {
        paymentResult = { duplicate: true, orderCode: currentOrder.code };
        return;
      }
      if (normalized === 'SUCCESSFUL') {
        if (!['pending','failed'].includes(currentOrder.paymentStatus) || currentOrder.status === 'cancelled') throw new Error('Commande non payable');
        currentOrder.paymentStatus = 'paid';
        // Pour les nouvelles commandes, les 10 % sont prélevés directement
        // sur le paiement en ligne ; le portefeuille Commission n'est pas touché.
        if (currentOrder.revenueSplitVersion === '90-3-7-v2') {
          await recordOnlineRestaurantRevenueShares(currentOrder, session);
        }
      } else {
        currentOrder.paymentStatus = 'failed';
      }
      currentPayment.status = normalized;
      currentPayment.raw = raw;
      await currentPayment.save({ session });
      await currentOrder.save({ session });
      paymentResult = normalized === 'SUCCESSFUL'
        ? { paid: true, orderCode: currentOrder.code }
        : { failed: true, orderCode: currentOrder.code };
    });
  } finally {
    await session.endSession();
  }
  if (paymentResult.duplicate) return paymentResult;
  if (normalized === 'FAILED') {
    const populated = await Order.findById(order._id).populate('restaurant', 'owner');
    const io=req.app.get('io');
    io?.to(`user:${populated?.restaurant?.owner}`).emit('order:payment-failed',{order:populated});
    io?.to('role:admin').emit('order:payment-failed',{order:populated});
    if(populated?.restaurant?.owner){const n=await Notification.create({user:populated.restaurant.owner,type:'order',title:'Paiement client échoué',body:`La commande ${order.code} est visible. Vous pouvez contacter le client dans DUNU, mais la préparation reste bloquée tant que le paiement n’est pas confirmé.`,link:'/dashboard',metadata:{orderCode:order.code}});io?.to(`user:${n.user}`).emit('notification:new',n);}
    await notifyMastersForOrder(order,io,'Paiement client échoué',`La commande ${order.code} de votre territoire nécessite une assistance. Contactez le client depuis DUNU ; aucune préparation n'est autorisée avant confirmation du paiement.`);
  }
  if (normalized === 'SUCCESSFUL') {
    const populated = await Order.findById(order._id).populate('restaurant', 'owner');
    const io = req.app.get('io');
    io?.to(`order:${order.code}`).emit('payment:completed', { code: order.code });
    io?.to(`user:${populated?.restaurant?.owner}`).emit('order:new', { order: populated });
    io?.to('role:admin').emit('order:new', { order: populated });
    if (populated?.restaurant?.owner) {
      const notification = await Notification.create({ user: populated.restaurant.owner, type: 'order', title: 'Commande payée reçue', body: `Le paiement de la commande ${order.code} est confirmé.`, link: '/dashboard', metadata: { orderCode: order.code } });
      io?.to(`user:${notification.user}`).emit('notification:new', notification);
    }
    await notifyMastersForOrder(order,io,'Paiement confirmé',`Le paiement de la commande ${order.code} est confirmé. La commande peut suivre son traitement normal.`);
  }
  return paymentResult;
}

r.post('/feexpay/deposit', auth, allow('client'), async (req, res) => {
  let payment;
  try {
    const { orderId, phone, network } = req.body || {};
    if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ error: 'Commande invalide' });
    const order = await Order.findOne({ _id: orderId, customer: req.user._id, paymentMethod: 'mobile_money' });
    if (!order) return res.status(404).json({ error: 'Commande Mobile Money introuvable' });
    if (order.paymentStatus === 'paid' || order.status === 'cancelled') return res.status(409).json({ error: 'Cette commande ne peut plus être payée' });
    if (order.isIntercity && order.paymentMethod !== 'mobile_money') return res.status(409).json({ error: 'Le paiement en ligne est obligatoire pour cette commande interurbaine.' });
    const pending = await Payment.findOne({ order: order._id, provider: 'feexpay', status: { $in: ['INITIATING', 'CREATED', 'PENDING'] } });
    if (pending) return res.status(409).json({ error: 'Une demande de paiement est déjà en cours pour cette commande.', reference: pending.providerReference });

    payment = await Payment.create({ order: order._id, provider: 'feexpay', network, amount: order.total, currency: 'XOF', status: 'INITIATING' });
    const result = await createFeexPayin({ network, phone, amount: order.total, orderCode: order.code, firstName: req.user.name || 'Client' });
    if (!result.reference) throw new Error('FeexPay n’a pas retourné de référence de transaction');
    payment.providerReference = String(result.reference);
    // Keep the local record pending until the shared finalization routine validates
    // the provider's initial response (some providers may answer with a final state).
    payment.status = 'PENDING';
    payment.raw = result;
    await payment.save();

    const initialStatus = String(result.status || '').toUpperCase();
    if (['SUCCESSFUL', 'FAILED'].includes(initialStatus)) {
      await applyFinalPayment({
        reference: payment.providerReference,
        status: initialStatus,
        amount: result.amount ?? order.total,
        callbackInfo: result.callback_info || `DUNU_${order.code}`,
        raw: result
      }, req);
    }
    const latestPayment = await Payment.findById(payment._id);
    res.status(202).json({ reference: payment.providerReference, status: latestPayment?.status || payment.status, message: result.message || 'Demande de paiement transmise à FeexPay.' });
  } catch (error) {
    if (payment) {
      payment.status = 'INITIATION_FAILED';
      payment.raw = { error: String(error.message || 'Erreur fournisseur').slice(0, 300) };
      await payment.save().catch(() => {});
      const failedOrder=await Order.findById(payment.order).populate('restaurant','owner').catch(()=>null);
      if(failedOrder && failedOrder.paymentStatus!=='paid'){
        failedOrder.paymentStatus='failed'; await failedOrder.save().catch(()=>{});
        const io=req.app.get('io');
        io?.to(`user:${failedOrder.restaurant?.owner}`).emit('order:payment-failed',{order:failedOrder});
        io?.to('role:admin').emit('order:payment-failed',{order:failedOrder});
        if(failedOrder.restaurant?.owner){const n=await Notification.create({user:failedOrder.restaurant.owner,type:'order',title:'Paiement client impossible',body:`La demande Mobile Money de ${failedOrder.code} n’a pas pu être initiée. Vous pouvez joindre le client dans DUNU ; la préparation reste bloquée.`,link:'/dashboard',metadata:{orderCode:failedOrder.code}}).catch(()=>null);if(n)io?.to(`user:${n.user}`).emit('notification:new',n);}
        await notifyMastersForOrder(failedOrder,io,'Paiement client impossible',`La demande Mobile Money de ${failedOrder.code} n'a pas pu être initiée. Vous pouvez contacter le client dans DUNU pour l'aider.`).catch(error=>console.error('Notification Master paiement échoué:',error.message));
      }
    }
    res.status(502).json({ error: error.message || 'Impossible d’initier le paiement FeexPay' });
  }
});

r.get('/feexpay/:reference/status', auth, allow('client','restaurant'), async (req, res) => {
  try {
    const payment = await Payment.findOne({ provider: 'feexpay', providerReference: req.params.reference }).populate('order');
    if (!payment) return res.sendStatus(404);
    if (payment.purpose && payment.purpose !== 'order') {
      const restaurant = await Restaurant.findOne({ owner:req.user._id }).select('_id');
      if (req.user.role !== 'restaurant' || String(restaurant?._id) !== String(payment.restaurant)) return res.sendStatus(404);
      if (['SUCCESSFUL','FAILED'].includes(payment.status)) return res.json({ status:payment.status, purpose:payment.purpose });
      const statusResult = await getFeexPayStatus(payment.providerReference);
      const finalStatus = String(statusResult.status || '').toUpperCase();
      if (['SUCCESSFUL','FAILED'].includes(finalStatus)) {
        await applyFinalPayment({ reference:payment.providerReference, status:finalStatus, amount:statusResult.amount ?? payment.amount, callbackInfo:statusResult.callback_info, raw:statusResult }, req);
        return res.json({ status:finalStatus, purpose:payment.purpose });
      }
      return res.json({ status:'PENDING', purpose:payment.purpose });
    }
    if (req.user.role !== 'client' || String(payment.order?.customer) !== String(req.user._id)) return res.sendStatus(404);
    if (['SUCCESSFUL', 'FAILED'].includes(payment.status)) return res.json({ status: payment.status, orderCode: payment.order.code });
    const statusResult = await getFeexPayStatus(payment.providerReference);
    const finalStatus = String(statusResult.status || '').toUpperCase();
    if (['SUCCESSFUL', 'FAILED'].includes(finalStatus)) {
      await applyFinalPayment({ reference: payment.providerReference, status: finalStatus, amount: statusResult.amount ?? payment.amount, callbackInfo: statusResult.callback_info || `DUNU_${payment.order.code}`, raw: statusResult }, req);
      return res.json({ status: finalStatus, orderCode: payment.order.code });
    }
    res.json({ status: 'PENDING', orderCode: payment.order.code });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Vérification FeexPay impossible' });
  }
});

// Mounted before express.json(): FeexPay HMAC requires the exact raw request bytes.
r.post('/feexpay', async (req, res) => {
  if (!verifyFeexPaySignature(req.body, req.headers)) return res.status(401).send('Invalid signature');
  const deliveryId = req.headers['x-feexpay-delivery-id'];
  try {
    if (await WebhookDelivery.exists({ deliveryId })) return res.sendStatus(200);
    const event = JSON.parse(req.body.toString('utf8'));
    const result = await applyFinalPayment({
      reference: event.reference,
      status: event.status,
      amount: event.amount,
      callbackInfo: event.callback_info,
      raw: event,
      deliveryId,
      event: req.headers['x-feexpay-event']
    }, req);
    await WebhookDelivery.create({ deliveryId, event: req.headers['x-feexpay-event'], reference: event.reference, processedAt: new Date() });
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    if (error?.code === 11000) return res.sendStatus(200);
    return res.status(500).json({ error: error.message || 'Webhook non traité' });
  }
});

export default r;
