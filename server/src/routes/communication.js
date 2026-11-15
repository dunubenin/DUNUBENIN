
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import {
  Message,
  Call,
  User,
  Order,
  Restaurant,
  Notification
} from '../models/index.js';

const r = Router();
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 45, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de messages envoyés. Patientez un instant.' } });
const callLimiter = rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives d’appel. Réessayez dans une minute.' } });

r.use(auth);

// Vérifie si deux utilisateurs ont le droit de communiquer.
async function canCommunicate(user, otherId) {
  const other = await User.findOne({ _id: otherId, status: 'active', deletedAt: null }).select('_id role city');
  if (!other) return false;
  if (user.role === 'admin') return true;
  if (other.role === 'admin') return true;
  if (user.role === 'finance' || other.role === 'finance') return false;
  if (user.role === 'master') {
    const cities = [...new Set([...(user.masterCities || []), user.city].filter(Boolean))];
    if (other.role === 'client') {
      const restaurantIds = await Restaurant.find({ city: { $in: cities } }).distinct('_id');
      return !!(restaurantIds.length && await Order.exists({ restaurant: { $in: restaurantIds }, customer: other._id }));
    }
    if (other.role === 'restaurant') {
      return !!(await Restaurant.exists({ owner: other._id, city: { $in: cities } }));
    }
    return false;
  }
  if (other.role === 'master') return false;
  // Client ↔ restaurant : autorisé uniquement lorsqu'une commande les relie.
  if ((user.role === 'client' && other.role === 'restaurant') || (user.role === 'restaurant' && other.role === 'client')) {
    const restaurantIds = await Restaurant.find({ owner: user.role === 'restaurant' ? user._id : other._id }).distinct('_id');
    return !!(restaurantIds.length && await Order.exists({
      restaurant: { $in: restaurantIds },
      customer: user.role === 'client' ? user._id : other._id
    }));
  }
  const sharedOrder = await Order.exists({
    $or: [
      { customer: user._id, rider: other._id },
      { customer: other._id, rider: user._id }
    ]
  });
  if (user.role === 'client' && other.role === 'rider') return !!sharedOrder;
  if (user.role === 'rider' && other.role === 'client') return !!sharedOrder;
  if (user.role === 'restaurant' && other.role === 'rider') {
    const restaurantIds = await Restaurant.find({ owner: user._id }).distinct('_id');
    return !!(restaurantIds.length && await Order.exists({ restaurant: { $in: restaurantIds }, rider: other._id }));
  }
  if (user.role === 'rider' && other.role === 'restaurant') {
    const restaurantIds = await Restaurant.find({ owner: other._id }).distinct('_id');
    return !!(restaurantIds.length && await Order.exists({ restaurant: { $in: restaurantIds }, rider: user._id }));
  }
  return false;
}

r.get('/contacts', async (req, res) => {
  if (req.query.restaurantId && mongoose.isValidObjectId(String(req.query.restaurantId))) {
    const restaurant = await Restaurant.findOne({ _id: req.query.restaurantId, approved: true, active: true }).select('owner');
    if (!restaurant) return res.status(404).json({ error: 'Restaurant indisponible.' });
    const owner = await User.findOne({ _id: restaurant.owner, status: 'active', deletedAt: null }).select('_id name role city');
    if (!owner) return res.status(404).json({ error: 'Contact du restaurant indisponible.' });
    return res.json([{ id: String(owner._id), name: owner.name, role: owner.role, city: owner.city }]);
  }
  const candidates = await User.find({ status: 'active', deletedAt: null, _id: { $ne: req.user._id } }).select('_id name role city').sort({ name: 1 }).limit(250);
  const allowed = [];
  for (const candidate of candidates) {
    if (await canCommunicate(req.user, candidate._id)) allowed.push({ id: String(candidate._id), name: candidate.name, role: candidate.role, city: candidate.city });
  }
  res.json(allowed);
});

// Identifiant unique de conversation entre deux utilisateurs.
function pairFor(userId, otherId) {
  return [String(userId), String(otherId)]
    .sort()
    .join(':');
}

// =====================================================
// CLOUDFLARE TURN : CONFIGURATION DES SERVEURS AUDIO
// =====================================================

