/*
 * Carpool Ring Bridge
 * -------------------
 * Logs into Ring with a refresh token (kept ONLY here, as an env var — never in the
 * webpage), pulls the live view for one camera, and republishes it as an HLS stream
 * (stream.m3u8 + .ts segments) that the carpool calendar can embed with an ordinary
 * <video> tag.
 *
 * The stream is started ON DEMAND when the first viewer asks, and stopped after a
 * period of no viewers, so it does not hammer the camera 24/7.
 *
 * Required env:
 *   RING_REFRESH_TOKEN   the token from `npm run get-token` (see README)
 * Optional env:
 *   RING_CAMERA_NAME     substring of the camera's name (default: first camera found)
 *   PORT                 default 8123
 *   ALLOW_ORIGIN         CORS origin allowed to embed (default: the GitHub Pages site)
 *   IDLE_STOP_MS         stop the stream after this long with no poll (default 60000)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cors = require('cors');
const express = require('express');
const { RingApi } = require('ring-client-api');

const REFRESH_TOKEN = process.env.RING_REFRESH_TOKEN;
const CAMERA_NAME   = process.env.RING_CAMERA_NAME || '';
const PORT          = parseInt(process.env.PORT || '8123', 10);
const ALLOW_ORIGIN  = process.env.ALLOW_ORIGIN || 'https://venu-madhav-mahadevu.github.io';
const IDLE_STOP_MS  = parseInt(process.env.IDLE_STOP_MS || '60000', 10);

if (!REFRESH_TOKEN) {
  console.error('\n[bridge] Missing RING_REFRESH_TOKEN. Run "npm run get-token" first (see README).\n');
  process.exit(1);
}

const HLS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-hls-'));
console.log('[bridge] HLS output dir:', HLS_DIR);

let ringApi, camera;
let liveCall = null;          // active Ring live session
let lastPoll = 0;             // last time a viewer fetched the playlist
let starting = null;          // in-flight start promise (dedupes concurrent starts)

async function getCamera() {
  if (camera) return camera;
  ringApi = new RingApi({
    refreshToken: REFRESH_TOKEN,
    // do not auto-refresh subscriptions we don't use
    cameraStatusPollingSeconds: 600,
  });
  const cams = await ringApi.getCameras();
  if (!cams.length) throw new Error('No Ring cameras found on this account.');
  camera = CAMERA_NAME
    ? (cams.find(c => (c.name || '').toLowerCase().includes(CAMERA_NAME.toLowerCase())) || cams[0])
    : cams[0];
  console.log('[bridge] Using camera:', camera.name);
  // keep the token fresh on disk-less restarts
  ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    if (newRefreshToken) console.log('[bridge] (Ring rotated the refresh token — update your env with the new one on next restart.)');
  });
  return camera;
}

async function startStream() {
  if (liveCall) return;
  if (starting) return starting;
  starting = (async () => {
    const cam = await getCamera();
    // clean old segments
    for (const f of fs.readdirSync(HLS_DIR)) fs.rmSync(path.join(HLS_DIR, f), { force: true });
    console.log('[bridge] Starting live view →', camera.name);
    liveCall = await cam.streamVideo({
      // ring-client-api pipes the camera's RTP through ffmpeg using these output args
      output: [
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments+append_list+omit_endlist',
        path.join(HLS_DIR, 'stream.m3u8'),
      ],
    });
    liveCall.onCallEnded.subscribe(() => { console.log('[bridge] Ring ended the call.'); liveCall = null; });
  })();
  try { await starting; } finally { starting = null; }
}

function stopStream() {
  if (liveCall) { console.log('[bridge] Stopping live view (idle).'); try { liveCall.stop(); } catch (_) {} liveCall = null; }
}

// stop the stream when nobody has polled the playlist recently
setInterval(() => { if (liveCall && Date.now() - lastPoll > IDLE_STOP_MS) stopStream(); }, 5000);

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN }));

// health check
app.get('/healthz', (_req, res) => res.json({ ok: true, streaming: !!liveCall, camera: camera && camera.name }));

// playlist: ensures the stream is running, then serves the m3u8 (waits briefly for first segment)
app.get('/live/stream.m3u8', async (req, res) => {
  lastPoll = Date.now();
  try {
    await startStream();
    const file = path.join(HLS_DIR, 'stream.m3u8');
    // wait up to ~8s for ffmpeg to write the first playlist
    for (let i = 0; i < 40 && !fs.existsSync(file); i++) await new Promise(r => setTimeout(r, 200));
    if (!fs.existsSync(file)) return res.status(503).send('stream warming up, retry');
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/vnd.apple.mpegurl');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[bridge] start error:', e.message);
    res.status(500).send('bridge error');
  }
});

// segments
app.get('/live/:seg', (req, res) => {
  lastPoll = Date.now();
  const seg = req.params.seg;
  if (!/^[\w.-]+\.ts$/.test(seg)) return res.status(404).end();
  const file = path.join(HLS_DIR, seg);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('video/mp2t');
  fs.createReadStream(file).pipe(res);
});

http.createServer(app).listen(PORT, () => {
  console.log(`[bridge] listening on http://localhost:${PORT}`);
  console.log(`[bridge] playlist:  http://localhost:${PORT}/live/stream.m3u8`);
  console.log(`[bridge] CORS allows: ${ALLOW_ORIGIN}`);
});

process.on('SIGINT', () => { stopStream(); process.exit(0); });
process.on('SIGTERM', () => { stopStream(); process.exit(0); });
