import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import dotenv from 'dotenv';

// Load local environment variables from .env
dotenv.config();

const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (!publicVapidKey || !privateVapidKey) {
  console.error('[PWA Push Dispatcher] ERROR: VAPID keys not configured in environment variables.');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:hello.thebriefings@gmail.com',
  publicVapidKey,
  privateVapidKey
);

// Fetch all saved client subscription endpoints
const getSubscriptions = async () => {
  if (process.env.NETLIFY_API_TOKEN && process.env.SITE_ID) {
    try {
      const { getStore } = await import('@netlify/blobs');
      const store = getStore({
        name: 'subscriptions',
        siteID: process.env.SITE_ID,
        token: process.env.NETLIFY_API_TOKEN
      });
      const list = await store.list();
      const subs = [];
      for (const blob of list.blobs) {
        const item = await store.getJSON(blob.key);
        if (item) subs.push(item);
      }
      return subs;
    } catch (e) {
      console.warn('[PWA Push Dispatcher] Netlify Blobs fetch failed, trying local file:', e.message);
    }
  }

  const p = path.join(process.cwd(), 'data', 'subscriptions.json');
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
};

// Remove invalid/expired subscriptions
const removeSubscription = async (endpoint) => {
  if (process.env.NETLIFY_API_TOKEN && process.env.SITE_ID) {
    try {
      const { getStore } = await import('@netlify/blobs');
      const store = getStore({
        name: 'subscriptions',
        siteID: process.env.SITE_ID,
        token: process.env.NETLIFY_API_TOKEN
      });
      const key = Buffer.from(endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      await store.delete(key);
      return;
    } catch (e) {
      console.warn('[PWA Push Dispatcher] Failed to remove subscription from Netlify Blobs:', e.message);
    }
  }

  const p = path.join(process.cwd(), 'data', 'subscriptions.json');
  if (!fs.existsSync(p)) return;
  try {
    const subs = JSON.parse(fs.readFileSync(p, 'utf8'));
    const filtered = subs.filter(s => s.endpoint !== endpoint);
    fs.writeFileSync(p, JSON.stringify(filtered, null, 2), 'utf8');
  } catch (e) {
    console.error('[PWA Push Dispatcher] Failed to clean local subscription:', e.message);
  }
};

const sendNotifications = async () => {
  const subscriptions = await getSubscriptions();
  if (subscriptions.length === 0) {
    console.log('[PWA Push Dispatcher] No active subscriptions found. Skipping notifications.');
    return;
  }

  // Construct default payload
  let payload = {
    title: 'The Briefings',
    body: 'Today\'s briefing and flash updates are now available!',
    url: '/'
  };

  // Try to read the most recent flash update
  const flashPath = path.join(process.cwd(), 'flash.json');
  if (fs.existsSync(flashPath)) {
    try {
      const stories = JSON.parse(fs.readFileSync(flashPath, 'utf8'));
      if (Array.isArray(stories) && stories.length > 0) {
        const latest = stories[0];
        payload = {
          title: '⚡ Flash Update',
          body: latest.headline || latest.hl || 'New updates published.',
          url: '/flash/'
        };
      }
    } catch (e) {
      console.warn('[PWA Push Dispatcher] Could not read latest flash for payload:', e.message);
    }
  }

  console.log(`[PWA Push Dispatcher] Dispatching to ${subscriptions.length} active subscription(s)...`);
  const jsonPayload = JSON.stringify(payload);
  let successCount = 0;
  let failCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, jsonPayload);
      successCount++;
    } catch (err) {
      failCount++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`[PWA Push Dispatcher] Subscription expired (status ${err.statusCode}). Removing subscription...`);
        await removeSubscription(sub.endpoint);
      } else {
        console.error(`[PWA Push Dispatcher] Failed to push to endpoint (status ${err.statusCode || 'unknown'}):`, err.message);
      }
    }
  }

  console.log(`[PWA Push Dispatcher] Completed dispatch. Sent successfully: ${successCount}, Failed/Cleaned: ${failCount}`);
};

sendNotifications().catch(console.error);
