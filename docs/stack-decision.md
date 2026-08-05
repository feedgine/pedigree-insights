---
title: stack-decision
status: CONFIRMED — core decisions locked 2026-06-14
updated: 2026-06-14
---

## Desktop framework

| Decision | Tauri | Electron ✓ (chosen) |
|---|---|---|
| Bundle size | ~8 MB | ~150–200 MB |
| SQLite bridge | tauri-plugin-sql | better-sqlite3 |
| Rust required | Yes | No |
| Use if | Rust toolchain is acceptable | Rust is a blocker |

**Confirmed choice: Electron + better-sqlite3 (confirmed by owner 2026-06-14)**
Rationale: owner preference; familiar Node ecosystem, no Rust toolchain.
Bundle-size cost (~150–200 MB) accepted as fine for a local desktop tool.

---

## Frontend framework

**Confirmed choice: React + TypeScript** [OBSERVED PATTERN — confirm if different preference]

---

## Pedigree chart library

**Confirmed choice: react-flow** [OBSERVED PATTERN — confirm if different preference]
Fallback: custom CSS Grid for read-only print view.

---

## Database file path strategy

How will the app locate the .db file on first launch?

| Option | Notes |
|---|---|
| Hardcoded absolute path | Fast to implement; breaks if file moves |
| File picker on first launch | User selects file; path saved to config |
| Config file (e.g. ~/.pedigree-insights/config.json) | Flexible; requires config management |

**Confirmed choice: File picker on first launch; last path saved to config (confirmed 2026-06-14)**
Implementation: Electron `dialog.showOpenDialog`; persist path via electron-store or config file.

---

## Write access scope

| Option | Notes |
|---|---|
| Read-only | View and print pedigrees only; safest for .db integrity |
| Read + write | Edit animal records in-app; requires schema write-path testing |

**Confirmed choice: Read-only (confirmed 2026-06-14)**
No write queries, no edit UI; open the .db read-only to protect the source file's integrity.

---

## Target Mac architecture

| Option | Notes |
|---|---|
| Apple Silicon only | Smaller build |
| Intel only | Legacy support |
| Universal binary | Both; larger build, recommended for distribution |

**Confirmed choice: Apple Silicon (arm64) only for MVP (confirmed 2026-06-14)**
Native arm64 build targeting M-series Macs. Universal (arm64 + x64) deferred to a
later release if Intel-Mac breeders need it — note `better-sqlite3` is a native
module, so Universal requires per-arch rebuild + merge.

---

## COI display

**Confirmed approach: COI computed by an external script, not in-app (confirmed 2026-06-14)**
The app reads a COI value if available (column or sidecar output) and displays it;
shows "not available" otherwise. No genetics logic in-app, so the canine-genetics
validation gate moves to the external script.

---

## Deployment

**MVP (confirmed 2026-06-14): local, unsigned arm64 `.dmg` for personal use.**
Build with `electron-builder` targeting `mac` / `arm64`; `electron-rebuild`
handles the native `better-sqlite3` module. No code signing or notarization — on
first launch use right-click → Open (or clear the quarantine flag) to get past
Gatekeeper. Single-machine, no distribution.

**Deferred enhancements (not MVP):**
- Public distribution via GitHub Releases (`.dmg` assets).
- GitHub Actions build on Apple Silicon runners (`macos-latest`).
- Code signing + notarization (requires Apple Developer account, $99/yr) — needed
  for a smooth web-download experience; automatable in CI via secrets.
- Auto-update via `electron-updater` against GitHub Releases.
- Homebrew cask; Universal (arm64 + x64) build for Intel-Mac users.

---

## Open items

- `[RESOLVED 2026-06-14]` Desktop framework → Electron + better-sqlite3
- `[RESOLVED 2026-06-14]` Database file path strategy → file picker on first launch
- `[RESOLVED 2026-06-14]` Write access scope → read-only
- `[UNKNOWN — verify]` Target Mac architecture (Universal recommended if distributing)
