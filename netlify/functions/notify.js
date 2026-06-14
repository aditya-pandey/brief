import webpush from 'web-push';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS, POST'
  };

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const adminSecret = process.env.ADMIN_SECRET;

    // Security Check
    if (!adminSecret || body.secret !== adminSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing ADMIN_SECRET' }), { status: 401, headers });
    }

    const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
    const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicVapidKey || !privateVapidKey) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured.' }), { status: 500, headers });
    }

    webpush.setVapidDetails(
      'mailto:hello.thebriefings@gmail.com',
      publicVapidKey,
      privateVapidKey
    );

    // Fetch Subscriptions from Netlify Blobs
    let subs = [];
    let getStore;
    try {
      const blobs = await import('@netlify/blobs');
      getStore = blobs.getStore;
    } catch (e) {
      console.warn('Netlify Blobs not loaded, falling back');
    }

    if (getStore) {
      const store = getStore({ name: 'subscriptions' });
      const list = await store.list();
      for (const blob of list.blobs) {
        const item = await store.getJSON(blob.key);
        if (item) subs.push(item);
      }
    } else {
      // Fallback for purely local testing without Netlify CLI blobs
      try {
        const fs = await import('fs');
        const path = await import('path');
        const p = path.join(process.cwd(), 'data', 'subscriptions.json');
        if (fs.existsSync(p)) {
          subs = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch (e) {}
    }

    if (subs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No active subscriptions found.' }), { status: 200, headers });
    }

    // Default Payload
    let payload = {
      title: 'The Briefings',
      body: 'Today\'s briefing and flash updates are now available!',
      url: '/'
    };

    // Try to fetch latest flash from the deployed site
    try {
      const host = req.headers.get('host') || 'thebriefings.netlify.app';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const flashRes = await fetch(`${protocol}://${host}/flash.json`);
      if (flashRes.ok) {
        const stories = await flashRes.json();
        if (Array.isArray(stories) && stories.length > 0) {
          const latest = stories[0];
          payload = {
            title: '⚡ Flash Update',
            body: latest.headline || latest.hl || 'New updates published.',
            url: '/flash/'
          };
        }
      }
    } catch (e) {
      console.warn('Could not fetch latest flash.json for payload:', e.message);
    }

    const jsonPayload = JSON.stringify(payload);
    let successCount = 0;
    let failCount = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, jsonPayload);
        successCount++;
      } catch (err) {
        failCount++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          if (getStore) {
            const store = getStore({ name: 'subscriptions' });
            const key = btoa(sub.endpoint).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            await store.delete(key);
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Completed dispatch. Sent: ${successCount}, Failed/Cleaned: ${failCount}` 
    }), { status: 200, headers });

  } catch (err) {
    console.error('[PWA Notify function] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
