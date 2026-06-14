function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
const key = 'BJrBx4le_mdP2q8kiI1n5SWKYO1aqg1uzefNzn1TvVI1Uuc84pPbsSw3sBIsuoYiEUWJzDJiIcvas2YzAZhG_uk';
console.log(urlBase64ToUint8Array(key));
