# 🐉 DEV WP FYT SYSTEM — v7.3.8 (GALAXY • PIN LOCKED)

Multi-session WhatsApp control deck (Baileys 7) — galaxy theme, **PIN-gated**, infinite loops.

## 🔐 PIN LOCK
- The whole deck is **locked** until PIN **709177** is entered (both UI + every server API).
- Unlock once per browser session; if the server restarts, enter the PIN again.

## Run (local)
```bash
cd waweb
npm install
npm start            # → http://localhost:3000
```

## 🚀 Host on Render (free)
1. Push this folder to GitHub.
2. Open [render.com](https://render.com) → **New → Blueprint** → connect the repo.
3. Render auto-builds from `render.yaml` (build: `npm install`, start: `npm start`).
4. Open the live URL → unlock with PIN **709177**.

> ⚠ WhatsApp auth lives in `data/auth`. Render's **free** disk is ephemeral —
> bots re-pair after sleep/restart. For permanent sessions use a paid plan with the
> persistent-disk block in `render.yaml` (uncomment it).

## Bots / Sessions
- **➕ ADD BOT / SESSION** — unlimited bots, each own WhatsApp number / auth.
- Per bot: `🔐 PAIR CODE` → enter number → `GET CODE` → type code on phone
  (Linked Devices → Link with phone number) → `✅ ENTERED ON PHONE — LOGIN` → **ONLINE**.
- `♻ REBOOT` / `🚪 LOGOUT` / `🗑 REMOVE` per bot. Click a bot to select it.

## 🔗 GC Link System (targeting = link only)
- Paste group invite link → `🔍 CHECK LINK` → per bot: **✔ ALREADY IN GROUP** / **✘ NOT IN GROUP → JOIN NOW**.
- Join locks the group as **Active Target** → commands hit that group. No group lists anywhere.

## 🎛 Custom Rotation Banks (per-command)
Each of **SPAM, NAME CHANGER (ENC/NC), CNC, DESC, RAPID** has an open panel
under the operation setup: paste your own emojis/symbols and the engine rotates them live:

| Command | Custom lists | Extra |
|---|---|---|
| SPAM | Start emojis • End emojis | every message = `✨ line 💖` rotating |
| NAME CHANGER | ENC symbols • NC faces/brackets/ends | |
| CNC | symbols | |
| DESC | symbols • end emojis | formats: 👑 HIGH COC / ⚡ FAST WRAP (10ms floor) |
| RAPID | end emojis | styles 0–6 |

- `💾 SAVE TO ENGINE (LIVE)` applies instantly; `↺ RESET` restores defaults.
- Saved in `data/custom.json`, reloaded on boot.

## Commands
SPAM (DTX) • NAME CHANGER (ENC/NC) • DOMAIN (1–5) • RAPID (0–6) • CNC • DESC • SWIPE REPLY •
TAGALL • KICKALL — every tile shows ENGINE SPECS, format chips, delay from→to, threads,
iterations (0 = **∞ until STOP**). Loops have no auto caps; they stop on STOP, logout,
removal or 5 consecutive errors.

## Control
- **⚡ Running Operations** — each live loop with its own **⏹ STOP** + counters/uptime.
- **⏹⏹ STOP ALL OPERATIONS** — one tap kills everything.

## API (all POSTs need `x-fyt-token` from /api/unlock)
```
POST /api/unlock           {pin}                      → token
POST /api/custom           {action, lists} | {reset}  → rotation banks
POST /api/session/add|select|pair|newcode|reboot|logout|remove
POST /api/ping | /api/link/check | /api/link/join
POST /api/start | /api/stop
GET  /api/state
```

🖤 Contact — Designed By Dev
Telegram: t.me/god_olds • YouTube: youtube.com/@tech_zone_dev • 𝑫𝒆𝒔𝒊𝒈𝒏𝒆𝒅 𝑾𝒊𝒕𝒉 𝑳𝒐𝒗𝒆 💖
