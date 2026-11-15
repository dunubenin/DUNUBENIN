import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { auth, allow } from '../middleware/auth.js';
import { BENIN_COMMUNE_NAMES } from '../data/benin-communes.js';
import { User, Restaurant, MenuItem, Order, Ledger, Payment, Message, Call, Notification, SubscriptionRequest, AdCampaign, City, CommissionConfig, AuditLog } from '../models/index.js';

const r = Router();
r.use(auth);
const citiesForMaster = user => user?.role === 'master'
  ? [...new Set([...(user.masterCities || []), user.city].filter(city => BENIN_COMMUNE_NAMES.has(city)))]
  : [];
const masterCityQuery = user => ({ city: { $in: citiesForMaster(user) } });

r.get('/summary', allow('admin', 'finance', 'master'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const userScope = req.user.role === 'master' ? masterCityQuery(req.user) : {};
  const liveUserIds = await User.find({ ...userScope, deletedAt: null }).distinct('_id');
  const restaurantScope = { owner: { $in: liveUserIds } };
  const restaurantIds = req.user.role === 'master' ? await Restaurant.find(restaurantScope).distinct('_id') : null;
  const scope = restaurantIds ? { restaurant: { $in: restaurantIds } } : {};
  const confirmedPayment = { $or: [{ paymentMethod: 'cash' }, { paymentStatus: 'paid' }] };
  const activeOrder = { ...scope, ...confirmedPayment, archivedAt: null, status: { $nin: ['cancelled', 'delivered'] }, paymentStatus: { $nin: ['failed', 'refunded'] } };
  const [orders, pendingOrders, awaitingPaymentOrders, deliveredOrders, unsuccessfulOrders, restaurants, pendingRestaurants, riders, clients, revenue] = await Promise.all([
    Order.countDocuments(activeOrder),
    Order.countDocuments({ ...activeOrder, status: 'placed' }),
    Order.countDocuments({ ...scope, archivedAt: null, status: 'placed', paymentMethod: 'mobile_money', paymentStatus: 'pending' }),
    Order.countDocuments({ ...scope, archivedAt: null, status: 'delivered' }),
    Order.countDocuments({ ...scope, $or: [{ status: 'cancelled' }, { paymentStatus: { $in: ['failed', 'refunded'] } }] }),
    Restaurant.countDocuments({ ...restaurantScope, active: true }),
    Restaurant.countDocuments({ ...restaurantScope, approved: false }),
    User.countDocuments({ ...userScope, role: 'rider', status: 'active', deletedAt: null }),
    User.countDocuments({ ...userScope, role: 'client', deletedAt: null }),
    Ledger.aggregate([{ $match: { accountType: 'platform', kind: 'commission_income', direction: 'credit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);
  res.json({ city: req.user.role === 'master' ? req.user.city : null, cities: req.user.role === 'master' ? citiesForMaster(req.user) : [], orders, pendingOrders, awaitingPaymentOrders, deliveredOrders, unsuccessfulOrders, restaurants, pendingRestaurants, riders, clients, platformCommissionXof: req.user.role === 'master' ? undefined : (revenue[0]?.total || 0) });
});

r.get('/pending', allow('admin'), async (_req, res) => {
  const [users, restaurants] = await Promise.all([
    User.find({ status: 'pending' }).select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt').sort({ createdAt: 1 }).limit(200),
    Restaurant.find({ approved: false }).populate('owner', 'name email phone').sort({ createdAt: 1 }).limit(200)
  ]);
  res.json({ users, restaurants });
});

r.patch('/users/:id/status', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['active', 'suspended', 'pending'].includes(req.body?.status)) return res.status(400).json({ error: 'Identifiant ou statut invalide' });
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (user.role === 'admin' && req.body.status !== 'active') return res.status(409).json({ error: 'La suspension d’un administrateur doit suivre une procédure dédiée' });
  user.status = req.body.status;
  await user.save();
  if (user.role === 'restaurant') {
    const shop = await Restaurant.findOne({ owner: user._id });
    if (shop) { shop.active = req.body.status === 'active' && shop.approved; await shop.save(); }
  }
  res.json({ id: user.id, name: user.name, role: user.role, status: user.status });
});


r.patch('/users/:id/approve', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Utilisateur invalide' });
  const role = String(req.body?.role || '');
  const city = String(req.body?.city || '').trim();
  if (!['client', 'restaurant', 'rider'].includes(role)) return res.status(400).json({ error: 'Rôle public invalide.' });
  if (!BENIN_COMMUNE_NAMES.has(city)) return res.status(400).json({ error: 'Sélectionnez une commune valide du Bénin.' });
  const user = await User.findOne({ _id: req.params.id, status: 'pending', deletedAt: null });
  if (!user) return res.status(404).json({ error: 'Compte en attente introuvable.' });
  user.role = role;
  user.city = city;
  user.status = 'active';
  await user.save();
  if (role === 'restaurant') {
    const shop = await Restaurant.findOne({ owner: user._id });
    if (shop) { shop.city = city; shop.active = shop.approved; await shop.save(); }
  }
  await AuditLog.create({ actor:req.user._id, actorRole:req.user.role, action:'user.approval_assignment', targetType:'User', targetId:String(user._id), city, details:{ role, city } });
  res.json({ id:user.id, name:user.name, role:user.role, city:user.city, status:user.status });
});

r.delete('/users/:id', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Utilisateur invalide' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (user.role === 'admin') return res.status(409).json({ error: 'Un compte administrateur ne peut pas être supprimé depuis cette interface.' });

  // Suppression définitive en cascade : toutes les données directement liées au compte.
  // Les écritures et commandes liées à ce compte sont supprimées également, sur décision explicite de l'admin.
  const shops = await Restaurant.find({ owner: user._id }).select('_id').lean();
  const shopIds = shops.map(x => x._id);
  const menuIds = shopIds.length ? await MenuItem.find({ restaurant: { $in: shopIds } }).distinct('_id') : [];
  const orderOr = [{ customer: user._id }, { rider: user._id }];
  if (shopIds.length) orderOr.push({ restaurant: { $in: shopIds } });
  const orderIds = await Order.find({ $or: orderOr }).distinct('_id');

  const removed = {};
  const record = async (key, result) => { removed[key] = result.deletedCount || 0; };
  if (orderIds.length) {
    await record('payments', await Payment.deleteMany({ order: { $in: orderIds } }));
    await record('orders', await Order.deleteMany({ _id: { $in: orderIds } }));
    await record('orderLedgerEntries', await Ledger.deleteMany({ order: { $in: orderIds } }));
  } else {
    removed.payments = 0; removed.orders = 0; removed.orderLedgerEntries = 0;
  }
  await record('accountLedgerEntries', await Ledger.deleteMany({ accountId: { $in: [user._id, ...shopIds] } }));
  if (menuIds.length) await record('menuItems', await MenuItem.deleteMany({ _id: { $in: menuIds } }));
  else removed.menuItems = 0;
  await record('restaurants', await Restaurant.deleteMany({ owner: user._id }));
  await record('messages', await Message.deleteMany({ $or: [{ sender: user._id }, { recipient: user._id }] }));
  await record('calls', await Call.deleteMany({ $or: [{ caller: user._id }, { callee: user._id }] }));
  await record('notifications', await Notification.deleteMany({ user: user._id }));
  await record('subscriptionRequests', await SubscriptionRequest.deleteMany({ $or: [{ requestedBy: user._id }, { processedBy: user._id }, ...(shopIds.length ? [{ restaurant: { $in: shopIds } }] : [])] }));
  await record('adCampaigns', await AdCampaign.deleteMany({ createdBy: user._id }));
  await record('userAuditHistory', await AuditLog.deleteMany({ $or: [{ targetId: String(user._id) }, { actor: user._id }] }));
  await record('user', await User.deleteOne({ _id: user._id }));

  // Le journal conserve uniquement l'acte de suppression effectué par l'administrateur actif.
  await AuditLog.create({ actor: req.user._id, actorRole: req.user.role, action: 'user.permanent_delete', targetType: 'User', targetId: String(user._id), city: user.city || '', details: { role: user.role, deletedCollections: removed } });
  res.json({ message: 'Compte et données associées supprimés définitivement.', removed });
});

r.get('/riders/locations', allow('admin', 'master'), async (req, res) => {
  const query = { role: 'rider', status: 'active', deletedAt: null, 'lastLocation.at': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } };
  if (req.user.role === 'master') query.city = { $in: citiesForMaster(req.user) };
  const riders = await User.find(query).select('name phone city isOnline lastSeen lastLocation').sort({ lastSeen: -1 }).limit(500);
  res.json(riders);
});

r.patch('/restaurants/:id/decision', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body?.approved !== 'boolean') return res.status(400).json({ error: 'Décision invalide' });
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  const assignedCity = typeof req.body.city === 'string' ? req.body.city.trim() : restaurant.city;
  if (!BENIN_COMMUNE_NAMES.has(assignedCity)) return res.status(400).json({ error: 'Sélectionnez une commune valide du Bénin.' });
  const submittedZones = Array.isArray(req.body.deliveryZones) ? req.body.deliveryZones : restaurant.deliveryZones;
  const confirmedZones = [...new Set((submittedZones || []).filter(zone => typeof zone === 'string').map(zone => zone.trim()).filter(Boolean))].slice(0, 100);
  if (req.body.approved && (!confirmedZones.length || confirmedZones.some(zone => zone.length > 100))) {
    return res.status(400).json({ error: 'Pour valider ce restaurant, confirmez au moins une zone de livraison valide.' });
  }
  restaurant.city = assignedCity;
  if (req.body.approved) restaurant.deliveryZones = confirmedZones;
  restaurant.approved = req.body.approved;
  restaurant.active = req.body.approved;
  await restaurant.save();
  await User.updateOne({ _id: restaurant.owner, role: 'restaurant' }, { $set: { city: assignedCity } });

  // La validation du restaurant active automatiquement sa commune et ajoute
  // ses zones confirmées au référentiel opérationnel, sans effacer les zones
  // déjà configurées par d'autres restaurants.
  if (req.body.approved) {
    const cityConfig = await City.findOne({ name: assignedCity }) || new City({ name: assignedCity });
    cityConfig.active = true;
    cityConfig.deliveryZones = Array.isArray(cityConfig.deliveryZones) ? cityConfig.deliveryZones : [];
    for (const name of confirmedZones) {
      const existingZone = cityConfig.deliveryZones.find(zone => String(zone.name || '').trim().toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
      if (existingZone) existingZone.active = true;
      else cityConfig.deliveryZones.push({ name, fee: 700, active: true });
    }
    await cityConfig.save();
  }
  await AuditLog.create({actor:req.user._id,actorRole:req.user.role,action:'restaurant.approval',targetType:'Restaurant',targetId:String(restaurant._id),restaurant:restaurant._id,city:restaurant.city,details:{approved:restaurant.approved,deliveryZones:req.body.approved?confirmedZones:[]}});
  res.json({ id: restaurant.id, name: restaurant.name, approved: restaurant.approved, active: restaurant.active, city: restaurant.city, deliveryZones: restaurant.deliveryZones });
});

