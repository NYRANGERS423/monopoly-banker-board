# Monopoly Banker

[![Build & publish Docker image](https://github.com/NYRANGERS423/monopoly-banker-board/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/NYRANGERS423/monopoly-banker-board/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A self-hosted, mobile-first web app that replaces the paper money in a physical
Monopoly game. Players join a single shared "table" by visiting a URL on their
phone, pick a name and color, and from then on every transaction — pay the bank,
collect from the bank, transfer to another player, drop money in Free Parking,
pass GO — happens on their phone. All balances and the activity log update live
across every connected device.

The app is the **bank and the ledger**. The board, dice, and cards still live on
the table.

- 2–8 players, single game per server
- Real-time updates over WebSocket
- Free Parking pot, multi-recipient cards (Birthday / Chairman of the Board),
  Pass GO quick-action
- Negative balances allowed (visible in red — the cue to mortgage)
- Per-game stats, balance trend chart, persistent cross-game leaderboard
- Admin tools: override balance, remove player, edit/delete archived games,
  start a new game, switch currency scale (Classic ↔ Millions, with automatic
  10,000× conversion)
- Mobile-first dark UI, designed for one-thumb operation
- SQLite persistence, survives container restarts

> **Status:** stable enough for game-night use. Maintained as a personal
> project — bug reports and PRs welcome via [GitHub
> Issues](https://github.com/NYRANGERS423/monopoly-banker-board/issues).

---

## Quick start (Docker)

The simplest way to run it is to pull the published image. The `-v` flag mounts
a host directory at `/app/data` inside the container so the SQLite database
survives restarts. Pick **any** host path you want — these are examples:

**Linux / macOS / Unraid:**

```bash
docker run -d \
  --name monopoly-banker \
  --restart unless-stopped \
  -p 3030:3030 \
  -v /mnt/user/appdata/monopoly-banker:/app/data \
  -e ADMIN_CODE=changeme \
  ghcr.io/nyrangers423/monopoly-banker-board:latest
```

**Windows (PowerShell):**

```powershell
docker run -d `
  --name monopoly-banker `
  --restart unless-stopped `
  -p 3030:3030 `
  -v C:\docker\monopoly-banker:/app/data `
  -e ADMIN_CODE=changeme `
  ghcr.io/nyrangers423/monopoly-banker-board:latest
```

The format is `-v HOST_PATH:CONTAINER_PATH`. **`/app/data` is the container
path and must not change** — it's where the app writes `banker.db`. The
host path is yours to pick.

Open `http://<host>:3030` on every device.

### Or with Docker Compose

```yaml
services:
  monopoly-banker:
    image: ghcr.io/nyrangers423/monopoly-banker-board:latest
    container_name: monopoly-banker
    restart: unless-stopped
    ports:
      - "3030:3030"   # host:container
    volumes:
      # left side: host path (yours to choose). right side: container path (don't change).
      - ./data:/app/data
    environment:
      - ADMIN_CODE=changeme
      - DEFAULT_CURRENCY=classic
```

Then `docker compose up -d` from the same directory as the file. The `./data`
folder will be created next to `docker-compose.yml`.

---

## Unraid

1. **Apps → Add Container** (or paste a Community Apps template if one exists).
2. **Repository:** `ghcr.io/nyrangers423/monopoly-banker-board:latest`
3. **Network type:** Bridge
4. **Port:** map host `3030` → container `3030`
5. **Path:** map host `/mnt/user/appdata/monopoly-banker` → container `/app/data`
6. **Environment variables:** set at minimum `ADMIN_CODE` (see below for all
   options)
7. Apply.

Visit `http://<unraid-ip>:3030` on a phone to test.

### Behind Nginx Proxy Manager

In NPM, create a new Proxy Host pointing at `<unraid-ip>:3030` and **enable
"Websockets Support"** under the Details tab. Without it the live broadcast
won't work and balances will stop updating in real time.

---

## Environment variables

| Variable                       | Default          | Notes |
|--------------------------------|------------------|-------|
| `PORT`                         | `3030`           | Container listen port (in dev: `3000` via `.env.example`) |
| `HOST`                         | `0.0.0.0`        | Bind address |
| `ADMIN_CODE`                   | `1413`           | Code to unlock the Admin tab in Settings. **Change this** before exposing the app outside your LAN. |
| `DEFAULT_CURRENCY`             | `classic`        | `classic` (dollars) or `millions` (Here & Now scale) |
| `DEFAULT_FREE_PARKING_ENABLED` | `true`           | Show Free Parking pot UI |
| `DEFAULT_STARTING_BALANCE`     | `1500`           | Starting cash per player. In millions mode use `15000000`. |
| `DEFAULT_PASS_GO_AMOUNT`       | `200`            | Pass GO payout. In millions mode use `2000000`. |
| `DB_PATH`                      | `/app/data/banker.db` | SQLite file location inside the container |
| `NODE_ENV`                     | `production`     | Set automatically in the prebuilt image |

These defaults only apply when the database is first created. After that they
live in the SQLite `game_state` row and the admin can change them in-app via
**Settings → Admin → Game settings**.

---

## How a session works

- A player opens the URL on their phone, picks a name + color, and joins. They
  appear on every other device.
- Player IDs are stored in `localStorage`. If a phone refreshes or sleeps, it
  reconnects automatically. If a player explicitly clears their session, they
  show up as **"free"** in the join screen's *Resume as…* list and can be
  reclaimed by tapping their name.
- Only one device can be bound to a player at a time. If a second device claims
  a player who's currently in use, the first device is kicked back to the join
  screen with a notice.
- Negative balances are allowed and shown in red — the cue to mortgage a
  property in real life and tap **Collect from Bank** to recover.
- Admin enters the `ADMIN_CODE` in Settings to unlock override / remove /
  new-game / settings / leaderboard-management controls. Every admin action is
  recorded in the activity log with an `ADMIN` badge.
- Starting a new game archives the current one to the leaderboard, then resets
  players + transactions + Free Parking pot. Settings stay.

---

## Troubleshooting

**Balances don't update on other devices in real time.**
Socket.IO's WebSocket upgrade is being blocked. If you're behind a reverse
proxy (Nginx Proxy Manager, Caddy, etc.) make sure WebSockets are enabled for
this host. In Nginx Proxy Manager that's a single toggle in the Details tab.

**A phone shows "Connecting…" forever.**
Same root cause as above, *or* the container isn't reachable at the URL the
phone is using. From the phone, try `http://<server-ip>:3030/healthz` — should
return `{"ok":true,...}`.

**"Name already in use" for a name no one's playing as.**
A previous game-removed player still holds the name in the database from a
pre-1.0 build. Either clear the entire database (stop container, delete
`banker.db`, restart) or upgrade to the current image — newer builds run a
migration that drops the legacy `UNIQUE` constraint and lets removed-player
names be reused.

**Container won't start, log mentions a SQLite error.**
The database file may be corrupted (e.g., disk filled up mid-write). Stop the
container, move `banker.db` out of the data directory, restart the container.
A fresh game will start. You can poke at the moved file with the `sqlite3` CLI
to recover anything important.

**Player got bumped to the join screen with "claimed by another device".**
Expected behavior — only one device may be bound to a player at a time.
Whoever just claimed that player has the live session. The bumped device can
re-claim from the *Resume as…* list on the join screen if needed.

**Switching from millions to classic mode lost cents-level precision.**
Also expected. Classic stores integer dollars; downscaling from millions
rounds. Sub-$10K amounts in millions become $0 or $1 after the round-trip. If
you need a clean reset, use the admin "Clear all history" + "Set game number"
controls.

**The leaderboard shows the wrong winner / a removed game.**
Open the Admin tab → "Manage leaderboard / history" → edit the winner or
delete that game outright. Changes broadcast to every connected device live.

**Need to nuke everything and start fresh.**
Stop the container, delete the SQLite file at the host-side mount path, start
again. The schema rebuilds itself on first boot.

---

## Backups

Everything lives in a single SQLite file at `data/banker.db` (host-side bind
mount). Back it up by copying the file. To start completely fresh, stop the
container, delete the file, restart.

---

## Develop locally

Requires Node 22.5+ (24 LTS recommended). Uses `node:sqlite` (built-in, no
native compilation).

```bash
git clone https://github.com/NYRANGERS423/monopoly-banker-board.git monopoly-banker-board
cd monopoly-banker
npm install
cp .env.example .env
npm run dev
```

- Server (Fastify + Socket.IO) hot-reloads on `http://localhost:3000`
- Vite client hot-reloads on `http://localhost:5173`
- Connect from phones on the same LAN: `http://<your-LAN-ip>:5173`

```bash
npm test           # engine unit tests
npm run typecheck  # server + client typecheck
npm run build      # production build
npm start          # serves the built client + server on :3030
```

### Build the Docker image yourself

```bash
docker build -t monopoly-banker .
docker run -d -p 3030:3030 -v $(pwd)/data:/app/data monopoly-banker
```

---

## Architecture

- **Backend** — Node.js 24 + Fastify + Socket.IO + Zod + `node:sqlite`
- **Frontend** — Vite + React 18 + TypeScript + TailwindCSS + Zustand +
  Recharts + framer-motion + react-hot-toast + lucide-react
- **Persistence** — single SQLite file, schema in [server/src/db/schema.sql](server/src/db/schema.sql)
- **Image** — multi-stage Dockerfile, Node 24 slim base, ~200MB final, multi-arch
  (linux/amd64 + linux/arm64)
- **Single source of truth** — every state-changing event runs inside one SQLite
  transaction, then the full game state is broadcast to every connected client

```
shared/   — types used by client + server
server/   — Fastify + Socket.IO + node:sqlite, all game-engine logic
client/   — Vite + React + Tailwind UI
.github/  — Actions workflow that builds + publishes the image to GHCR
```

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, and
redistribute.

This project is **unaffiliated with Hasbro, Inc.** "Monopoly" is a trademark of
Hasbro. This software is a player aid for tracking money in a physical copy of
the game; it includes no Hasbro artwork, board layouts, card text, or other
copyrighted content.
