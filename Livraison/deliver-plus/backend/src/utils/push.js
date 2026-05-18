const https = require('https');

/**
 * Envoie une notification push via l'API Expo Push.
 * Fire-and-forget : n'attend pas la réponse.
 */
function sendPush(pushToken, title, body, data = {}) {
  if (!pushToken || typeof pushToken !== 'string') return;
  if (!pushToken.startsWith('ExponentPushToken') && !pushToken.startsWith('ExpoPushToken')) return;

  // Push data-only si pas de titre ni corps → déclenche la tâche de fond quand app fermée
  const msg = { to: pushToken, data, priority: 'high', channelId: 'new_orders' };
  if (title) msg.title = title;
  if (body)  msg.body  = body;
  if (title) msg.sound = 'default';
  const payload = JSON.stringify(msg);

  const req = https.request({
    hostname: 'exp.host',
    path:     '/api/v2/push/send',
    method:   'POST',
    headers: {
      'Content-Type':    'application/json',
      'Accept':          'application/json',
      'Content-Length':  Buffer.byteLength(payload),
    },
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

/**
 * Envoie vers plusieurs tokens en une seule requête (batch).
 */
function sendPushBatch(tokens, title, body, data = {}) {
  const valid = (tokens || []).filter(t => t && typeof t === 'string' && (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken')));
  if (!valid.length) return;

  const payload = JSON.stringify(valid.map(to => ({ to, sound: 'default', title, body, data })));

  const req = https.request({
    hostname: 'exp.host',
    path:     '/api/v2/push/send',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Accept':         'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

module.exports = { sendPush, sendPushBatch };