r.post('/users', allow('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const role = req.body?.role;
  const city = String(req.body?.city || '').trim();
  const requestedCities = Array.isArray(req.body?.cities) ? req.body.cities : (city ? [city] : []);
  const masterCities = [...new Set(requestedCities.map(x => String(x).trim()).filter(x => BENIN_COMMUNE_NAMES.has(x)))].slice(0, 10);
  if (name.length < 2 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 8 || password.length < 10) {
    return res.status(400).json({ error: 'Nom, e-mail, téléphone et mot de passe provisoire (10 caractères minimum) sont obligatoires.' });
  }
  if (!['master', 'finance'].includes(role)) return res.status(400).json({ error: 'Seuls les comptes Master et Finance peuvent être créés ici.' });
  if (role === 'master' && (!masterCities.length || requestedCities.length > 10 || masterCities.length !== new Set(requestedCities).size)) return res.status(400).json({ error: 'Choisissez entre 1 et 10 communes valides pour ce Master.' });
  if (await User.findOne({ $or: [{ email }, { phone }] })) return res.status(409).json({ error: 'Cet e-mail ou ce téléphone est déjà utilisé.' });
  const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 12), role, city: role === 'master' ? masterCities[0] : 'Bénin', masterCities: role === 'master' ? masterCities : [], status: 'active' });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, city: user.city, masterCities: user.masterCities, status: user.status });
});

