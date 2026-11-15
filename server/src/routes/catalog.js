import { Router } from 'express';
import mongoose from 'mongoose';
import { Restaurant, MenuItem, User, City, AuditLog } from '../models/index.js';
import { auth, allow } from '../middleware/auth.js';
import { uploadSignature } from '../services/cloudinary.js';
import { BENIN_COMMUNES, BENIN_COMMUNE_NAMES } from '../data/benin-communes.js';

const r = Router();
const cleanOptions = value => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map(group => ({
    name: String(group?.name || '').trim().slice(0, 60),
    required: group?.required === true,
    choices: (Array.isArray(group?.choices) ? group.choices : []).slice(0, 20).map(choice => ({
      name: String(choice?.name || '').trim().slice(0, 60),
      price: Number.isSafeInteger(Number(choice?.price)) && Number(choice.price) >= 0 ? Number(choice.price) : 0
    })).filter(choice => choice.name)
  })).filter(group => group.name && group.choices.length);
};
async function audit(req, action, targetType, targetId, restaurant, details = {}) {
  try { await AuditLog.create({ actor:req.user._id, actorRole:req.user.role, action, targetType, targetId:String(targetId||''), restaurant:restaurant?._id||restaurant||undefined, city:restaurant?.city||req.user.city||'', details, ip:req.ip||'' }); } catch (e) { console.error('Audit DUNU:', e.message); }
}


function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Référentiel national complet pour les formulaires d'inscription.
// Il est séparé des villes ouvertes à la livraison afin de ne pas exposer
// automatiquement toutes les communes dans les filtres opérationnels du catalogue.
r.get('/registration-cities', async (_req, res) => {
  const configured = await City.find({}).select('name department active neighborhoods deliveryZones').lean();
  const byName = new Map(configured.map(city => [city.name.toLocaleLowerCase('fr'), city]));
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(BENIN_COMMUNES.map(commune => {
    const city = byName.get(commune.name.toLocaleLowerCase('fr'));
    return {
      name: commune.name,
      department: commune.department,
      active: city?.active === true,
      neighborhoods: city?.neighborhoods || [],
      deliveryZones: city?.deliveryZones || []
    };
  }));
});

r.get('/cities', async (_req, res) => {
  const [configured, restaurantCities] = await Promise.all([City.find({ active: true }).sort({ name: 1 }), Restaurant.distinct('city', { approved: true, active: true })]);
  const byName = new Map(configured.map(city => [city.name.toLocaleLowerCase('fr'), city.toObject()]));
  for (const name of restaurantCities.filter(Boolean)) if (!byName.has(String(name).toLocaleLowerCase('fr'))) byName.set(String(name).toLocaleLowerCase('fr'), { name, neighborhoods: [], deliveryZones: [] });
  res.json([...byName.values()].sort((a,b) => a.name.localeCompare(b.name, 'fr')));
});

r.get('/restaurants', async (req, res) => {
  const query = { approved: true, active: true };
  if (typeof req.query.city === 'string' && req.query.city.trim()) query.city = req.query.city.trim();
  if (typeof req.query.zone === 'string' && req.query.zone.trim()) query.$or = [{ deliveryZones: req.query.zone.trim() }, { deliveryZones: { $exists: false } }, { deliveryZones: { $size: 0 } }];
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const hasCoordinates = req.query.lat !== undefined && req.query.lng !== undefined && validCoordinates(lat, lng);
  const rows = await Restaurant.find(query).select('-owner -subscription -walletReserved').lean();
  const publicRows = rows.map(({ walletBalance, ...row }) => ({ ...row, cashPaymentEnabled: Number(walletBalance || 0) >= 1000 }));
  if (hasCoordinates) {
    const enriched = publicRows.map(row => ({ ...row, distanceKm: row.location && validCoordinates(Number(row.location.lat), Number(row.location.lng)) ? Number(distanceKm(lat, lng, Number(row.location.lat), Number(row.location.lng)).toFixed(1)) : null }));
    enriched.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name, 'fr'));
    return res.json(enriched);
  }
  res.json(publicRows.sort((a, b) => a.name.localeCompare(b.name, 'fr')));
});

