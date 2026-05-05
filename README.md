# sticky

Two ways to run the same code.

## Web mode (browser, fastest iteration)

```
node server.js
```

Open http://localhost:5174. Data persisted to `./data.json` next to `server.js`.

## Desktop mode (Tauri)

One-time setup:

1. Install Rust:
   ```
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```
2. Install Tauri CLI:
   ```
   cargo install tauri-cli --version "^2"
   ```
3. Generate icons (needs any 1024×1024 PNG):
   ```
   cargo tauri icon /path/to/some-square-image.png
   ```
   Outputs into `src-tauri/icons/`.

Then:

```
cargo tauri dev      # hot dev window
cargo tauri build    # produces .dmg / .app in src-tauri/target/release/bundle
```

## Where the desktop app stores data

macOS: `~/Library/Application Support/com.kayden.sticky/`

```
data.json                         current
data.bak.json                     copy of the previous save (rotates every save)
backups/2026-05-06.json           first save of that day, kept forever
backups/2026-05-07.json
…
```

## Migrating from the old localhost build

```
cp ~/Desktop/todo/data.json "~/Library/Application Support/com.kayden.sticky/data.json"
```

(The Tauri app creates the directory on first launch — run it once, then quit, then copy.)

## How the dual-mode trick works

`public/storage.js` checks for `window.__TAURI__`:
- **Browser**: no-op. `fetch('/api/*')` hits `server.js`.
- **Tauri**: monkey-patches `fetch` so `/api/*` calls run as `invoke('load_data' | 'save_data')` against the Rust backend. All API logic lives in JS (mirrors `server.js` exactly).

Rust does only two things: (1) atomic write via tmp + rename, (2) rotate `.bak` and write daily snapshot.

## Distributing via GitHub

The repo ships a GitHub Actions workflow (`.github/workflows/release.yml`) that builds for macOS (Intel + Apple Silicon), Windows, and Linux on every tag push. It uses [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) and uploads the bundles to a draft release.

### One-time

```
gh repo create sticky --public --source=. --remote=origin --push
```
(or do it via the GitHub web UI and `git remote add origin …`)

### Each release

```
# bump src-tauri/tauri.conf.json "version" + Cargo.toml [package].version
git commit -am "v0.2.0"
git tag v0.2.0
git push && git push --tags
```

The workflow runs (~15 min for all four platforms) and creates a **draft release** on GitHub. Open the Releases page → review the assets → click **Publish release**.

### What users will see

- **macOS** `.dmg` — drag-and-drop installer. **Unsigned** by default, so the first time someone opens it they get *"sticky cannot be opened because the developer cannot be verified"*. Workaround: right-click the `.app` → **Open** → confirm. Or `xattr -cr /Applications/sticky.app`. To remove this entirely, get an Apple Developer ID ($99/year) and set `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` + `APPLE_SIGNING_IDENTITY` + `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID` as repo secrets — `tauri-action` notarises automatically.
- **Windows** `.msi` and `.exe` — SmartScreen warns until enough downloads OR you sign with an EV cert.
- **Linux** `.AppImage` and `.deb` — usually fine, but `chmod +x` may be needed for the AppImage.

### Auto-update (optional, later)

Add the [Tauri updater plugin](https://v2.tauri.app/plugin/updater/) and a public/private signing key pair. The workflow then signs each release; the running app polls a `latest.json` URL on GitHub Releases and prompts users to update.

## Repo layout

```
sticky-app/
├── .github/workflows/release.yml   ← cross-platform builds on tag push
├── .gitignore                      ← ignores target/, data.json, etc.
├── LICENSE                         ← MIT
├── README.md
├── package.json
├── server.js                       ← web mode (dev only)
├── public/                         ← shared frontend
└── src-tauri/                      ← desktop app
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/                      ← generate with `cargo tauri icon`
    └── src/main.rs
```
