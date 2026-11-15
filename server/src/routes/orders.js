import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Order, Restaurant, MenuItem, User, CommissionConfig, City } from '../models/index.js';
import { auth, allow } from '../middleware/auth.js';
import { codCommission, addEntry, recordDeliveryFeeShares, recordRestaurantRevenueShares, recordCodRestaurantCommission } from '../services/finance.js';
import { splitDeliveryFee } from '../services/delivery-fee.js';
import { splitFoodRevenue } from '../services/food-revenue.js';

const r = Router();
const ENV_DELIVERY_FEE = Number(process.env.DEFAULT_DELIVERY_FEE ?? 700);
if (!Number.isSafeInteger(ENV_DELIVERY_FEE) || ENV_DELIVERY_FEE < 0) throw new Error('DEFAULT_DELIVERY_FEE doit être un entier positif ou nul');
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function makeCode() {
  return `DUNU-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${crypto.randomInt(100000, 999999)}`;
}

r.post('/', auth, allow('client'), async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress, deliveryCity, deliveryZone, recipientName, recipientPhone, customerLocation, paymentMethod = 'cash', notes } = req.body || {};
    if (!mongoose.isValidObjectId(restaurantId)) return res.status(400).json({ error: 'Restaurant invalide' });
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Le panier doit contenir entre 1 et 30 plats' });
    if (!['cash', 'mobile_money'].includes(paymentMethod)) return res.status(400).json({ error: 'Mode de paiement invalide' });
    if (typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 5 || deliveryAddress.length > 500) return res.status(400).json({ error: 'Adresse de livraison invalide' });
    if (typeof deliveryCity !== 'string' || deliveryCity.trim().length < 2 || deliveryCity.trim().length > 100) return res.status(400).json({ error: 'Ville de livraison obligatoire' });
    if (customerLocation && (!Number.isFinite(customerLocation.lat) || !Number.isFinite(customerLocation.lng) || Math.abs(customerLocation.lat) > 90 || Math.abs(customerLocation.lng) > 180)) return res.status(400).json({ error: 'Coordonnées de livraison invalides' });

    const ids = items.map(item => String(item?.menuItem || ''));
    if (ids.some(id => !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Plats invalides ou dupliqués' });
    const quantities = items.map(item => Number(item.quantity));
    if (quantities.some(q => !Number.isInteger(q) || q < 1 || q > 50)) return res.status(400).json({ error: 'Chaque quantité doit être un entier entre 1 et 50' });

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.approved || !restaurant.active) return res.status(400).json({ error: 'Restaurant indisponible' });
    const buyerCity = String(req.user.city || '').trim().toLocaleLowerCase('fr');
    const targetCity = deliveryCity.trim().toLocaleLowerCase('fr');
    const restaurantCity = String(restaurant.city || '').trim().toLocaleLowerCase('fr');
    const isIntercity = Boolean(buyerCity && targetCity !== buyerCity);
    if (restaurantCity !== targetCity) return res.status(400).json({ error: `Ce restaurant ne dessert pas la ville sélectionnée (${deliveryCity}). Choisissez un restaurant de cette ville.` });
    const zoneName = typeof deliveryZone === 'string' ? deliveryZone.trim() : '';
    if (!zoneName) return res.status(400).json({ error: 'Sélectionnez une zone de livraison desservie par ce restaurant.' });
    if (!Array.isArray(restaurant.deliveryZones) || !restaurant.deliveryZones.includes(zoneName)) return res.status(400).json({ error: 'Cette zone ne figure pas parmi les zones confirmées et desservies par ce restaurant.' });
    if (isIntercity && paymentMethod !== 'mobile_money') return res.status(409).json({ error: 'Une commande destinée à une autre ville doit obligatoirement être payée en ligne. Le paiement à la livraison est désactivé.' });
    if (isIntercity && (typeof recipientName !== 'string' || recipientName.trim().length < 2 || typeof recipientPhone !== 'string' || !/^[+0-9][0-9 +()-]{7,19}$/.test(recipientPhone.trim()))) return res.status(400).json({ error: 'Pour une livraison dans une autre ville, le nom et le téléphone du destinataire sont obligatoires.' });
    const menu = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurantId, available: true });
    if (menu.length !== ids.length) return res.status(400).json({ error: 'Un ou plusieurs plats sont indisponibles' });
    const lines = items.map((item, index) => {
      const dish = menu.find(row => String(row._id) === ids[index]);
      if (Number.isFinite(dish.stock) && dish.stock < quantities[index]) throw new Error(`Stock insuffisant pour ${dish.name}`);
      const requested = Array.isArray(item.customizations) ? item.customizations.slice(0, 12) : [];
      const chosen = [];
      for (const group of (dish.options || [])) {
        const pick = requested.find(x => String(x.group) === String(group.name));
        if (group.required && !pick) throw new Error(`Choisissez une option pour ${dish.name} : ${group.name}`);
        if (!pick) continue;
        const choice = group.choices.find(x => x.name === String(pick.choice));
        if (!choice) throw new Error(`Option invalide pour ${dish.name}`);
        chosen.push({ group:group.name, choice:choice.name, extraPrice:choice.price || 0 });
      }
      if (requested.some(x => !chosen.some(c => c.group === String(x.group)))) throw new Error(`Personnalisation inconnue pour ${dish.name}`);
      const customerNote = typeof item.customerNote === 'string' ? item.customerNote.trim().slice(0,300) : '';
      const extra = chosen.reduce((sum,x)=>sum+x.extraPrice,0);
      return { menuItem: dish._id, name: dish.name, quantity: quantities[index], unitPrice: dish.price + extra, customizations:chosen, customerNote };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) return res.status(400).json({ error: 'Montant de commande invalide' });
    const settings = await CommissionConfig.findOne({ key: 'global' }).select('deliveryFee codMinimumBalance').lean();
    const deliveryDefault = settings?.deliveryFee ?? ENV_DELIVERY_FEE;
    // Les nouvelles commandes suivent la répartition contractuelle 90/3/7.
    // L'ancien portefeuille de commissions reste conservé pour l'historique,
    // mais ne bloque plus les nouvelles commandes ni ne prélève une seconde commission.

    let deliveryFee = deliveryDefault;
    if (zoneName) {
      const cityConfig = await City.findOne({ name: deliveryCity.trim(), active: true }).select('deliveryZones').lean();
      const configuredZone = cityConfig?.deliveryZones?.find(zone => zone.active !== false && zone.name === zoneName);
      if (!configuredZone) return res.status(400).json({ error: 'Cette zone n’est pas encore activée dans la couverture DUNU.' });
      const restaurantRate = (restaurant.deliveryZoneFees || []).find(row => row.zone === zoneName && row.status === 'approved');
      if (restaurantRate && Number.isSafeInteger(restaurantRate.fee) && restaurantRate.fee >= 0) deliveryFee = restaurantRate.fee;
      else if (Number.isSafeInteger(configuredZone.fee) && configuredZone.fee >= 0) deliveryFee = configuredZone.fee;
    }
    const deliveryShares = splitDeliveryFee(deliveryFee);
    const codShares = paymentMethod === 'cash' ? splitFoodRevenue(subtotal) : null;
    const requiredCommission = codShares ? codShares.masterAmount + codShares.dunuAmount : 0;
    const minimumWalletBalance = Number.isSafeInteger(settings?.codMinimumBalance) ? settings.codMinimumBalance : 1000;
    const paymentFeeRate = paymentMethod === 'mobile_money' ? 1.7 : 0;
    const paymentFee = paymentFeeRate ? Math.ceil((subtotal + deliveryFee) * paymentFeeRate / 100) : 0;
    const orderData = {
      code: makeCode(), customer: req.user._id, restaurant: restaurantId, items: lines,
      foodSubtotal: subtotal, deliveryFee, paymentFeeRate, paymentFee, total: subtotal + deliveryFee + paymentFee,
      commissionRate: 0, commissionAmount: requiredCommission, billingMode:'commission_wallet', revenueSplitVersion:'90-3-7-v2',
      codCommissionReserved: paymentMethod === 'cash' && requiredCommission > 0,
      riderFee: deliveryShares.riderAmount, masterFee: deliveryShares.masterAmount, dunuDeliveryFee: deliveryShares.dunuAmount,
      paymentMethod, paymentStatus: 'pending',
      deliveryAddress: deliveryAddress.trim(), deliveryCity: deliveryCity.trim(), deliveryZone: typeof deliveryZone === 'string' ? deliveryZone.trim().slice(0, 100) : '', recipientName: typeof recipientName === 'string' ? recipientName.trim().slice(0, 120) : '', recipientPhone: typeof recipientPhone === 'string' ? recipientPhone.trim().slice(0, 30) : '', isIntercity, customerLocation,
      notes: typeof notes === 'string' ? notes.slice(0, 1000) : '',
      events: [{ status: 'placed', by: req.user._id, at: new Date() }]
    };
    const session = await mongoose.startSession();
    let order;
    try {
      await session.withTransaction(async () => {
        if (paymentMethod === 'cash') {
          const walletFilter = {
            _id: restaurant._id,
            $expr: {
              $and: [
                { $gte: [{ $ifNull: ['$walletBalance', 0] }, minimumWalletBalance] },
                { $gte: [
                  { $subtract: [{ $ifNull: ['$walletBalance', 0] }, { $ifNull: ['$walletReserved', 0] }] },
                  requiredCommission
                ] }
              ]
            }
          };
          if (requiredCommission > 0) {
            const reserved = await Restaurant.findOneAndUpdate(walletFilter, { $inc: { walletReserved: requiredCommission } }, { new: true, session });
            if (!reserved) {
              const error = new Error(`Le paiement à la livraison est temporairement indisponible. Rechargez le portefeuille Commission ; au moins ${Math.max(minimumWalletBalance, requiredCommission).toLocaleString('fr-FR')} FCFA doivent être disponibles. Les paiements en ligne restent indépendants de ce portefeuille.`);
              error.statusCode = 409;
              throw error;
            }
          } else {
            const eligible = await Restaurant.findOne(walletFilter).session(session).select('_id');
            if (!eligible) {
              const error = new Error(`Le paiement à la livraison est temporairement indisponible : le portefeuille Commission doit contenir au moins ${minimumWalletBalance.toLocaleString('fr-FR')} FCFA. Les paiements en ligne restent indépendants de ce portefeuille.`);
              error.statusCode = 409;
              throw error;
            }
          }
        }
        const [created] = await Order.create([orderData], { session });
        order = created;
      });
    } finally {
      await session.endSession();
    }
    const io = req.app.get('io');
    // Aucune commande payée en ligne n'est transmise au restaurant avant confirmation serveur.
    if (paymentMethod === 'cash') {
      io?.to(`user:${restaurant.owner}`).emit('order:new', { order });
      io?.to('role:admin').emit('order:new', { order });
    }
    const { Notification } = await import('../models/index.js');
    const newNotifications = await Notification.insertMany([
      ...(paymentMethod === 'cash' ? [{ user: restaurant.owner, type: 'order', title: 'Nouvelle commande reçue', body: `Une nouvelle commande ${order.code} attend votre traitement.`, link: '/dashboard', metadata: { orderCode: order.code } }] : []),
      { user: req.user._id, type: 'order', title: paymentMethod === 'cash' ? 'Commande enregistrée' : 'Commande en attente de paiement', body: paymentMethod === 'cash' ? `Votre commande ${order.code} a bien été enregistrée.` : `Votre commande ${order.code} sera transmise au restaurant après confirmation du paiement.`, link: `/track?code=${order.code}`, metadata: { orderCode: order.code } }
    ]);
    for (const notification of newNotifications) io?.to(`user:${notification.user}`).emit('notification:new', notification);
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Impossible de créer la commande' });
  }
});