// Catalogue commun des plats : le client découvre les menus sans devoir ouvrir chaque restaurant séparément.
r.get('/dishes', async (req, res) => {
  const query = { available: true };
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const term = req.query.q.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: term, $options: 'i' } }, { description: { $regex: term, $options: 'i' } }, { category: { $regex: term, $options: 'i' } }];
  }
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const hasCoordinates = req.query.lat !== undefined && req.query.lng !== undefined && validCoordinates(lat, lng);
  const items = await MenuItem.find(query).sort({ createdAt: -1 }).limit(250).populate({
    path: 'restaurant',
    match: { approved: true, active: true, ...(typeof req.query.city === 'string' && req.query.city.trim() ? { city: req.query.city.trim() } : {}) },
    select: 'name city address location deliveryZones categories'
  }).lean();
  let rows = items.filter(item => item.restaurant);
  if (typeof req.query.zone === 'string' && req.query.zone.trim()) {
    const zone = req.query.zone.trim();
    rows = rows.filter(item => !item.restaurant.deliveryZones?.length || item.restaurant.deliveryZones.includes(zone));
  }
  rows = rows.map(item => ({ ...item, distanceKm: hasCoordinates && item.restaurant.location && validCoordinates(Number(item.restaurant.location.lat), Number(item.restaurant.location.lng)) ? Number(distanceKm(lat, lng, Number(item.restaurant.location.lat), Number(item.restaurant.location.lng)).toFixed(1)) : null }));
  if (hasCoordinates) rows.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  res.json(rows.slice(0, 120));
});

r.get('/restaurants/:id/menu', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Restaurant invalide' });
  const restaurant = await Restaurant.findOne({ _id: req.params.id, approved: true, active: true }).select('_id');
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  res.json(await MenuItem.find({ restaurant: restaurant._id, available: true }).select('-__v'));
});

r.post('/restaurants', auth, allow('restaurant'), async (req, res) => {
  const { name, description, phone, address, city, location, categories, openingHours } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120) return res.status(400).json({ error: 'Nom du restaurant invalide' });
  const restaurantCity = typeof city === 'string' ? city.trim() : '';
  if (!BENIN_COMMUNE_NAMES.has(restaurantCity)) return res.status(400).json({ error: 'Sélectionnez une commune valide du Bénin.' });
  const deliveryZones = Array.isArray(req.body.deliveryZones) ? [...new Set(req.body.deliveryZones.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 100) : [];
  if (!deliveryZones.length || deliveryZones.some(zone => zone.length > 100)) return res.status(400).json({ error: 'Indiquez au moins une zone de livraison valide (100 caractères maximum par zone).' });
  const existing = await Restaurant.findOne({ owner: req.user._id });
  if (existing) return res.status(409).json({ error: 'Un restaurant est déjà associé à ce compte' });
  if (location && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180)) return res.status(400).json({ error: 'Coordonnées invalides' });
  const row = await Restaurant.create({
    owner: req.user._id,
    name: name.trim(),
    description: typeof description === 'string' ? description.slice(0, 2000) : '',
    phone: typeof phone === 'string' ? phone.slice(0, 30) : '',
    address: typeof address === 'string' ? address.slice(0, 300) : '',
    city: restaurantCity,
    deliveryZones,
    location,
    categories: Array.isArray(categories) ? categories.filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 50)) : [],
    openingHours: typeof openingHours === 'string' ? openingHours.slice(0, 500) : '',
    approved: false,
    active: false,
    walletBalance: 0,
    codEnabled: false
  });
  res.status(201).json({ message: 'Demande de création envoyée. Le restaurant doit être validé par DUNU.', restaurant: row });
});

r.post('/menu', auth, allow('restaurant', 'admin'), async (req, res) => {
  const restaurant = req.user.role === 'admin' && req.body.restaurantId
    ? await Restaurant.findById(req.body.restaurantId)
    : await Restaurant.findOne({ owner: req.user._id });
  if (!restaurant) return res.status(400).json({ error: 'Créez votre restaurant' });
  if (req.user.role !== 'admin' && (!restaurant.approved || !restaurant.active)) return res.status(403).json({ error: 'Votre restaurant doit être validé et activé avant de publier des plats' });
  const { name, description, price, imageUrls, videoUrls, category, available, stock, options, customizationNotes } = req.body || {};
  const amount = Number(price);
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120 || !Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error: 'Nom ou prix du plat invalide (prix en FCFA, entier positif)' });
  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ error: 'Stock invalide' });
  const images = Array.isArray(imageUrls) ? imageUrls.filter(url => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 4) : [];
  const videos = Array.isArray(videoUrls) ? videoUrls.filter(url => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 1) : [];
  const item = await MenuItem.create({
    restaurant: restaurant._id,
    name: name.trim(),
    description: typeof description === 'string' ? description.slice(0, 1500) : '',
    price: amount,
    imageUrls: images,
    videoUrls: videos,
    category: typeof category === 'string' ? category.slice(0, 60) : '',
    available: available !== false,
    ...(stock !== undefined ? { stock: Number(stock) } : {})
  });
  await audit(req, 'menu.create', 'MenuItem', item._id, restaurant, { name:item.name, price:item.price });
  res.status(201).json(item);
});


