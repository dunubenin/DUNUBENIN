
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';

import { config } from './config.js';
import { BENIN_COMMUNES, INITIAL_OPERATIONAL_COMMUNES } from './data/benin-communes.js';
import { User, Restaurant, Order, City } from './models/index.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import financeRoutes from './routes/finance.js';
import paymentRoutes from './routes/payments.js';
import communicationRoutes from './routes/communication.js';
import operationsRoutes from './routes/operations.js';
import notificationRoutes from './routes/notifications.js';
import adRoutes from './routes/ads.js';
import { auth } from './middleware/auth.js';

const app = express();

// Configuration du proxy Render
// Nécessaire pour express-rate-limit et X-Forwarded-For.
app.set('trust proxy', 1);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.clientOrigin === '*' ? true : config.clientOrigin,
    credentials: true
  }
});

app.set('io', io);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "worker-src": ["'self'", "blob:"],
      "img-src": ["'self'", "data:", "https:"],
      "media-src": ["'self'", "blob:", "https://res.cloudinary.com"],
      "connect-src": ["'self'", "https://api.cloudinary.com", "https://res.cloudinary.com", "https://api.resend.com", "wss:", "https:"]
    }
  }
}));

app.use(cors({
  origin: config.clientOrigin === '*' ? true : config.clientOrigin,
  credentials: true
}));

// FeexPay signs the exact raw JSON bytes; mount this before express.json().
app.use('/webhooks', express.raw({ type: 'application/json', limit: '256kb' }), paymentRoutes);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.use('/api', rateLimit({
  windowMs: 60000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false
}));

// API
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'DUNU BENIN',
    time: new Date().toISOString(),
    database: mongoose.connection.readyState === 1
      ? 'connected'
      : 'disconnected'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ads', adRoutes);

app.get('/api/dashboard', auth, async (req, res) => {
  const role = req.user.role;

  const count = role === 'admin'
    ? await Order.countDocuments()
    : role === 'client'
      ? await Order.countDocuments({ customer: req.user._id })
      : role === 'rider'
        ? await Order.countDocuments({ rider: req.user._id })
        : 0;

  res.json({
    role,
    user: req.user.name,
    orders: count,
    city: req.user.city,
    isOnline: req.user.isOnline === true
  });
});

app.get('/api/admin/overview', auth, async (req, res) => {
  if (!['admin', 'finance'].includes(req.user.role)) {
    return res.sendStatus(403);
  }

  const [orders, restaurants, users] = await Promise.all([
    Order.countDocuments(),
    Restaurant.countDocuments(),
    User.countDocuments()
  ]);

  res.json({ orders, restaurants, users });
});

// Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentification requise'));
    }

    const jwt = (await import('jsonwebtoken')).default;
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);

    if (!user || user.status !== 'active') {
      return next(new Error('Compte indisponible'));
    }

    socket.user = user;
    next();
  } catch {
    next(new Error('Session invalide'));
  }
});

io.on('connection', socket => {
  const u = socket.user;

  socket.join(`user:${u._id}`);
  socket.join(`role:${u.role}`);

  socket.on('order:watch', async code => {
    if (typeof code !== 'string' || code.length > 40) return;

    const order = await Order.findOne({ code })
      .select('customer rider restaurant');

    if (!order) return;

    const isCustomer = String(order.customer) === String(u._id);
    const isRider = String(order.rider || '') === String(u._id);
    const isAdmin = u.role === 'admin';

    const isRestaurant =
      u.role === 'restaurant' &&
      await Restaurant.exists({
        _id: order.restaurant,
        owner: u._id
      });

    const isMaster =
      u.role === 'master' &&
      await Restaurant.exists({
        _id: order.restaurant,
        city: u.city
      });

    if (isCustomer || isRider || isAdmin || isRestaurant || isMaster) {
      socket.join(`order:${code}`);
    }
  });

  socket.on('location:update', async data => {
    if (
      u.role !== 'rider' ||
      !Number.isFinite(data?.lat) ||
      !Number.isFinite(data?.lng) ||
      Math.abs(data.lat) > 90 ||
      Math.abs(data.lng) > 180 ||
      (Number.isFinite(data?.accuracy) && data.accuracy > 1000)
    ) return;
    const nowMs = Date.now();
    if (socket.lastLocationAt && nowMs - socket.lastLocationAt < 3000) return;
    socket.lastLocationAt = nowMs;

    const activeOrders = await Order.find({
      rider: u._id,
      status: { $in: ['picked_up', 'on_the_way'] }
    }).select('code');

    if (activeOrders.length) {
      const at = new Date();
      const location = { lat: data.lat, lng: data.lng, at };
      await User.updateOne({ _id: u._id, role: 'rider' }, { $set: { lastLocation: location, lastSeen: at } });
      for (const order of activeOrders) io.to(`order:${order.code}`).emit('location:changed', location);
    }
  });

  socket.on('webrtc:signal', async data => {
    if (!data || typeof data.to !== 'string' || !mongoose.isValidObjectId(data.to) ||
        typeof data.roomId !== 'string' || data.roomId.length > 80 ||
        !data.signal || typeof data.signal !== 'object') return;
    const now = Date.now();
    socket.signalWindow = socket.signalWindow && now - socket.signalWindow.startedAt < 10000
      ? socket.signalWindow : { startedAt: now, count: 0 };
    socket.signalWindow.count += 1;
    if (socket.signalWindow.count > 40) return;
    let signalSize;
    try { signalSize = JSON.stringify(data.signal).length; } catch { return; }
    if (signalSize > 20000) return;
    const isDescription = ['offer', 'answer'].includes(data.signal.type) &&
      typeof data.signal.sdp === 'string' && data.signal.sdp.length <= 16000;
    const isCandidate = data.signal.candidate && typeof data.signal.candidate === 'object' &&
      typeof data.signal.candidate.candidate === 'string' && data.signal.candidate.candidate.length <= 2048;
    if (!isDescription && !isCandidate) return;
    const { Call } = await import('./models/index.js');
    const call = await Call.findOne({
      roomId: data.roomId,
      status: { $in: ['ringing', 'accepted'] },
      $or: [
        { caller: u._id, callee: data.to },
        { caller: data.to, callee: u._id }
      ]
    }).select('_id');
    if (!call) return;
    io.to(`user:${data.to}`).emit('webrtc:signal', {
      from: String(u._id), signal: data.signal, roomId: data.roomId
    });
  });
});

