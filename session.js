/**
 * wa-bridge/lib/session.js
 * ─────────────────────────────────────────────────────────────
 * Baileys session manager — persists auth state in memory/KV.
 * On Vercel, sessions are stored in-memory (edge KV optional).
 *
 * For production persistence, set VERCEL_KV_REST_API_URL +
 * VERCEL_KV_REST_API_TOKEN in Vercel env vars.
 * ─────────────────────────────────────────────────────────────
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino   = require('pino');
const path   = require('path');
const fs     = require('fs');

// ── In-memory session store (Vercel serverless safe) ──────────
const SESSION_DIR = process.env.SESSION_DIR || '/tmp/wa_session';
let   _sock       = null;
let   _qrCode     = null;
let   _status     = 'disconnected'; // 'disconnected'|'qr'|'connecting'|'open'
let   _msgHandler = null;

// ── Ensure session dir ────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

// ── Silent logger ─────────────────────────────────────────────
const logger = pino({ level: 'silent' });

// ── Start / reconnect socket ──────────────────────────────────
async function startSession(onMessage) {
  ensureDir();
  if (_sock && _status === 'open') return _sock;

  _msgHandler = onMessage || _msgHandler;
  _status     = 'connecting';

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  _sock = makeWASocket({
    version,
    logger,
    auth: {
      creds:  state.creds,
      keys:   makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['ArtifactVisualizer', 'Chrome', '3.0'],
    getMessage: async () => undefined,
  });

  // Save credentials on update
  _sock.ev.on('creds.update', saveCreds);

  // Connection state
  _sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      _qrCode  = qr;
      _status  = 'qr';
    }
    if (connection === 'open') {
      _qrCode = null;
      _status = 'open';
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      _status    = 'disconnected';
      // Auto-reconnect unless logged out
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => startSession(_msgHandler), 3000);
      } else {
        // Wipe session on logout
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        _sock = null;
      }
    }
  });

  // Incoming messages
  _sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      if (_msgHandler) {
        try { await _msgHandler(msg, _sock); }
        catch (e) { console.error('[WA handler error]', e.message); }
      }
    }
  });

  return _sock;
}

// ── Send text message ─────────────────────────────────────────
async function sendText(jid, text) {
  if (!_sock || _status !== 'open') throw new Error('WA tidak terhubung.');
  await _sock.sendMessage(jid, { text });
}

// ── Send link preview (untuk kirim viz link) ──────────────────
async function sendLinkPreview(jid, text, url, title, description) {
  if (!_sock || _status !== 'open') throw new Error('WA tidak terhubung.');
  await _sock.sendMessage(jid, {
    text: `${text}\n\n${url}`,
    title,
    description,
    canonicalUrl: url,
    matchedText:  url,
    jpegThumbnail: null,
  });
}

// ── Send image ────────────────────────────────────────────────
async function sendImage(jid, imageBuffer, caption = '') {
  if (!_sock || _status !== 'open') throw new Error('WA tidak terhubung.');
  await _sock.sendMessage(jid, {
    image: imageBuffer,
    caption,
    mimetype: 'image/png',
  });
}

// ── Getters ───────────────────────────────────────────────────
function getQR()     { return _qrCode; }
function getStatus() { return _status; }
function getSock()   { return _sock;   }

module.exports = { startSession, sendText, sendLinkPreview, sendImage, getQR, getStatus, getSock };