r.patch('/users/:id/master-cities', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'master') return res.status(404).json({ error: 'Compte MASTER introuvable.' });
  const requested = Array.isArray(req.body?.cities) ? req.body.cities : [];
  const cities = [...new Set(requested.map(x => String(x).trim()).filter(x => BENIN_COMMUNE_NAMES.has(x)))];
  if (!cities.length || cities.length > 10 || cities.length !== new Set(requested).size) return res.status(400).json({ error: 'Un MASTER doit avoir entre 1 et 10 villes valides.' });
  user.masterCities = cities;
  user.city = cities[0];
  await user.save();
  await AuditLog.create({ actor: req.user._id, action: 'master_cities_updated', targetType: 'User', targetId: user._id, details: { cities } });
  res.json({ id: user.id, city: user.city, masterCities: user.masterCities });
});

r.get('/users', allow('admin', 'master'), async (req, res) => {
  const query = req.user.role === 'master' ? { ...masterCityQuery(req.user), role: { $in: ['restaurant', 'rider', 'client'] } } : {};
  res.json(await User.find({ ...query, deletedAt: null }).select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt').sort({ createdAt: -1 }).limit(300));
});



r.get('/my-restaurants', allow('master'), async (req,res) => {
  const liveOwners = await User.find({ role: 'restaurant', ...masterCityQuery(req.user), status: { $ne: 'deleted' }, deletedAt: null }).distinct('_id');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(await Restaurant.find({ city: { $in: citiesForMaster(req.user) }, owner: { $in: liveOwners } })
    .select('name city phone approved active address owner').sort({name:1}).limit(300));
});

r.get('/restaurants', allow('admin'), async (_req, res) => {
  // Ne montrer que les restaurants dont le compte propriétaire existe encore.
  // Cela nettoie l'affichage des anciennes fiches orphelines après suppression d'un compte.
  const liveOwners = await User.find({ role: 'restaurant', status: { $ne: 'deleted' }, deletedAt: null }).distinct('_id');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(await Restaurant.find({ owner: { $in: liveOwners } })
    .select('name city phone walletBalance approved active owner deliveryZones')
    .sort({ city: 1, name: 1 }).limit(500));
});

r.post('/restaurants/cleanup-orphans', allow('admin'), async (_req, res) => {
  const liveOwners = await User.find({ role: 'restaurant', status: { $ne: 'deleted' }, deletedAt: null }).distinct('_id');
  const orphanShops = await Restaurant.find({ owner: { $nin: liveOwners } }).select('_id').lean();
  const orphanIds = orphanShops.map(x => x._id);
  if (!orphanIds.length) return res.json({ message: 'Aucune fiche restaurant orpheline.', restaurants: 0, menuItems: 0 });
  const menuResult = await MenuItem.deleteMany({ restaurant: { $in: orphanIds } });
  const shopResult = await Restaurant.deleteMany({ _id: { $in: orphanIds } });
  res.json({ message: 'Fiches restaurant sans compte propriétaire supprimées.', restaurants: shopResult.deletedCount || 0, menuItems: menuResult.deletedCount || 0 });
});

r.get('/orders', allow('admin', 'master', 'finance'), async (req, res) => {
  let query = {};
  if (req.user.role === 'master') {
    const ids = await Restaurant.find({ city: { $in: citiesForMaster(req.user) } }).distinct('_id');
    query = { restaurant: { $in: ids } };
  }
  res.json(await Order.find(query).populate('customer', 'name phone').populate('restaurant', 'name city').populate('rider', 'name phone').sort({ createdAt: -1 }).limit(200));
});



// Paramètres financiers nationaux : seul l'administrateur national peut modifier les règles.
r.get('/commission-settings', allow('admin', 'finance'), async (_req, res) => {
  let settings = await CommissionConfig.findOne({ key: 'global' });
  if (!settings) settings = await CommissionConfig.create({ key: 'global' });
  res.json({ commissionRate: settings.commissionRate, deliveryFee: settings.deliveryFee, codMinimumBalance: settings.codMinimumBalance, updatedAt: settings.updatedAt });
});
r.put('/commission-settings', allow('admin'), async (req, res) => {
  const commissionRate = Number(req.body?.commissionRate);
  const deliveryFee = Number(req.body?.deliveryFee);
  const codMinimumBalance = Number(req.body?.codMinimumBalance);
  if (![commissionRate, deliveryFee, codMinimumBalance].every(Number.isFinite) ||
      commissionRate < 0 || commissionRate > 50 ||
      !Number.isSafeInteger(deliveryFee) || deliveryFee < 0 || deliveryFee > 100000 ||
      !Number.isSafeInteger(codMinimumBalance) || codMinimumBalance < 0 || codMinimumBalance > 10000000) {
    return res.status(400).json({ error: 'Paramètres invalides : commission 0–50 %, livraison 0–100 000 FCFA, seuil COD 0–10 000 000 FCFA.' });
  }
  const settings = await CommissionConfig.findOneAndUpdate(
    { key: 'global' },
    { $set: { commissionRate, deliveryFee, codMinimumBalance, updatedBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ commissionRate: settings.commissionRate, deliveryFee: settings.deliveryFee, codMinimumBalance: settings.codMinimumBalance, updatedAt: settings.updatedAt });
});

// Référentiel géographique administrable sans modifier le code.
r.get('/cities', allow('admin'), async (_req, res) => res.json(await City.find({}).sort({ name: 1 }))); 
r.post('/cities', allow('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Nom de ville invalide' });
  try {
    const city = await City.create({ name, neighborhoods: Array.isArray(req.body.neighborhoods) ? req.body.neighborhoods.filter(x => typeof x === 'string').slice(0, 300) : [], deliveryZones: Array.isArray(req.body.deliveryZones) ? req.body.deliveryZones.filter(x => typeof x?.name === 'string' && x.name.trim()).map(x => ({ name: x.name.trim().slice(0, 100), fee: Number.isSafeInteger(Number(x.fee)) && Number(x.fee) >= 0 ? Number(x.fee) : 700, active: x.active !== false })).slice(0, 300) : [] });
    res.status(201).json(city);
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'Cette ville existe déjà' : 'Création impossible' }); }
});
r.patch('/cities/:id', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Ville invalide' });
  const updates = {};
  if (typeof req.body?.active === 'boolean') updates.active = req.body.active;
  if (Array.isArray(req.body?.neighborhoods)) updates.neighborhoods = [...new Set(req.body.neighborhoods.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 300);
  if (Array.isArray(req.body?.deliveryZones)) {
    const zones = req.body.deliveryZones.filter(x => typeof x?.name === 'string' && x.name.trim()).map(x => ({ name: x.name.trim().slice(0, 100), fee: Number.isSafeInteger(Number(x.fee)) && Number(x.fee) >= 0 ? Number(x.fee) : 700, active: x.active !== false }));
    const names = zones.map(x => x.name.toLocaleLowerCase('fr'));
    if (new Set(names).size !== names.length) return res.status(400).json({ error: 'Deux zones portent le même nom. Supprimez les doublons.' });
    updates.deliveryZones = zones.slice(0, 300);
    if (updates.deliveryZones.length) updates.active = true;
  }
  const city = await City.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!city) return res.status(404).json({ error: 'Ville introuvable' });
  await AuditLog.create({ actor:req.user._id, actorRole:req.user.role, action:'coverage.city.updated', targetType:'City', targetId:String(city._id), city:city.name, details:{ fields:Object.keys(updates), zones:updates.deliveryZones?.map(z=>z.name) } });
  res.json(city);
});

