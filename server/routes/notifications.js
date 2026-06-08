const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const listForManager = db.prepare(`
  SELECT * FROM notifications WHERE manager_id = ? ORDER BY created_at DESC LIMIT 100
`);
const countUnread = db.prepare(`
  SELECT COUNT(*) AS cnt FROM notifications WHERE manager_id = ? AND read = 0
`);
const markRead = db.prepare(`
  UPDATE notifications SET read = 1 WHERE id = ? AND manager_id = ?
`);
const markAllRead = db.prepare(`
  UPDATE notifications SET read = 1 WHERE manager_id = ? AND read = 0
`);

router.get('/', (req, res) => {
  const notifications = listForManager.all(req.manager.id).map((n) => ({ ...n, created_at_ist: toIST(n.created_at) }));
  const unread_count = countUnread.get(req.manager.id).cnt;
  res.json({ notifications, unread_count });
});

router.patch('/:id/read', (req, res) => {
  markRead.run(req.params.id, req.manager.id);
  res.json({ ok: true });
});

router.post('/mark-all-read', (req, res) => {
  markAllRead.run(req.manager.id);
  res.json({ ok: true });
});

module.exports = router;