// Modifier ou retirer un plat appartenant exclusivement au restaurant connecté.
r.patch('/menu/:id', auth, allow('restaurant', 'admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Plat invalide' });
  const item = await MenuItem.findById(req.params.id);
  const restaurant = item ? await Restaurant.findById(item.restaurant).select('_id owner approved active') : null;
  if (!item || !restaurant) return res.status(404).json({ error: 'Plat introuvable' });
  if (req.user.role === 'restaurant' && (String(restaurant.owner) !== String(req.user._id) || !restaurant.approved || !restaurant.active)) return res.status(403).json({ error: 'Accès refusé à ce menu' });
  if (!item) return res.status(404).json({ error: 'Plat introuvable' });
  const { name, description, price, category, available, stock, imageUrls, videoUrls, options, customizationNotes } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120) return res.status(400).json({ error: 'Nom invalide' });
    item.name = name.trim();
  }
  if (price !== undefined) {
    const amount = Number(price);
    if (!Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error: 'Prix invalide : indiquez un montant entier en FCFA' });
    item.price = amount;
  }
  if (description !== undefined) item.description = String(description).slice(0, 1500);
  if (category !== undefined) item.category = String(category).slice(0, 60);
  if (available !== undefined) item.available = Boolean(available);
  if (stock !== undefined) {
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) return res.status(400).json({ error: 'Stock invalide' });
    item.stock = Number(stock);
  }
  if (imageUrls !== undefined) item.imageUrls = Array.isArray(imageUrls) ? imageUrls.filter(x => typeof x === 'string' && /^https:\/\//i.test(x)).slice(0, 4) : [];
  if (videoUrls !== undefined) item.videoUrls = Array.isArray(videoUrls) ? videoUrls.filter(x => typeof x === 'string' && /^https:\/\//i.test(x)).slice(0, 1) : [];
  if (options !== undefined) item.options = cleanOptions(options);
  if (customizationNotes !== undefined) item.customizationNotes = Boolean(customizationNotes);
  await item.save();
  res.json(item);
});

r.delete('/menu/:id', auth, allow('restaurant', 'admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Plat invalide' });
  const item = await MenuItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Plat introuvable' });
  const restaurant = await Restaurant.findById(item.restaurant).select('_id owner');
  if (!restaurant || (req.user.role === 'restaurant' && String(restaurant.owner) !== String(req.user._id))) return res.status(403).json({ error: 'Accès refusé à ce menu' });
  await item.deleteOne();
  res.json({ message: 'Plat supprimé du menu' });
});

// Consultation du menu d'un restaurant par l'administrateur national.
r.get('/admin/restaurants/:restaurantId/menu', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.status(400).json({ error: 'Restaurant invalide' });
  const restaurant = await Restaurant.findById(req.params.restaurantId).select('name city approved active');
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  const menu = await MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 });
  res.set('Cache-Control', 'no-store');
  res.json({ restaurant, menu });
});

r.get('/restaurant/me', auth, allow('restaurant'), async (req, res) => {
  const restaurant = await Restaurant.findOne({ owner: req.user._id }).select('-walletBalance');
  if (!restaurant) return res.status(404).json({ error: 'Restaurant non créé' });
  const menu = await MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 });
  res.json({ restaurant, menu });
});