r.patch('/users/:id/role-city', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Utilisateur invalide' });
  const { role, city } = req.body || {};
  if (!['client', 'restaurant', 'rider', 'master', 'finance'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (role === 'master' && (typeof city !== 'string' || !BENIN_COMMUNE_NAMES.has(city.trim()))) return res.status(400).json({ error: 'Une commune valide du Bénin est obligatoire pour un Master' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  user.role = role;
  if (typeof city === 'string' && city.trim()) { if (!BENIN_COMMUNE_NAMES.has(city.trim())) return res.status(400).json({ error: 'Sélectionnez une commune valide du Bénin.' }); user.city = city.trim().slice(0, 100); }
  await user.save();
  res.json({ id: user.id, name: user.name, role: user.role, city: user.city, status: user.status });
});

r.patch('/rider/availability', allow('rider'), async (req, res) => {
  if (typeof req.body?.online !== 'boolean') return res.status(400).json({ error: 'Statut de disponibilité invalide' });
  await User.updateOne({ _id: req.user._id, role: 'rider' }, { $set: { isOnline: req.body.online, lastSeen: new Date() } });
  res.json({ online: req.body.online });
});


// Indicateurs de pilotage sur 7 ou 30 jours. Les montants sont calculés à partir des commandes et écritures existantes.
r.get('/analytics', allow('admin', 'finance', 'master'), async (req, res) => {
  const days = Number(req.query.days) === 30 ? 30 : 7;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  let orderMatch = { createdAt: { $gte: since }, archivedAt: null, status: { $ne: 'cancelled' }, paymentStatus: { $nin: ['failed', 'refunded'] }, $or: [{ paymentMethod: 'cash' }, { paymentStatus: 'paid' }] };
  if (req.user.role === 'master') {
    const ids = await Restaurant.find({ city: { $in: citiesForMaster(req.user) } }).distinct('_id');
    orderMatch.restaurant = { $in: ids };
  }
  const [daily, totals, financial] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orders: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } }, gross: { $sum: '$total' }, commissions: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$commissionAmount', 0] } } } },
      { $sort: { _id: 1 } }
    ]),
    Order.aggregate([{ $match: orderMatch }, { $group: { _id: null, orders: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } }, gross: { $sum: '$total' } } }]),
    req.user.role === 'master' ? Promise.resolve([]) : Ledger.aggregate([
      { $match: { accountType: 'platform', kind: 'commission_income', direction: 'credit', createdAt: { $gte: since } } },
      { $group: { _id: null, collected: { $sum: '$amount' } } }
    ])
  ]);
  const byDay = new Map(daily.map(row => [row._id, row]));
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(since); date.setDate(since.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, orders: byDay.get(key)?.orders || 0, delivered: byDay.get(key)?.delivered || 0, gross: byDay.get(key)?.gross || 0, commissions: byDay.get(key)?.commissions || 0 };
  });
  res.json({ days, points, totals: { orders: totals[0]?.orders || 0, delivered: totals[0]?.delivered || 0, gross: totals[0]?.gross || 0, platformCommissionsRecorded: financial[0]?.collected || 0 } });
});

