/**
 * wa-bridge/lib/handler.js
 * ─────────────────────────────────────────────────────────────
 * Parses incoming WA messages, calls PHP /api/wa endpoint,
 * then replies with visualization link or error.
 *
 * COMMAND FORMAT (via WA chat):
 *   !viz <prompt>                  → generate artifact from last datasource
 *   !connect mysql <host> <db> ... → set datasource
 *   !status                        → show bridge status
 *   !help                          → show command list
 * ─────────────────────────────────────────────────────────────
 */

const axios      = require('axios');
const { sendText, sendLinkPreview } = require('./session');

const PHP_SERVER = process.env.PHP_SERVER_URL  || '';
const SECRET     = process.env.BRIDGE_SECRET   || 'dev-secret-change-me';

// ── Per-JID session context (in-memory) ──────────────────────
// Stores the last datasource config per user
const userCtx = {};

// ── Main entry ────────────────────────────────────────────────
async function handleMessage(msg, sock) {
  const jid  = msg.key.remoteJid;
  const body = extractText(msg);
  if (!body || !jid) return;

  const text = body.trim();
  if (!text.startsWith('!')) return; // ignore non-command messages

  const [cmd, ...args] = text.slice(1).split(' ');

  try {
    switch (cmd.toLowerCase()) {

      case 'help':
        await sendText(jid, helpText());
        break;

      case 'status':
        await sendText(jid, await getStatus());
        break;

      case 'connect':
        await handleConnect(jid, args);
        break;

      case 'viz':
      case 'visualize':
        await handleViz(jid, args.join(' '));
        break;

      case 'datasource':
      case 'ds':
        await showCurrentDS(jid);
        break;

      default:
        await sendText(jid, `⚠ Perintah tidak dikenal: *!${cmd}*\nKetik *!help* untuk daftar perintah.`);
    }
  } catch (err) {
    await sendText(jid, `❌ Error: ${err.message}`);
  }
}

// ── HELP ──────────────────────────────────────────────────────
function helpText() {
  return `*🎨 Artifact Visualizer v3 — WhatsApp Bridge*

*Perintah tersedia:*

*!connect mysql* host db user pass [port]
  → Sambungkan ke MySQL

*!connect supabase* url anon_key
  → Sambungkan ke Supabase

*!connect firebase* project_id api_key
  → Sambungkan ke Firebase

*!connect file* server_path
  → Gunakan file CSV/JSON di server

*!viz* _prompt_
  → Generate visualisasi dari datasource aktif
  → Contoh: !viz tampilkan total penjualan per bulan

*!ds*
  → Lihat datasource yang aktif saat ini

*!status*
  → Status koneksi bridge

_Link visualisasi akan dikirim balik otomatis 🚀_`;
}

// ── STATUS ────────────────────────────────────────────────────
async function getStatus() {
  try {
    const res = await axios.get(`${PHP_SERVER}/api/wa/status`, {
      headers: { 'X-Bridge-Secret': SECRET },
      timeout: 8000,
    });
    return `✅ *Bridge Status*\nPHP Server: online\nAI: ${res.data.ai_ready ? '✓' : '✗'}\nActive sessions: ${res.data.active_sessions || 0}`;
  } catch {
    return '⚠ PHP server tidak dapat dijangkau. Pastikan server berjalan.';
  }
}