// FRONTEND REACT
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(currentDir, '../../client/dist');

app.use(express.static(frontendDir));

app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/socket.io/')
  ) {
    return next();
  }

  res.sendFile(path.join(frontendDir, 'index.html'), err => {
    if (err) next(err);
  });
});

// Démarrage
async function bootstrap() {
  if (!config.mongo) {
    throw new Error('MONGODB_URI manquant');
  }

  await mongoose.connect(config.mongo);

  // Migration ciblée : une ancienne version de la collection payments avait
  // créé un index unique non-sparse sur depositId. Les paiements actuels
  // n'utilisent plus ce champ ; plusieurs documents sans depositId (null)
  // faisaient donc échouer chaque nouvel insert avec E11000.
  // On ne supprime que cet index historique précis, jamais les index actifs
  // providerReference ou ceux des autres collections.
  const paymentsCollection = mongoose.connection.db.collection('payments');
  const paymentIndexes = await paymentsCollection.indexes();
  const legacyDepositIndex = paymentIndexes.find(index =>
    index.name === 'depositId_1' &&
    index.key?.depositId === 1
  );
  if (legacyDepositIndex) {
    await paymentsCollection.dropIndex('depositId_1');
    console.log('Ancien index unique payments.depositId supprimé (champ non utilisé).');
  }

  // Précharge les 77 communes sans activer la livraison. Les villes déjà
  // configurées conservent leurs quartiers, zones et statut opérationnel.
  await City.bulkWrite(BENIN_COMMUNES.map(({ name, department }) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, department, active: INITIAL_OPERATIONAL_COMMUNES.has(name), neighborhoods: [], deliveryZones: [] } },
      upsert: true
    }
  })), { ordered: false });
  console.log('Référentiel national des 77 communes vérifié.');

  if (config.adminPassword) {
    const configuredAdminIdentifier = String(config.adminEmail || 'ADMIN').trim();
    const configuredAdminEmail = configuredAdminIdentifier.includes('@')
      ? configuredAdminIdentifier.toLowerCase()
      : undefined;

    // ADMIN_EMAIL=ADMIN est un identifiant réservé, jamais une adresse e-mail.
    let exists = await User.findOne({ role: 'admin' });
    if (!exists && configuredAdminEmail) {
      exists = await User.findOne({ email: configuredAdminEmail });
    }

    if (!exists) {
      await User.create({
        name: config.adminName || 'Administrateur national DUNU',
        ...(configuredAdminEmail ? { email: configuredAdminEmail } : {}),
        passwordHash: await bcrypt.hash(config.adminPassword, 12),
        role: 'admin',
        status: 'active',
        city: 'Bénin'
      });
      console.log('Compte administrateur national créé depuis les variables Render.');
    } else {
      const passwordMatches = await bcrypt.compare(config.adminPassword, exists.passwordHash);
      const needsSave = exists.role !== 'admin' || exists.status !== 'active' || exists.city !== 'Bénin' || !passwordMatches || (!configuredAdminEmail && String(exists.email || '').toLowerCase() === 'admin');
      exists.role = 'admin';
      exists.status = 'active';
      exists.city = 'Bénin';
      if (!passwordMatches) exists.passwordHash = await bcrypt.hash(config.adminPassword, 12);
      if (!configuredAdminEmail && String(exists.email || '').toLowerCase() === 'admin') exists.email = undefined;
      if (configuredAdminEmail && !exists.email) exists.email = configuredAdminEmail;
      if (!exists.name) exists.name = config.adminName || 'Administrateur national DUNU';
      if (needsSave) {
        await exists.save();
        console.log('Compte administrateur national synchronisé avec les variables Render.');
      }
    }
  } else {
    console.warn('ADMIN_PASSWORD absent : connexion administrateur national désactivée.');
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`DUNU BENIN démarré sur le port ${config.port}`);
    console.log(`Frontend servi depuis : ${frontendDir}`);
  });
}

bootstrap().catch(error => {
  console.error('Erreur démarrage DUNU:', error);
  process.exit(1);
});