// Gains livreur : distingue les écritures comptabilisées des estimations issues des livraisons terminées.
r.get('/rider/earnings', allow('rider'), async (req, res) => {
  const [completed, entries] = await Promise.all([
    Order.find({ rider: req.user._id, status: 'delivered' }).select('code riderFee deliveredAt total').sort({ deliveredAt: -1 }).limit(100).lean(),
    Ledger.find({ accountType: 'rider', accountId: req.user._id, kind: 'rider_earning', direction: 'credit' }).sort({ createdAt: -1 }).limit(100).lean()
  ]);
  const recorded = entries.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const estimated = completed.reduce((sum, row) => sum + Number(row.riderFee || 0), 0);
  res.json({ completedDeliveries: completed.length, estimatedFromDeliveries: estimated, recordedInLedger: recorded, entries, completedOrders: completed });
});

// Activation/désactivation opérationnelle d'un restaurant déjà enregistré.
r.patch('/restaurants/:id/status', allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'Restaurant ou statut invalide' });
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  if (req.body.active && !restaurant.approved) return res.status(409).json({ error: 'Un restaurant doit être validé avant activation' });
  restaurant.active = req.body.active;
  await restaurant.save();
  await AuditLog.create({actor:req.user._id,actorRole:req.user.role,action:'restaurant.active',targetType:'Restaurant',targetId:String(restaurant._id),restaurant:restaurant._id,city:restaurant.city,details:{active:restaurant.active}});
  res.json({ id: restaurant.id, name: restaurant.name, active: restaurant.active, approved: restaurant.approved });
});


