import { mongoReady } from '../config/db.js';
import PushToken from '../models/PushToken.js';
import { pushTokens } from '../data/demo.js';

export async function sendPushToAll({ title, body, data = {} }) {
  let tokens = [];
  try {
    if (mongoReady()) {
      tokens = (await PushToken.find({ enabled: true }).select('token -_id')).map(x => x.token);
    } else {
      tokens = [...new Set(pushTokens.map(x => x.token))];
    }
  } catch (e) {
    console.error('Could not load push tokens:', e.message);
    return { sent: 0, failed: 0, registered: 0, error: e.message };
  }

  const unique = [...new Set(tokens)].filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken['));
  if (!unique.length) return { sent: 0, failed: 0, registered: 0, message: 'No registered push devices yet.' };

  let sent = 0, failed = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        },
        body: JSON.stringify(chunk.map(to => ({
          to, sound: 'default', title, body, data, priority: 'high', channelId: 'default'
        })))
      });
      const result = await response.json();
      const tickets = result?.data || [];
      for (const ticket of tickets) {
        if (ticket.status === 'ok') sent++;
        else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            // Stale tokens can be cleaned up later; do not fail the whole campaign.
          }
        }
      }
      if (!response.ok) failed += Math.max(0, chunk.length - tickets.length);
    } catch (e) {
      failed += chunk.length;
      console.error('Expo push request failed:', e.message);
    }
  }
  return { sent, failed, registered: unique.length };
}