r.get('/mine', auth, async (req, res) => {
  let query;
  if (req.user.role === 'client') query = { customer: req.user._id, archivedAt: null };
  else if (req.user.role === 'rider') query = { rider: req.user._id, archivedAt: null };
  else if (req.user.role === 'restaurant') {
    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select('_id');
    query = { restaurant: restaurant?._id || null, archivedAt: null };
  } else if (req.user.role === 'master') {
    const masterCities = [...new Set([...(req.user.masterCities || []), req.user.city].filter(Boolean))];
    const cityRestaurants = await Restaurant.find({ city: { $in: masterCities } }).distinct('_id');
    query = { restaurant: { $in: cityRestaurants }, archivedAt: null };
  } else if (['admin', 'finance'].includes(req.user.role)) query = { archivedAt: null };
  else return res.sendStatus(403);
  // Les coordonnées personnelles du client ne sont jamais transmises au compte restaurant.
  // Administration nationale, Master et livreur affecté conservent les données nécessaires à l'assistance/livraison.
  const customerFields = ['admin','master','rider','client'].includes(req.user.role) ? 'name phone' : 'name';
  let orderQuery = Order.find(query);
  if (req.user.role === 'client') orderQuery = orderQuery.select('+deliveryOtpCode');
  const rows = await orderQuery
    .populate('customer', customerFields)
    .populate('restaurant', 'name address phone')
    .populate('rider', 'name phone')
    .sort({ createdAt: -1 }).limit(100);
  res.json(rows.map(row => {
    const value = row.toObject();
    value.hasDeliveryCode = Boolean(value.deliveryOtpHash);
    if (req.user.role !== 'client') delete value.deliveryOtpCode;
    if (req.user.role === 'restaurant') {
      value.recipientPhone = '';
      if (value.customer && typeof value.customer === 'object') delete value.customer.phone;
    }
    return value;
  }));
});