// Vue synthétique du journal financier : totaux enregistrés, sans confondre estimations et paiements.
r.get('/finance-summary', allow('admin', 'finance'), async (_req, res) => {
  const rows = await Ledger.aggregate([
    { $match: { status: { $ne: 'reversed' } } },
    { $group: { _id: { accountType: '$accountType', direction: '$direction', status: '$status' }, amount: { $sum: '$amount' }, entries: { $sum: 1 } } },
    { $sort: { '_id.accountType': 1, '_id.direction': 1 } }
  ]);
  const total = (accountType, direction, status) => rows.filter(x => x._id.accountType === accountType && x._id.direction === direction && (!status || x._id.status === status)).reduce((sum, x) => sum + x.amount, 0);
  const deliveryClearingRows = await Ledger.aggregate([
    { $match: { accountType: 'delivery_clearing', kind: { $in: ['delivery_fee_collection', 'delivery_fee_distribution'] }, status: { $ne: 'reversed' } } },
    { $group: { _id: '$direction', total: { $sum: '$amount' } } }
  ]);
  const deliveryClearingCredits = deliveryClearingRows.find(x => x._id === 'credit')?.total || 0;
  const deliveryClearingDebits = deliveryClearingRows.find(x => x._id === 'debit')?.total || 0;
  const foodCollected = await Ledger.aggregate([
    { $match: { accountType: 'customer', kind: 'food_sale_collection', direction: 'debit', status: { $ne: 'reversed' } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const foodDistributed = await Ledger.aggregate([
    { $match: { accountType: 'delivery_clearing', kind: 'food_sale_distribution', direction: 'debit', status: { $ne: 'reversed' } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const deliveryCollected = await Ledger.aggregate([
    { $match: { accountType: 'customer', kind: 'delivery_fee_collection', direction: 'debit', status: { $ne: 'reversed' } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  res.json({ rows, platformCommissionCredits: total('platform', 'credit'), restaurantCredits: total('restaurant_proceeds', 'credit') + total('restaurant', 'credit'), restaurantDebits: total('restaurant_proceeds', 'debit') + total('restaurant', 'debit'), riderCredits: total('rider', 'credit'), riderDebits: total('rider', 'debit'), masterCredits: total('master', 'credit', 'available'), pendingMasterCredits: total('master', 'credit', 'pending'), deliveryFeesCollected: deliveryCollected[0]?.total || 0, deliveryFeesDistributed: deliveryClearingDebits, deliveryClearingBalance: deliveryClearingCredits - deliveryClearingDebits, foodSalesCollected: foodCollected[0]?.total || 0, foodSalesDistributed: foodDistributed[0]?.total || 0, foodSalesClearingBalance: (foodCollected[0]?.total || 0) - (foodDistributed[0]?.total || 0), entryCount: rows.reduce((sum, x) => sum + x.entries, 0) });
});

// Missions prêtes, non attribuées, limitées à la ville du livreur.
r.get('/rider/missions', allow('rider'), async (req, res) => {
  const restaurants = await Restaurant.find({ city: req.user.city, approved: true, active: true }).distinct('_id');
  const rows = await Order.find({ restaurant: { $in: restaurants }, status: 'ready', $or: [{ rider: null }, { rider: { $exists: false } }] })
    .populate('restaurant', 'name city address phone location').populate('customer', 'name phone')
    .sort({ createdAt: 1 }).limit(50).lean();
  res.json(rows);
});

// Prise en charge atomique : deux livreurs ne peuvent pas accepter la même mission.
r.patch('/rider/missions/:id/accept', allow('rider'), async (req, res) => {
  if (!req.user.isOnline) return res.status(409).json({ error: 'Passez en ligne avant d’accepter une mission.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Mission invalide' });
  const restaurants = await Restaurant.find({ city: req.user.city, approved: true, active: true }).distinct('_id');
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, restaurant: { $in: restaurants }, status: 'ready', $or: [{ rider: null }, { rider: { $exists: false } }] },
    { $set: { rider: req.user._id } },
    { new: true }
  ).populate('restaurant', 'name city address phone').populate('customer', 'name phone');
  if (!order) return res.status(409).json({ error: 'Cette mission a déjà été prise ou n’est plus disponible.' });
  const { Notification } = await import('../models/index.js');
  const restaurant = await Restaurant.findById(order.restaurant?._id || order.restaurant).select('owner');
  if (restaurant?.owner) {
    const notification = await Notification.create({ user: restaurant.owner, type: 'delivery', title: 'Livreur affecté', body: `Un livreur a accepté la livraison ${order.code}.`, link: '/dashboard', metadata: { orderCode: order.code } });
    req.app.get('io')?.to(`user:${restaurant.owner}`).emit('notification:new', notification);
  }
  req.app.get('io')?.to(`user:${req.user._id}`).emit('delivery:assigned', order);
  res.json(order);
});


// Journal des actions : le Master ne voit que les actions de sa ville.
r.get('/audit', allow('admin','master'), async (req,res) => {
  const query = req.user.role==='master' ? {city:{$in:citiesForMaster(req.user)}} : {};
  const rows=await AuditLog.find(query).populate('actor','name role').populate('restaurant','name city').sort({createdAt:-1}).limit(200).lean();
  res.set('Cache-Control','no-store');
  res.json(rows);
});

export default r;