r.get('/ice-servers', async (req, res) => {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

  const fallbackIceServers = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun.cloudflare.com:3478'
      ]
    }
  ];

  let iceServers = fallbackIceServers;
  let turnConfigured = false;

  if (keyId && apiToken) {
    const ttlValue = Number(
      process.env.CLOUDFLARE_TURN_TTL || 86400
    );

    const ttl = Number.isFinite(ttlValue)
      ? Math.min(86400, Math.max(60, Math.floor(ttlValue)))
      : 86400;

    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl }),
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!response.ok) {
        throw new Error(
          `Cloudflare HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (
        !Array.isArray(data.iceServers) ||
        data.iceServers.length === 0
      ) {
        throw new Error('Réponse Cloudflare invalide.');
      }

      iceServers = data.iceServers;

      turnConfigured = iceServers.some(server => {
        const urls = Array.isArray(server.urls)
          ? server.urls
          : [server.urls];

        return urls.some(
          url =>
            typeof url === 'string' &&
            url.startsWith('turn')
        );
      });

    } catch (error) {
      console.error(
        'Erreur Cloudflare TURN :',
        error.message
      );
    }
  }

  res.set('Cache-Control', 'private, no-store');

  res.json({
    iceServers,
    turnConfigured
  });
});

// =====================================================
// MESSAGERIE : RÉCUPÉRATION DES MESSAGES
// =====================================================

r.get('/messages/:conversationId', async (req, res) => {
  const parts = String(
    req.params.conversationId || ''
  ).split(':');

  if (
    parts.length !== 2 ||
    !parts.includes(String(req.user._id)) ||
    parts.some(x => !mongoose.isValidObjectId(x))
  ) {
    return res.status(403).json({
      error: 'Conversation non autorisée.'
    });
  }

  const otherId = parts.find(x => x !== String(req.user._id));
  const selectedRestaurant = req.user.role === 'client' && mongoose.isValidObjectId(req.query.restaurantId)
    ? await Restaurant.exists({ _id: req.query.restaurantId, owner: otherId, approved: true, active: true })
    : false;
  if (!otherId || (!selectedRestaurant && !(await canCommunicate(req.user, otherId)))) {
    return res.status(403).json({ error: 'Cette conversation n’est pas autorisée.' });
  }

  const rows = await Message.find({
    conversationId: req.params.conversationId,
    $or: [{ sender: req.user._id }, { recipient: req.user._id }]
  })
    .sort({ createdAt: 1 })
    .limit(200);

  res.json(rows);
});

// =====================================================
// MESSAGERIE : ENVOI D'UN MESSAGE
// =====================================================

r.post('/messages', messageLimiter, async (req, res) => {
  let recipientId = String(req.body?.recipientId || '');
  const body = String(
    req.body?.body || ''
  ).trim();

  if (req.user.role === 'client' && mongoose.isValidObjectId(req.body?.restaurantId)) {
    const restaurant = await Restaurant.findOne({ _id: req.body.restaurantId, approved: true, active: true }).select('owner');
    if (!restaurant) return res.status(404).json({ error: 'Restaurant indisponible.' });
    recipientId = String(restaurant.owner);
  }

  if (!mongoose.isValidObjectId(recipientId) || recipientId === String(req.user._id) || !body || body.length > 2000) {
    return res.status(400).json({
      error: 'Destinataire ou message invalide.'
    });
  }

  const recipient = await User.findOne({
    _id: recipientId,
    status: 'active'
  }).select('_id');

  if (!recipient) {
    return res.status(404).json({
      error: 'Destinataire introuvable.'
    });
  }

  const restaurantMessage = req.user.role === 'client' && mongoose.isValidObjectId(req.body?.restaurantId) && await Restaurant.exists({ _id: req.body.restaurantId, owner: recipient._id, approved: true, active: true });
  if (!restaurantMessage && !(await canCommunicate(req.user, recipient._id))) {
    return res.status(403).json({
      error:
        'La messagerie est réservée aux personnes liées à une même commande.'
    });
  }

  const conversationId = pairFor(
    req.user._id,
    recipient._id
  );

  const message = await Message.create({
    conversationId,
    sender: req.user._id,
    recipient: recipient._id,
    body,
    kind: 'text'
  });

  req.app.get('io')
    ?.to(`user:${recipient._id}`)
    .emit('message:new', message);

  req.app.get('io')
    ?.to(`user:${req.user._id}`)
    .emit('message:new', message);

  const notification = await Notification.create({
    user: recipient._id,
    type: 'message',
    title: 'Nouveau message',
    body: `Vous avez reçu un message de ${req.user.name}.`,
    link: '/dashboard'
  });

  req.app.get('io')
    ?.to(`user:${recipient._id}`)
    .emit('notification:new', notification);

  res.status(201).json(message);
});

// =====================================================
// MESSAGERIE : MARQUER UN MESSAGE COMME LU
// =====================================================

r.patch('/messages/:id/read', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      error: 'Message invalide.'
    });
  }

  const message = await Message.findOneAndUpdate(
    {
      _id: req.params.id,
      recipient: req.user._id,
      readAt: null
    },
    {
      $set: {
        readAt: new Date()
      }
    },
    {
      new: true
    }
  );

  if (!message) {
    return res.status(404).json({
      error: 'Message introuvable.'
    });
  }

  res.json(message);
});

// Récupération de secours des appels entrants si Socket.IO était déconnecté au moment de l'appel.
r.get('/calls/incoming', async (req, res) => {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const calls = await Call.find({ callee: req.user._id, status: 'ringing', createdAt: { $gte: cutoff } })
    .populate('caller', 'name')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  res.set('Cache-Control', 'no-store');
  res.json(calls.map(call => ({ roomId: call.roomId, caller: { id: String(call.caller?._id || ''), name: call.caller?.name || 'Un utilisateur' }, kind: call.kind || 'audio' })));
});

// =====================================================
// APPELS : CRÉATION D'UN APPEL AUDIO UNIQUEMENT
// =====================================================

r.post('/calls', callLimiter, async (req, res) => {
  let { calleeId } = req.body || {};
  const { restaurantId } = req.body || {};

  // Un client appelle le restaurant lié au plat/à la fiche sélectionnée.
  if (req.user.role === 'client' && mongoose.isValidObjectId(restaurantId)) {
    const selectedRestaurant = await Restaurant.findOne({
      _id: restaurantId, approved: true, active: true
    }).select('_id owner city');
    if (!selectedRestaurant) return res.status(404).json({ error: 'Restaurant indisponible.' });
    calleeId = String(selectedRestaurant.owner);
  }

  if (
    !mongoose.isValidObjectId(calleeId) ||
    String(calleeId) === String(req.user._id)
  ) {
    return res.status(400).json({
      error: 'Destinataire invalide.'
    });
  }

  const callee = await User.findOne({
    _id: calleeId,
    status: 'active'
  }).select('_id name');

  if (!callee) {
    return res.status(404).json({
      error: 'Destinataire indisponible.'
    });
  }

  if (req.user.role === 'client' && (!restaurantId || callee.role !== 'restaurant')) {
    return res.status(403).json({ error: 'Un client peut appeler un restaurant depuis sa fiche ou un plat associé.' });
  }

  const selectedRestaurantCall = req.user.role === 'client' && mongoose.isValidObjectId(restaurantId) && callee.role === 'restaurant';
  if (!selectedRestaurantCall && !(await canCommunicate(req.user, callee._id))) {
    return res.status(403).json({
      error:
        'Les appels sont réservés aux personnes liées à une même commande.'
    });
  }

  const roomId = `dunu-${new mongoose.Types.ObjectId().toString()}`;

  const call = await Call.create({
    roomId,
    caller: req.user._id,
    callee: callee._id,
    kind: 'audio',
    status: 'ringing'
  });

  req.app.get('io')
    ?.to(`user:${callee._id}`)
    .emit('call:incoming', {
      roomId,
      caller: {
        id: req.user.id,
        name: req.user.name
      },
      kind: 'audio'
    });

  const notification = await Notification.create({
    user: callee._id,
    type: 'call',
    title: 'Appel audio entrant',
    body: `Appel audio de ${req.user.name}.`,
    link: '/dashboard',
    metadata: { roomId }
  });

  req.app.get('io')
    ?.to(`user:${callee._id}`)
    .emit('notification:new', notification);

  res.status(201).json({ ...call.toObject(), calleeId: String(callee._id) });
});

// =====================================================
// APPELS : ACCEPTER, REFUSER OU TERMINER
// =====================================================

r.patch('/calls/:roomId', async (req, res) => {
  const call = await Call.findOne({
    roomId: req.params.roomId
  });

  if (!call) {
    return res.status(404).json({
      error: 'Appel introuvable.'
    });
  }

  const isParticipant = [
    String(call.caller),
    String(call.callee)
  ].includes(String(req.user._id));

  if (!isParticipant && req.user.role !== 'admin') {
    return res.sendStatus(403);
  }

  const next = String(
    req.body?.status || ''
  );

  if (
    !['accepted', 'rejected', 'ended', 'missed'].includes(next)
  ) {
    return res.status(400).json({
      error: 'Statut d’appel invalide.'
    });
  }

  if (
    ['ended', 'rejected', 'missed'].includes(call.status)
  ) {
    return res.status(409).json({
      error: 'Cet appel est déjà terminé.'
    });
  }

  if (
    ['accepted', 'rejected', 'missed'].includes(next) &&
    String(call.callee) !== String(req.user._id) &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({
      error:
        'Seul le destinataire peut accepter ou refuser cet appel.'
    });
  }

  if (
    next === 'accepted' &&
    call.status !== 'ringing'
  ) {
    return res.status(409).json({
      error: 'Cet appel ne peut plus être accepté.'
    });
  }

  if (
    next === 'ended' &&
    !['ringing', 'accepted'].includes(call.status)
  ) {
    return res.status(409).json({
      error: 'Transition d’appel impossible.'
    });
  }

  call.status = next;

  if (next === 'accepted') {
    call.startedAt = new Date();
  }

  if (
    ['ended', 'rejected', 'missed'].includes(next)
  ) {
    call.endedAt = new Date();
  }

  await call.save();

  req.app.get('io')
    ?.to(`user:${call.caller}`)
    .to(`user:${call.callee}`)
    .emit('call:status', {
      roomId: call.roomId,
      status: call.status
    });

  res.json(call);
});

export default r;
