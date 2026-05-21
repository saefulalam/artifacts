/**
 * wa-bridge/api/status.js
 * GET /api/status  →  returns WA connection status as JSON
 */

const session = require('../lib/session');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    ok:      true,
    status:  session.getStatus(),
    has_qr:  !!session.getQR(),
    time:    new Date().toISOString(),
  });
};
