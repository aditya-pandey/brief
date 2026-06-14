/**
 * push-placeholder.js
 * 
 * Handles client-side push notification subscription flow,
 * fetching VAPID public keys, and notifying the Netlify serverless endpoint.
 */

// Helper to convert VAPID keys to Uint8Array for browser push registration
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper to determine the API base path for functions
function getApiUrl() {
  // Try Netlify standard functions path
  return '/.netlify/functions/subscribe';
}

/**
 * Check if the browser supports notifications and retrieve active subscription.
 */
export async function getSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, subscribed: false };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      subscribed: !!subscription,
      subscription: subscription
    };
  } catch (err) {
    console.error('[PWA Push Client] Error checking subscription status:', err);
    return { supported: true, subscribed: false };
  }
}

/**
 * Request notification permission.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return 'unsupported';
  }

  const permission = await Notification.requestPermission();
  console.log('[PWA Push Client] Permission status:', permission);
  return permission;
}

/**
 * Subscribe current user to push notifications.
 */
export async function subscribeUserToPush() {
  try {
    const { supported, subscribed } = await getSubscriptionStatus();
    if (!supported) {
      throw new Error('Push notifications are not supported by this browser.');
    }

    const permission = Notification.permission;
    if (permission !== 'granted') {
      const result = await requestNotificationPermission();
      if (result !== 'granted') {
        throw new Error('Permission not granted for notifications.');
      }
    }

    const registration = await navigator.serviceWorker.ready;

    // 1. Fetch public VAPID key from subscribe endpoint
    const keyResponse = await fetch(getApiUrl());
    if (!keyResponse.ok) {
      throw new Error(`Failed to retrieve VAPID keys: ${keyResponse.statusText}`);
    }
    const { publicKey } = await keyResponse.json();
    if (!publicKey) {
      throw new Error('No VAPID public key returned from subscription server.');
    }

    // 2. Subscribe user via pushManager
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    console.log('[PWA Push Client] Browser subscription established:', subscription);

    // 3. Register subscription on backend Netlify Function
    const saveResponse = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      throw new Error(errorData.error || 'Failed to save subscription details on backend.');
    }

    console.log('[PWA Push Client] Subscription successfully saved on backend.');
    return subscription;
  } catch (error) {
    console.error('[PWA Push Client] Failed to subscribe user:', error);
    throw error;
  }
}

/**
 * Unsubscribe current user from push notifications.
 */
export async function unsubscribeUserFromPush() {
  try {
    const { subscription } = await getSubscriptionStatus();
    if (!subscription) {
      console.log('[PWA Push Client] No active subscription found to unsubscribe.');
      return false;
    }

    // 1. Remove subscription from backend Netlify Function
    const deleteResponse = await fetch(getApiUrl(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });

    if (!deleteResponse.ok) {
      console.warn('[PWA Push Client] Unsubscribe cleanup on backend failed or was already removed.');
    }

    // 2. Unsubscribe on browser PushManager
    const unsubscribed = await subscription.unsubscribe();
    console.log('[PWA Push Client] Browser unsubscription successful:', unsubscribed);
    return unsubscribed;
  } catch (error) {
    console.error('[PWA Push Client] Error during unsubscription:', error);
    throw error;
  }
}