r.get('/track/:code', auth, async (req, res) => {
  const order = await Order.findOne({ code: req.params.code }).populate('restaurant', 'name address phone location').populate('rider', 'name phone');
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const isParty = [order.customer, order.rider?._id || order.rider].some(id => String(id) === String(req.user._id));
  let isAllowed = isParty || req.user.role === 'admin';
  if (req.user.role === 'restaurant') {
    const restaurant = await Restaurant.findOne({ _id: order.restaurant?._id || order.restaurant, owner: req.user._id }).select('_id');
    isAllowed ||= Boolean(restaurant);
  }
  if (req.user.role === 'master') {
    const restaurant = await Restaurant.findOne({ _id: order.restaurant?._id || order.restaurant, city: req.user.city }).select('_id');
    isAllowed ||= Boolean(restaurant);
  }
  if (!isAllowed) return res.status(403).json({ error: 'Accès refusé' });
  res.json(order);
});

r.get('/track/:code/location', auth, async (req, res) => {
  const order = await Order.findOne({ code: req.params.code }).select('customer rider status');
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  let allowed = String(order.customer) === String(req.user._id) ||
    String(order.rider || '') === String(req.user._id) || req.user.role === 'admin';
  if (req.user.role === 'master') {
    const orderWithRestaurant = await Order.findById(order._id).select('restaurant').lean();
    const restaurant = orderWithRestaurant?.restaurant
      ? await Restaurant.findOne({ _id: orderWithRestaurant.restaurant, city: req.user.city }).select('_id').lean()
      : null;
    allowed ||= Boolean(restaurant);
  }
  if (!allowed) return res.sendStatus(403);
  if (!order.rider) return res.json({ location: null });
  const rider = await User.findById(order.rider).select('lastLocation');
  res.json({ location: rider?.lastLocation || null });
});

