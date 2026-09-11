# Host the Ring bridge free on Google Cloud (e2-micro, Always Free)

Goal: run the bridge 24/7 in the cloud so your **laptop can be off**, with a
**permanent URL** you paste into admin once.

Result: `https://<your-name>.ngrok-free.app/live/stream.m3u8?k=<key>` — never changes.

---

## 1. Create the free VM
1. Go to https://console.cloud.google.com → sign in → create a project (e.g. `carpool`).
2. **Billing:** you must add a card (identity check). The **Always Free** e2-micro won't charge you.
3. Left menu → **Compute Engine → VM instances → Create instance**.
   - **Region:** `us-west1`, `us-central1`, or `us-east1` (ONLY these are Always Free)
   - **Machine type:** `e2-micro`
   - **Boot disk:** Ubuntu 22.04 LTS, 30 GB Standard
   - Leave the rest default → **Create**.
4. When it's running, click **SSH** (opens a browser terminal). Do everything below there.

---

## 2. Install what the bridge needs
```bash
sudo apt update
sudo apt install -y git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && ffmpeg -version | head -1
```

A little swap protects the 1 GB RAM during install:
```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Get the bridge code
```bash
git clone https://github.com/venu-madhav-mahadevu/Carppol.git
cd Carppol/ring-bridge
npm install
```

---

## 4. Get your Ring token (on the VM)
```bash
npm run get-token
```
Enter your Ring email, **new** password, and 2FA code. Copy the long token it prints.

Create the `.env` (paste the token here — never in chat):
```bash
nano .env
```
Put in:
```
RING_REFRESH_TOKEN=<paste the long token>
RING_CAMERA_NAME=Front
ALLOW_ORIGIN=https://venu-madhav-mahadevu.github.io
PORT=8123
IDLE_STOP_MS=60000
STREAM_KEY=<paste output of: openssl rand -hex 24>
```
Generate the key first if you like: `openssl rand -hex 24` → copy into STREAM_KEY.
Save nano with **Ctrl+O, Enter, Ctrl+X**.

Test it:
```bash
node --env-file=.env check.js      # should print: CONNECTED OK. Cameras found: ...
```

---

## 5. Permanent URL with ngrok (free static domain)
1. Sign up free at https://dashboard.ngrok.com → **Your Authtoken** (copy it).
2. **Domains** → claim your 1 free **static domain** (e.g. `carpool-venu.ngrok-free.app`).
3. On the VM:
```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install -y ngrok
ngrok config add-authtoken <YOUR_AUTHTOKEN>
```

---

## 6. Run both 24/7 (auto-start, auto-restart)
Bridge service:
```bash
sudo tee /etc/systemd/system/ring-bridge.service >/dev/null <<EOF
[Unit]
Description=Ring bridge
After=network-online.target
Wants=network-online.target
[Service]
WorkingDirectory=$HOME/Carppol/ring-bridge
ExecStart=/usr/bin/node --env-file=.env server.js
Restart=always
User=$USER
[Install]
WantedBy=multi-user.target
EOF
```

ngrok service (replace the domain):
```bash
sudo tee /etc/systemd/system/ring-tunnel.service >/dev/null <<EOF
[Unit]
Description=ngrok tunnel for ring bridge
After=network-online.target ring-bridge.service
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/ngrok http 8123 --domain=YOUR-NAME.ngrok-free.app --log=stdout
Restart=always
User=$USER
[Install]
WantedBy=multi-user.target
EOF
```
(If ngrok is elsewhere, use `which ngrok` and update the path.)

Enable + start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ring-bridge ring-tunnel
sudo systemctl status ring-bridge --no-pager
```

---

## 7. Put the permanent URL in the calendar (once)
Your stream URL is:
```
https://YOUR-NAME.ngrok-free.app/live/stream.m3u8?k=<your STREAM_KEY>
```
Admin (prod + staging) → **Live camera link** → paste → Save. Done forever —
laptop can be off, VM handles everything, URL never changes.

---

## Notes
- **Egress:** ~1 GB/month free. Live video is ~1–2 Mbps, so heavy watching may go a
  little over (overage ≈ $0.12/GB — usually a few cents). The bridge auto-stops when
  nobody's watching, which keeps this small.
- **Token rotation** is handled automatically (saved back to `.env` on the VM).
- **Update the code later:** `cd ~/Carppol && git pull && sudo systemctl restart ring-bridge`.
- **Logs:** `journalctl -u ring-bridge -f` and `journalctl -u ring-tunnel -f`.
