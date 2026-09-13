// Connection test: authenticates with the token from .env and lists cameras.
// Prints NO secrets — only camera names/count.
const { RingApi } = require('ring-client-api');
(async () => {
  const token = process.env.RING_REFRESH_TOKEN;
  if (!token || token === 'PASTE_YOUR_RING_TOKEN_HERE') { console.error('No token in .env'); process.exit(1); }
  const api = new RingApi({ refreshToken: token, cameraStatusPollingSeconds: 600 });
  const cams = await api.getCameras();
  console.log('CONNECTED OK. Cameras found:', cams.length);
  cams.forEach((c, i) => console.log(`  [${i}] ${c.name}  (${c.deviceType}, battery: ${c.batteryLevel ?? 'n/a'})`));
  process.exit(0);
})().catch(e => { console.error('CONNECT ERROR:', e.message); process.exit(1); });