r.patch('/:id/status', auth, async (req, res) => {
  const { status, note } = req.body || {};
  const transitions = {
    placed: ['accepted', 'cancelled'], accepted: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'], ready: ['picked_up', 'cancelled'],
    picked_up: ['on_the_way'], on_the_way: ['delivered'],
    delivered: [], cancelled: []
  };
  if (!Object.hasOwn(transitions, status)) return res.status(400).json({ error: 'Statut invalide' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const restaurant = await Restaurant.findById(order.restaurant);
  if (order.paymentMethod === 'mobile_money' && order.paymentStatus !== 'paid' && status !== 'cancelled') return res.status(409).json({ error: 'Paiement Mobile Money non confirmé : cette commande ne peut pas être acceptée ou préparée.' });
  if (order.paymentMethod === 'mobile_money' && order.paymentStatus !== 'paid' && status === 'cancelled' && !['admin','restaurant'].includes(req.user.role)) return res.status(403).json({ error: 'Seuls DUNU et le restaurant peuvent annuler cette commande non payée.' });
  const isRestaurantOwner = req.user.role === 'restaurant' && restaurant && String(restaurant.owner) === String(req.user._id);
  const isAssignedRider = req.user.role === 'rider' && String(order.rider) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  const masterCities = [...new Set([...(req.user.masterCities || []), req.user.city].filter(Boolean).map(city => String(city).trim().toLowerCase()))];
  const isMaster = req.user.role === 'master' && restaurant && masterCities.includes(String(restaurant.city || '').trim().toLowerCase());
  const restaurantStatuses = ['accepted', 'preparing', 'ready', 'cancelled'];
  const riderStatuses = ['picked_up', 'on_the_way', 'delivered'];
  if (!(isAdmin || isMaster || (isRestaurantOwner && restaurantStatuses.includes(status)) || (isAssignedRider && riderStatuses.includes(status)))) return res.status(403).json({ error: 'Action non autorisée' });
  if (!transitions[order.status]?.includes(status)) return res.status(409).json({ error: `Transition impossible : ${order.status} vers ${status}` });

  if (status === 'delivered') {
    const suppliedOtpHash = sha256(req.body.otp || '');
    const expectedOtpHash = String(order.deliveryOtpHash || '');
    const otpMatches = expectedOtpHash.length === suppliedOtpHash.length && crypto.timingSafeEqual(Buffer.from(expectedOtpHash), Buffer.from(suppliedOtpHash));
    if (!req.body.otp || !otpMatches) return res.status(400).json({ error: 'Code de livraison incorrect ou absent' });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (order.paymentMethod === 'mobile_money' && order.paymentStatus !== 'paid') throw new Error('Paiement Mobile Money non confirmé : livraison non clôturable');
        if (order.revenueSplitVersion === '90-3-7-v2') {
          // Paiement à la livraison : 100 % du prix des plats va directement au restaurant ;
          // les 10 % (7 % DUNU + 3 % Master) proviennent de son portefeuille Commission.
          if (order.paymentMethod === 'cash') await recordCodRestaurantCommission(order, session);
          // Paiement en ligne : les parts ont déjà été comptabilisées à la confirmation FeexPay.
        } else if (order.revenueSplitVersion === '90-3-7-v1') {
          // Ancienne version : conserve le contrat comptable des commandes déjà créées.
          await recordRestaurantRevenueShares(order, session);
        } else {
          // Préserve la logique historique des commandes plus anciennes.
          const orderBillingMode = order.billingMode || restaurant?.billingMode || 'commission_wallet';
          if (orderBillingMode === 'commission_wallet' && order.commissionAmount > 0) {
            await codCommission(order, session);
            await addEntry({ accountType:'platform', kind:'commission_income', direction:'credit', amount:order.commissionAmount, order:order._id, reference:`COM-${order.code}` }, session);
          }
          if (order.paymentMethod === 'mobile_money' && order.foodSubtotal > 0) {
            await addEntry({ accountType:'restaurant_proceeds', accountId:order.restaurant, kind:'online_credit', direction:'credit', amount:order.foodSubtotal, order:order._id, reference:`REST-${order.code}` }, session);
          }
        }
        // Répartition des frais de livraison : 3 % Master, 7 % DUNU, 90 % livreur.
        // La fonction utilise des références uniques par commande et la même transaction
        // que la clôture de livraison pour éviter toute double comptabilisation.
        await recordDeliveryFeeShares(order, session);
        order.deliveredAt = new Date();
        order.set('deliveryOtpCode', undefined);
        order.status = status;
        order.events.push({ status, by: req.user._id, at: new Date(), note: typeof note === 'string' ? note.slice(0, 500) : undefined });
        await order.save({ session });
      });
    } catch (error) {
      return res.status(409).json({ error: error.message || 'Clôture financière impossible' });
    } finally { await session.endSession(); }
  } else if (status === 'cancelled' && order.codCommissionReserved) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const amount = Number(order.commissionAmount || 0);
        const released = await Restaurant.findOneAndUpdate(
          { _id: order.restaurant, walletReserved: { $gte: amount } },
          { $inc: { walletReserved: -amount } },
          { new: true, session }
        );
        if (!released) throw new Error('La réservation du portefeuille Commission est introuvable ; contactez l’administration avant de clôturer cette annulation.');
        order.codCommissionReserved = false;
        order.status = status;
        order.events.push({ status, by: req.user._id, at: new Date(), note: typeof note === 'string' ? note.slice(0, 500) : undefined });
        await order.save({ session });
      });
    } catch (error) {
      return res.status(409).json({ error: error.message || 'Libération de la réservation impossible.' });
    } finally { await session.endSession(); }
  } else {
    order.status = status;
    if (status === 'ready' && !order.deliveryOtpHash) {
      const deliveryOtp = String(crypto.randomInt(100000, 1000000));
      order.deliveryOtpHash = sha256(deliveryOtp);
      order.deliveryOtpCode = deliveryOtp;
    }
    order.events.push({ status, by: req.user._id, at: new Date(), note: typeof note === 'string' ? note.slice(0, 500) : undefined });
    await order.save();
  }
  const io = req.app.get('io');
  const currentRestaurant = status === 'delivered'
    ? await Restaurant.findById(order.restaurant).select('owner name walletBalance')
    : restaurant;
  const targetIds = [order.customer, currentRestaurant?.owner, order.rider].filter(Boolean);
  const { Notification } = await import('../models/index.js');
  const title = status === 'delivered' ? 'Commande livrée' : status === 'cancelled' ? 'Commande annulée' : 'Mise à jour de commande';
  const body = `La commande ${order.code} est maintenant : ${status}.`;
  const createdNotifications = await Notification.insertMany([...new Set(targetIds.map(String))].map(user => ({ user, type: 'order', title, body, link: `/track?code=${order.code}`, metadata: { orderCode: order.code, status } })));
  for (const notification of createdNotifications) io?.to(`user:${notification.user}`).emit('notification:new', notification);
  if (status === 'ready' && order.deliveryOtpCode) {
    const otpNotice = await Notification.create({ user: order.customer, type: 'order', title: 'Votre code de remise DUNU', body: `Votre code confidentiel pour recevoir la commande ${order.code} est : ${order.deliveryOtpCode}. Communiquez-le uniquement au moment de la remise.`, link: `/track?code=${order.code}`, metadata: { orderCode: order.code, purpose: 'delivery_otp' } });
    io?.to(`user:${otpNotice.user}`).emit('notification:new', otpNotice);
  }
  if (status === 'delivered' && order.paymentMethod === 'cash' && order.revenueSplitVersion === '90-3-7-v2' &&
      Number(restaurant?.walletBalance || 0) >= 1000 && Number(currentRestaurant?.walletBalance || 0) < 1000 && currentRestaurant?.owner) {
    const lowWalletNotice = await Notification.create({
      user: currentRestaurant.owner, type: 'finance', title: 'Recharge du portefeuille Commission nécessaire',
      body: 'Votre solde Commission est passé sous 1 000 FCFA. Rechargez-le pour recevoir de nouvelles commandes payées à la livraison. Les paiements en ligne restent indépendants de ce portefeuille.',
      link: '/dashboard', metadata: { purpose: 'restaurant_commission_low', orderCode: order.code, balance: currentRestaurant.walletBalance }
    });
    io?.to(`user:${lowWalletNotice.user}`).emit('notification:new', lowWalletNotice);
  }
  const orderForSocket = order.toObject(); delete orderForSocket.deliveryOtpCode; io?.to(`order:${order.code}`).emit('order:updated', orderForSocket);
  res.json(order);
});


