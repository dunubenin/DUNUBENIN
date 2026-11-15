import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { User } from '../models/index.js';
import { BENIN_COMMUNE_NAMES } from '../data/benin-communes.js';
import { config } from '../config.js';
import { auth } from '../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryConfigured } from '../services/cloudinary.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' } });
const schema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(8),
  password: z.string().min(8),
  role: z.enum(['client', 'restaurant', 'rider']).default('client'),
  city: z.string().trim().min(2).max(100),
  deliveryZone: z.string().trim().max(100).optional()
});
const normalizePhone = value => String(value || '').replace(/[^0-9]/g, '');
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');

r.post('/register', async (req, res) => {
  try {
    const d = schema.parse(req.body);
    if (!BENIN_COMMUNE_NAMES.has(d.city)) return res.status(400).json({ error: 'Sélectionnez une commune valide du Bénin.' });
    const email = d.email ? d.email.toLowerCase() : undefined;
    const phone = normalizePhone(d.phone);
    const phonePattern = new RegExp('^\\+?' + phone.split('').join('[\\s().-]*') + '$');
    const duplicate = await User.findOne({ $or: [...(email ? [{ email }] : []), { phone }, { phone: phonePattern }] });
    if (duplicate) return res.status(409).json({ error: 'E-mail ou téléphone déjà utilisé' });
    const user = await User.create({ name: d.name, email, phone, passwordHash: await bcrypt.hash(d.password, 12), role: d.role, city: d.city, deliveryZone: d.deliveryZone || '', status: d.role === 'client' ? 'active' : 'pending' });
    res.status(201).json({ message: d.role === 'client' ? 'Compte créé' : 'Compte créé, en attente de validation', user: { id: user.id, name: user.name, role: user.role, status: user.status, city: user.city, deliveryZone: user.deliveryZone } });
  } catch (e) { res.status(400).json({ error: e.issues?.[0]?.message || e.message }); }
});

r.post('/login', loginLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) return res.status(400).json({ error: 'Renseignez votre e-mail ou téléphone et votre mot de passe.' });
    // Identifiant réservé à l'administrateur national.
    // Le secret de référence est ADMIN_PASSWORD dans Render ; aucun e-mail n'est requis.
    if (identifier.toUpperCase() === 'ADMIN') {
      if (!config.adminPassword) {
        return res.status(503).json({ error: 'La connexion de l’administrateur national n’est pas configurée sur le serveur.' });
      }
      const admin = await User.findOne({ role: 'admin', status: 'active' });
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
        return res.status(401).json({ error: 'Identifiant administrateur ou mot de passe incorrect.' });
      }
      const token = jwt.sign({ sub: admin.id, role: 'admin' }, config.jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
      return res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, phone: admin.phone, profileImage: admin.profileImage || '', role: 'admin', city: 'Bénin', deliveryZone: '' } });
    }

    const isEmail = identifier.includes('@');
    let user = isEmail ? await User.findOne({ email: identifier.toLowerCase() }) : null;
    if (!isEmail) {
      const digits = normalizePhone(identifier);
      const beninVariants = digits.startsWith('229') ? [digits.slice(3)] : (digits.startsWith('01') ? [`229${digits}`, `+229${digits}`] : []);
      const variants = [...new Set([identifier, digits, `+${digits}`, digits ? `00${digits}` : '', ...beninVariants].filter(Boolean))];
      user = await User.findOne({ phone: { $in: variants } });
      // Compatibilité avec les anciens comptes dont le numéro contenait des espaces ou tirets.
      if (!user && digits) {
        const flexiblePatterns = [digits, ...beninVariants.map(normalizePhone)].filter(Boolean).map(value => new RegExp('^\\+?' + value.split('').join('[\\s().-]*') + '$'));
        user = await User.findOne({ phone: { $in: flexiblePatterns } });
      }
    }
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'E-mail/téléphone ou mot de passe incorrect. Vérifiez les informations saisies.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Compte en attente de validation ou suspendu' });
    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage || '', role: user.role, city: user.role === 'admin' ? 'Bénin' : user.city, deliveryZone: user.deliveryZone || '' } });
  } catch (e) { res.status(500).json({ error: 'Impossible de traiter la connexion pour le moment.' }); }
});

r.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Renseignez votre adresse e-mail.' });
  const generic = { message: 'Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.' };
  try {
    const user = await User.findOne({ email });
    if (!user) return res.json(generic);
    if (!config.resendApiKey) return res.status(503).json({ error: 'La récupération par e-mail n’est pas encore configurée. Contactez le support DUNU.' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = hashToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    const link = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [user.email], subject: 'Réinitialisation de votre mot de passe DUNU', html: `<p>Bonjour ${String(user.name).replace(/[&<>"']/g, '')},</p><p>Pour choisir un nouveau mot de passe DUNU, ouvrez ce lien valable 30 minutes :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Si vous n’avez pas demandé cette opération, ignorez ce message.</p>` })
    });
    if (!mail.ok) { user.passwordResetTokenHash = ''; user.passwordResetExpiresAt = undefined; await user.save(); return res.status(502).json({ error: 'Le service e-mail n’a pas pu envoyer le lien. Réessayez plus tard.' }); }
    res.json(generic);
  } catch { res.status(500).json({ error: 'Erreur pendant la demande de réinitialisation.' }); }
});

r.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'Lien de réinitialisation invalide ou expiré.' });
  const user = await User.findOne({ passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: 'Lien de réinitialisation invalide ou expiré. Demandez un nouveau lien.' });
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = '';
  user.passwordResetExpiresAt = undefined;
  await user.save();
  res.json({ message: 'Mot de passe modifié. Vous pouvez maintenant vous connecter.' });
});

r.get('/me', auth, (req, res) => res.json({ user: req.user }));
r.get('/profile-upload-signature', auth, async (req, res) => {
  try {
    if (!cloudinaryConfigured()) return res.status(503).json({ error: 'Cloudinary n’est pas configuré sur le serveur.' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'dunu/profiles';
    cloudinary.config({ cloud_name: config.cloudinary.cloudName, api_key: config.cloudinary.apiKey, api_secret: config.cloudinary.apiSecret, secure: true });
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, config.cloudinary.apiSecret);
    res.json({ timestamp, signature, folder, cloudName: config.cloudinary.cloudName, apiKey: config.cloudinary.apiKey });
  } catch (e) { res.status(503).json({ error: e.message || 'Signature Cloudinary indisponible.' }); }
});
r.patch('/profile', auth, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const profileImage = typeof req.body?.profileImage === 'string' ? req.body.profileImage : undefined;
  if (name !== undefined && (name.length < 2 || name.length > 100)) return res.status(400).json({ error: 'Le nom doit contenir entre 2 et 100 caractères.' });
  if (profileImage !== undefined && profileImage && (!/^https:\/\//i.test(profileImage) || !profileImage.includes('res.cloudinary.com/'))) return res.status(400).json({ error: 'La photo doit être hébergée sur Cloudinary.' });
  const update = {};
  if (name !== undefined) update.name = name;
  if (profileImage !== undefined) update.profileImage = profileImage;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-passwordHash -passwordResetTokenHash -passwordResetExpiresAt');
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage || '', role: user.role, city: user.role === 'admin' ? 'Bénin' : user.city, deliveryZone: user.deliveryZone || '' } });
});
export default r;
