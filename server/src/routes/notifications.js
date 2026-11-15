import { Router } from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { Notification } from '../models/index.js';

const r = Router();
r.use(auth);
r.get('/', async (req, res) => {
  const rows = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(rows);
});
r.get('/unread-count', async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.json({ count });
});
r.patch('/read-all', async (req, res) => {
  const result = await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ modified: result.modifiedCount });
});
r.patch('/:id/read', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Notification invalide.' });
  const row = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!row) return res.status(404).json({ error: 'Notification introuvable.' });
  if (!row.readAt) {
    row.readAt = new Date();
    await row.save();
  }
  res.json(row);
});
export default r;