r.get('/upload-signature', auth, allow('restaurant', 'admin'), async (req, res) => {
  try {
    if (req.user.role === 'restaurant') {
      const restaurant = await Restaurant.findOne({ owner: req.user._id, approved: true, active: true }).select('_id');
      if (!restaurant) return res.status(403).json({ error: 'Restaurant non validé' });
    }
    const resourceType = req.query.resourceType === 'video' ? 'video' : 'image';
    res.json(uploadSignature(resourceType));
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

r.get('/admin/pending', auth, allow('admin'), async (req, res) => {
  res.json({
    restaurants: await Restaurant.find({ approved: false }),
    users: await User.find({ status: 'pending' }).select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt')
  });
});

r.patch('/admin/restaurants/:id/approve', auth, allow('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body?.approved !== 'boolean') return res.status(400).json({ error: 'Identifiant ou décision invalide' });
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { approved: req.body.approved, active: req.body.approved } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  res.json(restaurant);
});



// Le restaurant peut proposer l'ajout/retrait de ses zones. Aucune modification
// n'est appliquée au catalogue avant validation de l'administration nationale.
r.put('/restaurant/me/delivery-zones', auth, allow('restaurant'), async (req,res) => {
  const shop=await Restaurant.findOne({owner:req.user._id,approved:true,active:true});
  if(!shop)return res.status(403).json({error:'Restaurant non validé ou inactif'});
  const zones=[...new Set((Array.isArray(req.body?.zones)?req.body.zones:[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,100);
  if(!zones.length||zones.some(x=>x.length>100))return res.status(400).json({error:'Proposez au moins une zone valide (100 caractères maximum).'});
  const latest=(shop.deliveryZoneRequests||[]).filter(x=>x.status==='pending');
  if(latest.length) return res.status(409).json({error:'Une demande de modification de zones est déjà en attente de validation DUNU.'});
  shop.deliveryZoneRequests.push({zones,status:'pending',requestedAt:new Date(),note:'Proposition du restaurant'});
  await shop.save();
  res.json({message:'Votre proposition de zones a été transmise à DUNU. Vos zones actuelles restent actives jusqu’à validation.',request:shop.deliveryZoneRequests[shop.deliveryZoneRequests.length-1]});
});
r.get('/admin/delivery-zone-requests', auth, allow('admin'), async (_req,res)=>{
  const shops=await Restaurant.find({'deliveryZoneRequests.status':'pending'}).select('name city deliveryZones deliveryZoneRequests').lean();
  res.json(shops.map(shop=>({...shop,deliveryZoneRequests:(shop.deliveryZoneRequests||[]).filter(x=>x.status==='pending')})));
});
r.patch('/admin/delivery-zone-requests/:restaurantId/:requestId', auth, allow('admin'), async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.restaurantId)||!mongoose.isValidObjectId(req.params.requestId))return res.status(400).json({error:'Identifiant invalide'});
  const decision=req.body?.decision;
  if(!['approve','reject'].includes(decision))return res.status(400).json({error:'Décision invalide'});
  const shop=await Restaurant.findById(req.params.restaurantId);if(!shop)return res.status(404).json({error:'Restaurant introuvable'});
  const request=shop.deliveryZoneRequests.id(req.params.requestId);if(!request||request.status!=='pending')return res.status(404).json({error:'Demande introuvable ou déjà traitée'});
  if(decision==='approve'){
    const zones=[...new Set(request.zones.map(x=>String(x).trim()).filter(Boolean))];if(!zones.length)return res.status(400).json({error:'La liste des zones est vide.'});
    shop.deliveryZones=zones;
    const city=await City.findOne({name:shop.city})||new City({name:shop.city});city.active=true;city.deliveryZones=Array.isArray(city.deliveryZones)?city.deliveryZones:[];
    for(const zoneName of zones){const found=city.deliveryZones.find(z=>String(z.name||'').toLowerCase()===zoneName.toLowerCase());if(found)found.active=true;else city.deliveryZones.push({name:zoneName,fee:700,active:true});}
    await city.save();
  }
  request.status=decision==='approve'?'approved':'rejected';request.reviewedAt=new Date();request.reviewedBy=req.user._id;request.note=String(req.body?.note||'').slice(0,300);
  await shop.save();
  await audit(req,'restaurant.delivery_zones.reviewed','Restaurant',shop._id,shop,{decision,zones:request.zones});
  res.json({message:decision==='approve'?'Zones du restaurant mises à jour.':'Demande de zones refusée.',deliveryZones:shop.deliveryZones,request});
});

// Livreurs rattachés à un restaurant : accès réservé au propriétaire de la boutique.
// Tarifs fixes par zone : le restaurant propose, DUNU valide avant application.
r.put('/restaurant/me/delivery-fees', auth, allow('restaurant'), async (req,res) => {
  const shop = await Restaurant.findOne({ owner:req.user._id, approved:true, active:true });
  if (!shop) return res.status(403).json({error:'Restaurant non validé ou inactif'});
  const proposals = Array.isArray(req.body?.fees) ? req.body.fees : [];
  if (!proposals.length || proposals.length > 50) return res.status(400).json({error:'Proposez au moins un tarif de zone.'});
  const rows=[];
  for (const item of proposals) {
    const zone=String(item?.zone||'').trim(); const fee=Number(item?.fee);
    if (!zone || !shop.deliveryZones.includes(zone) || !Number.isSafeInteger(fee) || fee<0 || fee>100000) return res.status(400).json({error:`Tarif ou zone invalide : ${zone||'zone vide'}`});
    const existing=(shop.deliveryZoneFees||[]).find(x=>x.zone===zone&&x.status==='approved');
    rows.push({zone,fee,status:'pending',requestedAt:new Date(),note:existing?'Modification proposée par le restaurant':'Nouveau tarif proposé'});
  }
  for (const row of rows) {
    shop.deliveryZoneFees=shop.deliveryZoneFees.filter(x=>!(x.zone===row.zone&&x.status==='pending'));
    shop.deliveryZoneFees.push(row);
  }
  await shop.save();
  res.json({message:'Tarifs envoyés à DUNU pour validation. Les tarifs approuvés actuels restent actifs en attendant.',deliveryZoneFees:shop.deliveryZoneFees});
});
r.get('/admin/delivery-fee-requests', auth, allow('admin'), async (req,res) => {
  const shops=await Restaurant.find({'deliveryZoneFees.status':'pending'}).select('name city deliveryZoneFees').lean();
  res.json(shops.map(shop=>({...shop,deliveryZoneFees:(shop.deliveryZoneFees||[]).filter(x=>x.status==='pending')})));
});
r.patch('/admin/delivery-fee-requests/:restaurantId/:zone', auth, allow('admin'), async (req,res) => {
  const {decision,note=''}=req.body||{};
  if (!['approve','reject'].includes(decision)) return res.status(400).json({error:'Décision invalide'});
  const shop=await Restaurant.findById(req.params.restaurantId);
  if(!shop)return res.status(404).json({error:'Restaurant introuvable'});
  const row=shop.deliveryZoneFees.find(x=>x.zone===decodeURIComponent(req.params.zone)&&x.status==='pending');
  if(!row)return res.status(404).json({error:'Proposition en attente introuvable'});
  if(decision==='approve'){for(const previous of shop.deliveryZoneFees){if(previous.zone===row.zone&&previous.status==='approved')previous.status='superseded';}}
  row.status=decision==='approve'?'approved':'rejected'; row.reviewedAt=new Date(); row.reviewedBy=req.user._id; row.note=String(note).slice(0,300);
  await shop.save();
  const owner=await User.findById(shop.owner).select('_id');
  if(owner){const {Notification}=await import('../models/index.js');const n=await Notification.create({user:owner._id,type:'delivery_fee',title:decision==='approve'?'Tarif de livraison validé':'Tarif de livraison refusé',body:`${row.zone} : ${Number(row.fee).toLocaleString('fr-FR')} FCFA. ${decision==='approve'?'Le tarif est maintenant actif.':row.note||'Contactez DUNU pour plus de détails.'}`,link:'/dashboard'});req.app.get('io')?.to(`user:${owner._id}`).emit('notification:new',n);}
  res.json({message:decision==='approve'?'Tarif validé et activé.':'Proposition refusée.',row});
});

r.get('/restaurant/me/riders', auth, allow('restaurant'), async (req,res) => {
  const shop = await Restaurant.findOne({ owner:req.user._id }).select('_id city');
  if (!shop) return res.status(404).json({error:'Restaurant introuvable'});
  const riders = await User.find({ role:'rider', city:shop.city, status:'active', deletedAt:null, $or:[{restaurantId:shop._id},{restaurantId:null},{restaurantId:{$exists:false}}] }).select('name phone city isOnline status lastSeen restaurantId').sort({name:1}).lean();
  res.json(riders.map(r=>({...r, own: String(r.restaurantId||'')===String(shop._id)})));
});
r.post('/restaurant/me/riders', auth, allow('restaurant'), async (req,res) => {
  const shop = await Restaurant.findOne({ owner:req.user._id }).select('_id city approved active');
  if (!shop || !shop.approved || !shop.active) return res.status(403).json({error:'Restaurant non validé ou inactif'});
  const riderId = String(req.body?.riderId||'');
  if (!mongoose.isValidObjectId(riderId)) return res.status(400).json({error:'Livreur invalide'});
  const rider = await User.findOne({_id:riderId,role:'rider',status:'active',deletedAt:null});
  if (!rider) return res.status(404).json({error:'Livreur actif introuvable'});
  if (rider.restaurantId && String(rider.restaurantId)!==String(shop._id)) return res.status(409).json({error:'Ce livreur est déjà rattaché à un autre restaurant'});
  if (rider.city && shop.city && rider.city.toLowerCase()!==shop.city.toLowerCase()) return res.status(409).json({error:'Le livreur doit être dans la même ville'});
  rider.restaurantId=shop._id; await rider.save();
  await audit(req,'rider.attach','User',rider._id,shop,{riderName:rider.name});
  res.json({id:rider.id,name:rider.name,phone:rider.phone,restaurantId:shop._id});
});
r.delete('/restaurant/me/riders/:id', auth, allow('restaurant'), async (req,res) => {
  const shop = await Restaurant.findOne({owner:req.user._id}).select('_id');
  if (!shop || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({error:'Livreur introuvable'});
  const rider=await User.findOne({_id:req.params.id,role:'rider',restaurantId:shop._id});
  if(!rider)return res.status(404).json({error:'Livreur introuvable dans votre équipe'});
  rider.restaurantId=undefined; await rider.save();
  await audit(req,'rider.detach','User',rider._id,shop,{riderName:rider.name});
  res.json({message:'Livreur retiré de votre équipe'});
});


// Mise à jour du profil d'un restaurant par l'administrateur national.
r.patch('/admin/restaurants/:id', auth, allow('admin'), async (req,res) => {
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({error:'Restaurant invalide'});
  const shop=await Restaurant.findById(req.params.id);
  if(!shop) return res.status(404).json({error:'Restaurant introuvable'});
  const allowed=['name','description','phone','address','city','openingHours','deliveryZones','categories','active','approved'];
  for(const key of allowed) if(req.body?.[key]!==undefined) {
    if(['name','city'].includes(key) && (typeof req.body[key]!=='string'||req.body[key].trim().length<2)) return res.status(400).json({error:`Champ ${key} invalide`});
    if(['active','approved'].includes(key) && typeof req.body[key]!=='boolean') return res.status(400).json({error:`Champ ${key} invalide`});
    if(key==='deliveryZones' && !Array.isArray(req.body[key])) return res.status(400).json({error:'Zones invalides'});
    shop[key]=req.body[key];
  }
  if(!shop.approved) shop.active=false;
  if (shop.approved && Array.isArray(req.body?.deliveryZones)) {
    const confirmedZones = [...new Set(req.body.deliveryZones.filter(zone => typeof zone === 'string').map(zone => zone.trim()).filter(Boolean))].slice(0, 100);
    if (!confirmedZones.length || confirmedZones.some(zone => zone.length > 100)) return res.status(400).json({error:'Un restaurant actif doit conserver au moins une zone de livraison valide.'});
    shop.deliveryZones = confirmedZones;
    const cityConfig = await City.findOne({name:shop.city}) || new City({name:shop.city});
    cityConfig.active = true;
    cityConfig.deliveryZones = Array.isArray(cityConfig.deliveryZones) ? cityConfig.deliveryZones : [];
    for (const name of confirmedZones) {
      const existingZone = cityConfig.deliveryZones.find(zone => String(zone.name || '').trim().toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
      if (existingZone) existingZone.active = true;
      else cityConfig.deliveryZones.push({name,fee:700,active:true});
    }
    await cityConfig.save();
  }
  await shop.save();
  await audit(req,'restaurant.update','Restaurant',shop._id,shop,{fields:Object.keys(req.body||{})});
  res.json(shop);
});

export default r;
