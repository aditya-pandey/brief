import fs from 'fs';
import path from 'path';

let getStore;
try {
  if (process.env.NETLIFY || process.env.NETLIFY_API_TOKEN) {
    const blobs = await import('@netlify/blobs');
    getStore = blobs.getStore;
  }
} catch (e) {
  console.log('[PWA subscribe function] Netlify Blobs not loaded, falling back to local file.', e.message);
}

// Local storage paths and helpers
const getLocalSubscriptionsPath = () => path.join(process.cwd(), 'data', 'subscriptions.json');

const readLocalSubscriptions = () => {
  const p = getLocalSubscriptionsPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
};

const writeLocalSubscriptions = (subs) => {
  const p = getLocalSubscriptionsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(subs, null, 2), 'utf8');
};

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BJrBx4le_mdP2q8kiI1n5SWKYO1aqg1uzefNzn1TvVI1Uuc84pPbsSw3sBIsuoYiEUWJzDJiIcvas2YzAZhG_uk';

  // GET: Retrieve Public VAPID Key
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ publicKey: publicVapidKey }), {
      status: 200,
      headers
    });
  }

  try {
    // POST: Subscribe user
    if (req.method === 'POST') {
      const body = await req.json();
      if (!body || !body.endpoint) {
        return new Response(JSON.stringify({ error: 'Invalid subscription payload' }), {
          status: 400,
          headers
        });
      }

      if (getStore) {
        const store = getStore({ name: 'subscriptions' });
        const key = Buffer.from(body.endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        await store.setJSON(key, body);
      } else {
        const subs = readLocalSubscriptions();
        if (!subs.some(s => s.endpoint === body.endpoint)) {
          subs.push(body);
          writeLocalSubscriptions(subs);
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Subscribed successfully' }), {
        status: 200,
        headers
      });
    }

    // DELETE: Unsubscribe user
    if (req.method === 'DELETE') {
      const body = await req.json();
      if (!body || !body.endpoint) {
        return new Response(JSON.stringify({ error: 'Invalid unsubscribe payload' }), {
          status: 400,
          headers
        });
      }

      if (getStore) {
        const store = getStore({ name: 'subscriptions' });
        const key = Buffer.from(body.endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        await store.delete(key);
      } else {
        const subs = readLocalSubscriptions();
        const filtered = subs.filter(s => s.endpoint !== body.endpoint);
        writeLocalSubscriptions(filtered);
      }

      return new Response(JSON.stringify({ success: true, message: 'Unsubscribed successfully' }), {
        status: 200,
        headers
      });
    }
  } catch (err) {
    console.error('[PWA subscribe function] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers
  });
};
