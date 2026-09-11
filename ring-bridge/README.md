# Carpool Ring Bridge

Makes your Ring camera stream **inside** the carpool calendar — the real, secure way.

The key idea: **your Ring token never touches the webpage.** It lives here, on a small
program you run on an always-on machine (a PC, a Raspberry Pi, a NAS, or a cheap cloud
VM). The bridge logs into Ring, pulls the live view, and re-serves it as a normal video
stream (HLS) that the calendar embeds. The public webpage only ever sees the video, never
the credential.

```
Ring account ──(token, secret, only here)──▶ [ ring-bridge ] ──HLS video──▶ calendar <video>
```

## Prerequisites
- **Node.js 18+**
- **ffmpeg** installed and on your PATH (`ffmpeg -version` should work).
  Windows: `winget install Gyan.FFmpeg` · Mac: `brew install ffmpeg` · Linux: `apt install ffmpeg`
- A machine that stays on when carpool video is needed.

## 1. Install
```bash
cd ring-bridge
npm install
```

## 2. Get your Ring token (this is the "API key")
Ring has no simple key — you generate a long-lived **refresh token** from your Ring
login + 2FA. Run:
```bash
npm run get-token
```
Enter your Ring email, password, and the 2FA code it texts you. It prints a
**Refresh Token**. Copy it.

> This token can access your Ring account. Treat it like a password. It only ever lives
> in your local `.env` file (git-ignored) — never in the calendar, never committed.

## 3. Configure
```bash
cp .env.example .env
```
Edit `.env` and paste the token into `RING_REFRESH_TOKEN`. Set `RING_CAMERA_NAME` to part
of your front camera's name (as it appears in the Ring app), e.g. `Front`.

## 4. Run
```bash
npm start
```
You should see `listening on http://localhost:8123`. Test it in a browser:
`http://localhost:8123/healthz` → `{"ok":true,...}`

## 5. Make it reachable by your families
Your families view the calendar from their own phones, so the bridge needs a public
HTTPS address (GitHub Pages is HTTPS and can't embed a plain `http://localhost`). Easiest
options — pick one:

- **Cloudflare Tunnel** (free, recommended):
  ```bash
  cloudflared tunnel --url http://localhost:8123
  ```
  It prints a `https://something.trycloudflare.com` URL.
- **ngrok**: `ngrok http 8123` → gives an `https://…ngrok-free.app` URL.

Copy that public HTTPS URL.

## 6. Point the calendar at it
In the calendar **admin** page → School details → **Live camera link**, paste:
```
https://YOUR-PUBLIC-URL/live/stream.m3u8
```
The calendar detects a `.m3u8` link and plays it **inline** during carpool windows
(instead of opening the Ring app). Any other link still just opens as a tap-through.

## Notes & limits
- The stream starts **on demand** (first viewer) and stops after ~60s of nobody
  watching, so it won't drain the camera battery around the clock.
- Ring occasionally **rotates** the refresh token. If the bridge stops authenticating,
  run `npm run get-token` again and update `.env`.
- This is a home-scale bridge for a 4-family carpool, not a hardened public service.
  Keep the tunnel URL private (share only in your carpool group). For a set-and-forget
  option, **Home Assistant** or **Scrypted** with the Ring integration do the same job
  with a management UI — ask and I'll give you that path instead.
