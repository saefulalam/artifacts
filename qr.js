/**
 * wa-bridge/api/qr.js
 * ─────────────────────────────────────────────────────────────
 * GET /api/qr
 * Returns WhatsApp QR code as PNG image (or JSON with base64).
 * Open in browser, scan with WA to pair the bridge.
 * ─────────────────────────────────────────────────────────────
 */

const QRCode  = require('qrcode');
const session = require('../lib/session');
const { handleMessage } = require('../lib/handler');

// Singleton: start session once per cold start
let _started = false;
async function ensureSession() {
  if (_started) return;
  _started = true;
  await session.startSession(handleMessage);
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    await ensureSession();

    const status = session.getStatus();
    const qr     = session.getQR();

    if (status === 'open') {
      res.setHeader('Content-Type', 'application/json');
      return res.json({ status: 'connected', message: 'WhatsApp sudah terhubung.' });
    }

    if (!qr) {
      res.setHeader('Content-Type', 'application/json');
      return res.json({ status, message: 'Menunggu QR code... refresh dalam 3 detik.' });
    }

    // Return as HTML page with auto-refresh for easy scanning
    const qrDataUrl = await QRCode.toDataURL(qr, {
      width:           300,
      margin:          2,
      color:           { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Artifact Visualizer — WA Pairing</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0a0a;color:#f5f5f7;font-family:system-ui,-apple-system,sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#1c1c1e;border:1px solid rgba(255,255,255,.1);border-radius:20px;
        padding:40px;text-align:center;max-width:380px;width:90%}
  .logo{width:42px;height:42px;background:#0a84ff;border-radius:12px;display:inline-grid;
        place-items:center;margin-bottom:20px;font-size:20px}
  h1{font-size:20px;font-weight:600;margin-bottom:8px}
  p{color:#aeaeb2;font-size:14px;margin-bottom:24px;line-height:1.6}
  .qr-wrap{background:#fff;padding:16px;border-radius:12px;display:inline-block;margin-bottom:20px}
  .qr-wrap img{display:block;width:240px;height:240px}
  .steps{text-align:left;background:#111;border-radius:10px;padding:16px;margin-bottom:20px}
  .step{display:flex;gap:10px;padding:5px 0;font-size:13px;color:#aeaeb2}
  .sn{color:#0a84ff;font-weight:700;flex-shrink:0}
  .status{font-size:12px;color:#636366}
  .refresh{display:inline-block;margin-top:12px;background:rgba(10,132,255,.15);
           color:#0a84ff;border:1px solid rgba(10,132,255,.3);border-radius:8px;
           padding:8px 18px;font-size:13px;font-weight:500;cursor:pointer;text-decoration:none}
</style>
<script>setTimeout(()=>location.reload(), 25000)</script>
</head>
<body>
<div class="card">
  <div class="logo">◈</div>
  <h1>Sambungkan WhatsApp</h1>
  <p>Scan QR code berikut dengan WhatsApp kamu untuk menghubungkan Artifact Visualizer Bridge.</p>
  <div class="qr-wrap"><img src="${qrDataUrl}" alt="WhatsApp QR"></div>
  <div class="steps">
    <div class="step"><span class="sn">1</span><span>Buka WhatsApp di HP kamu</span></div>
    <div class="step"><span class="sn">2</span><span>Menu → Perangkat Tertaut → Tautkan Perangkat</span></div>
    <div class="step"><span class="sn">3</span><span>Scan QR code di atas</span></div>
    <div class="step"><span class="sn">4</span><span>Selesai! Kirim <b>!help</b> ke nomor bot</span></div>
  </div>
  <div class="status">⏰ Halaman auto-refresh tiap 25 detik</div>
  <a class="refresh" href="/api/qr">↺ Refresh QR</a>
</div>
</body>
</html>`);

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
