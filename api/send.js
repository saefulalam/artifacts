/**
 * wa-bridge/api/send.js
 * ─────────────────────────────────────────────────────────────
 * POST /api/send
 * Called by PHP server to push a message/link back to WA user.
 * Body: { jid, text, url?, title?, description?, secret }
 * ─────────────────────────────────────────────────────────────
 */

const { sendText, sendLinkPreview, getStatus } = require('../lib/session');

const SECRET = process.env.BRIDGE_SECRET || 'dev-secret-change-me';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Auth
  const secret = req.headers['x-bridge-secret'] || req.body?.secret;
  if (secret !== SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { jid, text, url, title, description } = req.body || {};
  if (!jid || !text) return res.status(400).json({ ok: false, error: 'jid and text required' });

  if (getStatus() !== 'open') {
    return res.status(503).json({ ok: false, error: 'WA tidak terhubung. Buka /api/qr untuk scan ulang.' });
  }

  try {
    if (url) {
      await sendLinkPreview(jid, text, url, title || 'Artifact Visual', description || '');
    } else {
      await sendText(jid, text);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
