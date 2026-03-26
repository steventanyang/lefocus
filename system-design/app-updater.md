# LeFocus: Release & Update Instructions

**Stack:** Tauri 2, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`
**Releases:** https://github.com/steventanyang/lefocus/releases

---

## Release flow (step by step)

### 1. Bump version

- Update `version` in `src-tauri/tauri.conf.json`
- Keep `package.json` version aligned if used for tagging

### 2. Build

```bash
export TAURI_SIGNING_PRIVATE_KEY="<your private key>"
# export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<password>" # if key has one
npm run tauri build
```

This produces in `src-tauri/target/release/bundle/`:
- `macos/lefocus.app` — the app bundle
- `dmg/lefocus_X.X.X_aarch64.dmg` — installer for new users
- `macos/lefocus.app.tar.gz` — updater bundle (for existing users)
- `macos/lefocus.app.tar.gz.sig` — signature file for the updater bundle

### 3. Sign, notarize & generate updater metadata

```bash
./scripts/manual_sign_notarize.sh
```

This script handles everything after build:
- Fixes bundle structure (moves dylib to Frameworks)
- Signs the app + dylib with Developer ID
- Rebuilds and notarizes the DMG
- **Generates `latest.json`** automatically from the `.app.tar.gz.sig` and version in `tauri.conf.json`

At the end it prints the 3 files to upload.

### 4. Upload GitHub Release

Create a new release (e.g. `v0.2.0`) at https://github.com/steventanyang/lefocus/releases/new and upload the 3 files the script tells you to:

| Asset | Location after build | Purpose |
|-------|---------------------|---------|
| `lefocus_X.X.X_aarch64.dmg` | `src-tauri/target/release/bundle/dmg/` | Website download for new users |
| `lefocus.app.tar.gz` | `src-tauri/target/release/bundle/macos/` | Updater bundle for existing users |
| `latest.json` | `src-tauri/target/release/bundle/` | Metadata the updater plugin fetches |

### 6. Existing users get the update

Users click "check for updates" in Settings (`src/components/profile/SettingsSettingsPage.tsx`). The app fetches `latest.json` from the endpoint in `tauri.conf.json`, compares versions, downloads the `.app.tar.gz`, verifies the signature, installs, and relaunches.

---

## Two distribution paths

| Path | Who | What they download | Verified by |
|------|-----|--------------------|-------------|
| Website / GitHub release link | New users | `.dmg` | Apple notarization (Gatekeeper) |
| In-app updater | Existing users | `.app.tar.gz` via `latest.json` | Tauri signature (minisign pubkey embedded in app) |

---

## Key files

| File | What it does |
|------|-------------|
| `src-tauri/tauri.conf.json` → `plugins.updater` | `pubkey` + `endpoints` (where to fetch `latest.json`) |
| `src-tauri/tauri.conf.json` → `bundle.createUpdaterArtifacts` | Must be `true` to emit `.app.tar.gz` + `.sig` |
| `src-tauri/src/lib.rs` | Registers `tauri_plugin_updater` and `tauri_plugin_process` |
| `src/components/profile/SettingsSettingsPage.tsx` | UI: `check()`, `downloadAndInstall()`, `relaunch()` |
| `src-tauri/capabilities/desktop.json` | Grants `updater:default` and `process:default` permissions |
| `scripts/manual_sign_notarize.sh` | Signs, notarizes, and staples the DMG |

---

## Security

- The app embeds a **public key**; updates must be signed with the matching **private key** (`TAURI_SIGNING_PRIVATE_KEY`) or install is rejected.
- **Never commit the private key.** Back it up securely. Losing it means existing installs can't receive updates (users would need a fresh install with a new keypair).
- HTTPS is transport security; the **signature** is the actual trust boundary.

---

## Endpoint config

The updater endpoint in `tauri.conf.json` should point to:

```
https://github.com/steventanyang/lefocus/releases/latest/download/latest.json
```

Using `/latest/download/` auto-resolves to whichever GitHub Release is tagged as "Latest", so you don't update the URL each release.

---

## Notes

- `tauri dev` does not test the updater — must use release builds.
- Auto-check on launch is not implemented; updates are manual via Settings.
- Mac App Store distribution uses store updates, not this pipeline.