r.delete('/:id', auth, allow('admin'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.archivedAt) return res.json({ message: 'Cette commande est déjà archivée.' });
  if (order.paymentStatus === 'paid' || order.status === 'delivered' || order.codCommissionReserved) {
    return res.status(409).json({ error: 'Cette commande contient un paiement confirmé, une livraison terminée ou une réservation financière. Elle ne peut pas être archivée depuis cette action.' });
  }
  const isFailed = order.paymentStatus === 'failed';
  const isCancelledUnpaid = order.status === 'cancelled' && order.paymentStatus !== 'paid';
  const isUnpaidPending = order.paymentMethod === 'mobile_money' && order.paymentStatus === 'pending' && order.status === 'placed';
  if (!isFailed && !isCancelledUnpaid && !isUnpaidPending) {
    return res.status(409).json({ error: 'Seules les commandes échouées, annulées non payées ou en attente de paiement peuvent être archivées.' });
  }
  order.archivedAt = new Date();
  order.archivedBy = req.user._id;
  order.archiveReason = isFailed ? 'Paiement échoué — archivée par l’administration nationale' : isCancelledUnpaid ? 'Commande annulée non payée — archivée par l’administration nationale' : 'Commande restée en attente de paiement — archivée par l’administration nationale';
  await order.save();
  res.json({ message: 'Commande retirée de la liste active. Son historique financier est conservé.' });
});

