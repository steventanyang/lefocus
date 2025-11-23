# Desktop Release & Auto-Update Flow

## Overview
Define the end-to-end process that turns a tagged commit into a notarized macOS DMG, publishes it for download, and delivers it to installed clients through Tauri's updater. This doc scopes the tooling, infrastructure, and responsibilities needed for a repeatable release.

## Goals
1. Ship signed/notarized macOS builds users can trust.
2. Automate release generation from CI to reduce manual steps.
3. Provide a reliable, privacy-preserving update channel.
4. Maintain traceability from source commit → artifact → client install.

## Non-Goals
- Windows/Linux packaging (future work).
- Telemetry or crash reporting beyond what already exists.
- App Store submission (flow targets direct distribution only).

## High-Level Architecture

```
Developer tags release ─▶ GitHub Actions workflow
                         │
                         ├─ Build + sign + notarize DMG via Tauri CLI
                         │
                         ├─ Upload DMG + checksums to GitHub Release (artifact store)
                         │
                         └─ Update manifest JSON (version, URL, signature) → static hosting (e.g., GitHub Pages/S3)

Installed client ─▶ Tauri updater polls manifest ─▶ downloads signed DMG ─▶ verifies signature ─▶ installs update
```

## Key Components
| Component | Responsibility |
| --- | --- |
| **Source Repo (GitHub)** | Versioned code, tags trigger releases. |
| **GitHub Actions** | CI pipelines for build/test/release, handles secrets. |
| **Tauri CLI** | `tauri build` to produce universal macOS bundle + DMG. |
| **Apple Developer Credentials** | Signing identity + API key (or Apple ID) for notarization. Stored as encrypted GitHub secrets. |
| **Artifact Store (GitHub Releases)** | Hosts DMG, `.sig`, checksum, release notes. |
| **Update Manifest Host** | Static JSON file accessible over HTTPS (GitHub Pages/S3). |
| **Tauri Updater** | Client-side auto-update module that polls manifest and applies updates. |

## Detailed Flow

### 1. Versioning & Tagging
1. Bump semantic version in `package.json` and `src-tauri/tauri.conf.json`.
2. Commit + create annotated git tag `vX.Y.Z` on `main/testing`.
3. Push tag → triggers `release.yml` workflow.

### 2. CI Release Workflow (GitHub Actions)
1. **Checkout & Toolchain Setup**: install Node 20+, Rust toolchain, Tauri deps, `appleboy/xcode` image for macOS runner.
2. **Install deps**: `npm ci` (or `pnpm install --frozen-lockfile`).
3. **Build Frontend**: `npm run build` ensures TypeScript + Vite succeed.
4. **Tauri Build**: `npm run tauri build -- --verbose` producing `app.app` + DMG.
5. **Signing**: use `APPLE_CERT_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_TEAM_ID` secrets to import signing identity; set `TAURI_PRIVATE_KEY` for updater signature.
6. **Notarization**: submit DMG via Xcode `notarytool`, poll for success, staple ticket.
7. **Generate Checksums & Signatures**: `shasum -a 256`, `tauri signer sign <DMG>` generating `.sig` file.
8. **Create GitHub Release**: attach DMG, checksum, signature, release notes; mark as draft for manual QA or auto-publish.
9. **Publish Update Manifest**: render `latest.json` with version, pubDate, platform-specific bundle info, download URL, signature; upload to Pages/S3 bucket (dedicated job/step).

### 3. Manual QA Gate (optional)
- Download artifact from draft release, smoke test install & auto-update.
- Promote release to "published" when satisfied.

### 4. Client Update Flow
1. App launches → Tauri updater checks `latest.json` on interval (default 12h).
2. If `version` > current, downloads DMG from release URL.
3. Verifies updater signature + Apple signature.
4. Applies delta (if available) or full DMG install; prompts restart.

## Config Changes Required
1. `src-tauri/tauri.conf.json`
   - `package.version`: keep in sync with app semantic version.
   - `tauri.updater`: set `active: true`, `endpoints: ["https://<host>/latest.json"]`, `dialog: true/false` per UX.
   - `tauri.macOS`: specify `signingIdentity`, `entitlements`, `exceptionDomain` for updater host.
2. GitHub Secrets
   - `APPLE_CERT_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_TEAM_ID` (or App Store Connect API key vars).
   - `NOTARIZATION_APPLE_ID`, `NOTARIZATION_PASSWORD` (app-specific password).
   - `TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD` for updater signing.
   - Optional: `AWS_ACCESS_KEY_ID/SECRET` if hosting manifest on S3.
3. GitHub Actions Workflow (`.github/workflows/release.yml`)
   - Matrix for `macos-14` runner, caching for `node_modules` + `target`.
   - Distinguish between tag-triggered release vs. PR validation (build only).

## Privacy & Security Considerations
- **Data Residency**: Only artifacts leave developer machines; user data stays local. Updater downloads code only, no telemetry.
- **Transport Security**: Serve manifest + DMG via HTTPS; enforce TLS 1.2+.
- **Artifact Integrity**: Dual protection via Apple signing + Tauri updater signature; clients reject mismatches.
- **Secret Handling**: Store Apple credentials + keys only in GitHub Actions secrets with least privilege; rotate periodically.
- **Rollback**: keep previous releases available; clients can be instructed to downgrade by pointing manifest to prior version if urgent.

## Testing Strategy
1. **CI Validation**: `npm run build` + `npm run tauri build` on every PR to catch regressions early.
2. **Release Dry-Run**: nightly workflow builds unsigned artifacts to ensure pipeline health without consuming notarization quota.
3. **Updater QA**: staging manifest endpoint pointing to release candidates; dogfood updates internally before promoting to production manifest.
4. **Security Tests**: periodically validate certificates, notarization, and updater signature with automated scripts.

## Rollout Plan
1. Implement workflow + config behind feature branch.
2. Test with staging manifest and internal testers.
3. Flip production manifest endpoint once stable.
4. Monitor error logs (CI + client-side, if available) for 24h, then announce release.

## Open Questions
1. Do we need delta updates (MSI/binary diff) or is full DMG acceptable given size constraints?
2. Should manifest hosting live in same repo (GitHub Pages) or external CDN for better SLA?
3. How do we alert users if auto-update fails repeatedly (in-app banner, email, etc.)?
4. Can we reuse credentials for future Windows signing, or should we isolate secrets per platform?
