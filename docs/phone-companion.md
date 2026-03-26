# Phone companion (LAN)

Slim reference for the **phone companion** feature: a local HTTP + WebSocket server on the Mac so phones on the same Wi‑Fi can open a web UI, enter a PIN, and follow the live timer (with optional end/cancel).

## User flow

1. On the timer screen (idle), open **phone version** → **start phone sharing**.
2. Scan the QR or open the shown URL on the phone (same LAN as the Mac).
3. Enter the **6-digit PIN** shown on the Mac.
4. Multiple devices can join; each gets a session token after a correct PIN.

Sharing stops when you tap **stop sharing**, or when the timer is no longer running (idle after end/cancel/complete).

## Architecture

| Layer | Role |
|--------|------|
| Tauri commands | Start/stop server, read status, rotate PIN (`src-tauri/src/companion/mod.rs`). |
| Axum server | Serves `phone.html`, REST join/action, WebSocket stream (`/ws`). |
| `TimerController` | Source of truth; companion only **broadcasts** snapshots and forwards **end/cancel** to the same controller as the desktop app. |

Timer updates are pushed over WebSocket as JSON events (e.g. `timerSnapshot`, `sessionCompleted`).

## Tauri commands (host)

- `start_companion_server` — bind `0.0.0.0:0`, show LAN URL + PIN.
- `stop_companion_server` — graceful shutdown.
- `get_companion_status` — `{ active, joinUrl, joinPin, connectedClients, port }`.
- `rotate_companion_pin` — new PIN (see security note below).

## HTTP API (phone, same origin as QR URL)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Mobile web UI (`phone.html`). |
| `POST` | `/api/join` | Body `{ "pin": "000000" }` → `{ token, snapshot }` or 401. |
| `POST` | `/api/action` | Body `{ "token": "...", "action": "end" \| "cancel" }`. |
| `GET` | `/ws?token=...` | Live events after join. |

## Security (MVP)

- **LAN only** — anyone on the same network can reach the port; **PIN** is the gate for join and token issue.
- Tokens are **in-memory**; they are **not** automatically invalidated when the PIN is rotated (treat rotate as “new guests only” unless you add invalidation later).
- No TLS on the local server (HTTP on LAN).

## Key files

| Path | Notes |
|------|--------|
| `src-tauri/src/companion/mod.rs` | Server, manager, Tauri commands. |
| `src-tauri/src/companion/phone.html` | Embedded phone UI. |
| `src-tauri/src/timer/controller.rs` | Broadcasts snapshots / stops companion when idle. |
| `src/hooks/useCompanion.ts` | Host UI invokes. |
| `src/components/timer/TimerView.tsx` | Phone version entry + QR/PIN panel. |
| `src/types/companion.ts` | `CompanionStatus` shape. |

## Operational notes

- **Wrong LAN IP** — join URL uses a best-effort local IP; if the phone cannot connect, check same Wi‑Fi, no client isolation, and try the URL manually with the shown port.
- **Firewall** — macOS may prompt for incoming connections the first time.