// ── CONNECT ───────────────────────────────────────────────────
async function handleConnect(jid, args) {
  if (!args.length) {
    await sendText(jid, '❌ Format: !connect <mysql|supabase|firebase|file> [params...]');
    return;
  }

  const type = args[0].toLowerCase();
  let src;

  switch (type) {
    case 'mysql': {
      // !connect mysql host db user pass [port]
      const [, host, db, user, pass, port] = args;
      if (!host || !db || !user || !pass) {
        await sendText(jid, '❌ Format: !connect mysql host db user pass [port]');
        return;
      }
      src = { type: 'mysql', host, db, user, pass, port: port || '3306' };
      break;
    }
    case 'supabase': {
      const [, url, anon_key] = args;
      if (!url || !anon_key) {
        await sendText(jid, '❌ Format: !connect supabase url anon_key');
        return;
      }
      src = { type: 'supabase', url, anon_key };
      break;
    }
    case 'firebase': {
      const [, project_id, api_key] = args;
      if (!project_id || !api_key) {
        await sendText(jid, '❌ Format: !connect firebase project_id api_key');
        return;
      }
      src = { type: 'firebase', project_id, api_key };
      break;
    }
    case 'file': {
      const [, ...pathParts] = args;
      const filePath = pathParts.join(' ');
      if (!filePath) {
        await sendText(jid, '❌ Format: !connect file /path/to/file.csv');
        return;
      }
      src = { type: 'file', path: filePath };
      break;
    }
    default:
      await sendText(jid, `❌ Tipe datasource tidak dikenal: ${type}`);
      return;
  }

  // Test connection via PHP
  await sendText(jid, `⏳ Menguji koneksi ke *${type}*...`);
  try {
    const res = await axios.post(`${PHP_SERVER}/api/wa/test_connection`, {
      source: src,
    }, {
      headers: { 'X-Bridge-Secret': SECRET, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    if (res.data.ok) {
      userCtx[jid] = { source: src };
      await sendText(jid, `✅ *Terhubung ke ${type.toUpperCase()}!*\n\nSchema preview:\n\`\`\`\n${(res.data.schema_preview || '').substring(0, 300)}\n\`\`\`\n\nSekarang kirim: *!viz <prompt_kamu>*`);
    } else {
      await sendText(jid, `❌ Koneksi gagal: ${res.data.error}`);
    }
  } catch (err) {
    await sendText(jid, `❌ Tidak bisa menghubungi PHP server: ${err.message}`);
  }
}

// ── VISUALIZE ─────────────────────────────────────────────────
async function handleViz(jid, prompt) {
  if (!prompt.trim()) {
    await sendText(jid, '❌ Prompt tidak boleh kosong.\nContoh: *!viz tampilkan total transaksi per hari*');
    return;
  }

  const ctx = userCtx[jid];
  if (!ctx?.source) {
    await sendText(jid, '⚠ Belum ada datasource terhubung.\nGunakan: *!connect mysql/supabase/firebase/file ...*');
    return;
  }

  await sendText(jid, `⚡ *Memproses...*\n_Prompt: "${prompt}"_\n\nAI sedang inspect schema → plan query → execute → build viz...\n(biasanya 15–45 detik)`);

  try {
    const res = await axios.post(`${PHP_SERVER}/api/wa/generate`, {
      source: ctx.source,
      prompt,
      jid,
    }, {
      headers: { 'X-Bridge-Secret': SECRET, 'Content-Type': 'application/json' },
      timeout: 120000, // 2 menit untuk AI pipeline
    });

    const data = res.data;

    if (!data.ok) {
      await sendText(jid, `❌ Generate gagal: ${data.error}`);
      return;
    }

    // Build reply
    const link    = data.viz_url;
    const rows    = data.rows   || 0;
    const tokens  = data.tokens || 0;
    const query   = (data.plan?.query   || '').substring(0, 120);
    const explain = (data.plan?.explanation || '');

    const summary =
      `✅ *Artifact siap!*\n\n` +
      `📊 Data: ${rows.toLocaleString()} baris\n` +
      `🧠 Token AI: ${tokens.toLocaleString()}\n` +
      `🔍 Query: \`${query}${query.length >= 120 ? '...' : ''}\`\n` +
      `💡 ${explain}\n\n` +
      `🔗 *Link Visualisasi:*\n${link}`;

    // Send as link preview if supported, else plain text
    try {
      await sendLinkPreview(jid, summary.split('\n🔗')[0], link, '🎨 Artifact Visual', explain || 'Klik untuk lihat visualisasi interaktif');
    } catch {
      await sendText(jid, summary);
    }

  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    await sendText(jid, `❌ Error saat generate: ${msg}`);
  }
}

// ── SHOW DS ───────────────────────────────────────────────────
async function showCurrentDS(jid) {
  const ctx = userCtx[jid];
  if (!ctx?.source) {
    await sendText(jid, '⚠ Belum ada datasource aktif.\nGunakan *!connect* untuk sambungkan datasource.');
    return;
  }
  const s    = ctx.source;
  const safe = { type: s.type };
  if (s.host) safe.host = s.host;
  if (s.db)   safe.db   = s.db;
  if (s.url)  safe.url  = s.url;
  if (s.path) safe.path = s.path;
  await sendText(jid, `📡 *Datasource aktif:*\n\`\`\`\n${JSON.stringify(safe, null, 2)}\n\`\`\``);
}

// ── TEXT EXTRACTOR ────────────────────────────────────────────
function extractText(msg) {
  const m = msg.message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.documentMessage?.caption ||
    ''
  );
}

module.exports = { handleMessage };