r.post('/:id/assign-rider', auth, allow('admin', 'master', 'restaurant'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  const rider = await User.findOne({ _id: req.body.riderId, role: 'rider', status: 'active' });
  if (!order || !rider) return res.status(404).json({ error: 'Commande ou livreur introuvable' });
  const restaurant = await Restaurant.findById(order.restaurant);
  if (req.user.role === 'restaurant' && (!restaurant || String(restaurant.owner) !== String(req.user._id))) return res.sendStatus(403);
  if (req.user.role === 'restaurant' && rider.restaurantId && String(rider.restaurantId)!==String(restaurant?._id||'')) return res.status(403).json({error:'Ce livreur est rattaché à un autre restaurant'});
  if (req.user.role === 'master') {
    const masterCities = [...new Set([...(req.user.masterCities || []), req.user.city].filter(Boolean).map(city => String(city).trim().toLowerCase()))];
    if (!restaurant || !masterCities.includes(String(restaurant.city || '').trim().toLowerCase()) || !masterCities.includes(String(rider.city || '').trim().toLowerCase())) return res.sendStatus(403);
  }
  if (req.user.role === 'restaurant' && (!restaurant || rider.city !== restaurant.city)) return res.status(403).json({ error: 'Le livreur doit appartenir à la même ville que le restaurant' });
  if (!['ready', 'picked_up'].includes(order.status)) return res.status(409).json({ error: 'La commande doit être prête avant l’affectation du livreur' });
  order.rider = rider._id;
  await order.save();
  req.app.get('io')?.to(`user:${rider._id}`).emit('delivery:assigned', order);
  const { Notification } = await import('../models/index.js');
  const notification = await Notification.create({ user: rider._id, type: 'delivery', title: 'Nouvelle livraison attribuée', body: `La commande ${order.code} vous a été attribuée.`, link: '/dashboard', metadata: { orderCode: order.code } });
  req.app.get('io')?.to(`user:${rider._id}`).emit('notification:new', notification);
  res.json(order);
});

r.post('/:id/create-delivery-code', auth, allow('admin', 'master'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const restaurant = await Restaurant.findById(order.restaurant).select('city');
  if (req.user.role === 'master') {
    const masterCities = [...new Set([...(req.user.masterCities || []), req.user.city].filter(Boolean).map(city => String(city).trim().toLowerCase()))];
    if (!restaurant || !masterCities.includes(String(restaurant.city || '').trim().toLowerCase())) return res.sendStatus(403);
  }
  if (!['ready', 'picked_up', 'on_the_way'].includes(order.status)) return res.status(409).json({ error: 'Le code ne peut être généré qu’une fois la commande prête' });
  const otp = String(crypto.randomInt(100000, 1000000));
  order.deliveryOtpHash = sha256(otp);
  order.deliveryOtpCode = otp;
  await order.save();
  const { Notification } = await import('../models/index.js');
  const notification = await Notification.create({ user: order.customer, type: 'order', title: 'Votre code de remise DUNU', body: `Votre code confidentiel pour recevoir la commande ${order.code} est : ${otp}. Communiquez-le uniquement au moment de la remise.`, link: `/track?code=${order.code}`, metadata: { orderCode: order.code, purpose: 'delivery_otp' } });
  req.app.get('io')?.to(`user:${notification.user}`).emit('notification:new', notification);
  res.json({ message: 'Code généré et envoyé dans les notifications du client.', otp });
});

export default r;
