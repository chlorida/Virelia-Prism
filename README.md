# Virelia Prism

**A Windows-first desktop media library for local video and audio collections.**

Virelia Prism is built for large personal libraries—anime, series, and music—with rich title pages, queue workflows, local playback, optional online metadata, and an on-device subtitle pipeline. The UI is a custom cinematic shell (library, watch mode, and mini player) backed by a Rust core and a React renderer.

> **Status:** `0.1.0-alpha` — usable for local development and testing. Treat public builds as experimental until the [release gate](#release-checklist) is complete.

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Virelia Prism — library and watch mode" width="920" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#tech-stack">Stack</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="PRIVACY.md">Privacy</a> ·
  <a href="SECURITY.md">Security</a>
</p>

---

## Features

### Library

- Import folders and individual files via native dialogs or drag-and-drop
- Recursive library scan with progress events and skipped-file reporting
- Two browse modes: **Titles** (grouped works) and **Files** (flat list)
- Video / music content modes with filters and sorting
- Virtualized lists and grids for large libraries (20k+ files in QA)
- Snapshot-based startup: cached library loads first, background rescan when stale
- Franchise hubs, recently added, favorites, and title detail pages with episode progress

### Playback

- Local audio and video playback through the desktop shell
- Library mode preview, dedicated **watch / cinema** layout, and **mini player**
- Queue with reorder, pin, repeat, and shuffle; manual and smart playlists
- Playback session restore, resume positions, and watch history
- Optional **mpv** engine (Electron dev path); HTML5 playback in Tauri via asset protocol
- Keyboard shortcuts for transport, navigation, queue, favorites, search, and settings

### Metadata & discovery

- Optional online metadata: posters, backdrops, trailers, screenshots, synopsis, ratings
- Providers: Prism Metadata Gateway, AniList, Jikan, TMDB, TVMaze
- Discover feed with personalized and trending rails; watchlist for catalog titles
- Local + online search; external search shortcuts (Google, Bing, DuckDuckGo, custom URL)
- Disk-backed title metadata and image cache; offline mode when online lookup is disabled

### Subtitles

- Discover embedded, external sidecar, and generated subtitle tracks (VTT, SRT, ASS)
- Extract embedded tracks and import external files
- On-device generation via **whisper.cpp** with GPU auto-detection and progressive preview
- Translation backends: built-in LibreTranslate (localhost), local HTTP/command, custom API
- Speaker colors, character color inference and overrides, timing offset, auto track selection

### Media intelligence

- Filename parsing for seasons, episodes, specials, release tags, and duplicates
- Grouping files into titles and episodes with version deduplication (quality scoring)
- Smart up-next recommendations from local library signals
- Identity and parser result caching across rescans

### UX & localization

- Custom frameless window, three-column shell, smart right panel (queue / up next / info)
- UI sounds, toast notifications, context menus, first-run onboarding wizard
- English and Russian UI (`auto` detects ru / uk / be)
- Focus-visible accessibility and `prefers-reduced-motion` support

---

## Architecture

Virelia Prism splits responsibilities between a **thin React UI** and a **Rust backend** exposed through Tauri IPC. The renderer never touches the filesystem directly; it calls a stable `window.prism` adapter that works across Tauri (target shell) and Electron (legacy dev).

```
┌─────────────────────────────────────────────────────────────────┐
│  React 19 renderer (Vite)                                       │
│  features · components · playback · mediaIntelligence · i18n    │
│  createStore state · custom route store · @tanstack/react-virtual│
└────────────────────────────┬────────────────────────────────────┘
                             │ invoke() + events
┌────────────────────────────▼────────────────────────────────────┐
│  Tauri 2 (virelia_prism_lib)                                    │
│  commands · services · LibraryStore · subtitle pipeline         │
│  FFmpeg · ffprobe · whisper.cpp · thumbnail queue               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Local persistence (%APPDATA%/com.virelia.prism)                │
│  settings.json · library.snapshot.json · subtitle/thumb/metadata│
│  caches · whisper models                                        │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Renderer** | UI, routing, playback orchestration, metadata providers, search index, localStorage user data |
| **Rust services** | Folder scan, media filtering, subtitles, thumbnails, settings I/O, subprocess management |
| **IPC** | ~45 commands; events for scan progress, library changes, subtitle generation, model downloads |
| **Persistence** | JSON snapshots and disk caches (no SQLite in the current alpha) |

---

## Tech stack

| Area | Technologies |
|------|----------------|
| UI | React 19, TypeScript 6, Vite 8 |
| Desktop (release) | Tauri 2, `@tauri-apps/api`, dialog plugin |
| Desktop (dev) | Electron 42 (legacy) |
| Backend | Rust 2021 — serde, walkdir, ureq, chrono |
| Lists at scale | `@tanstack/react-virtual` |
| Media tooling | FFmpeg / ffprobe, whisper.cpp, optional mpv |
| Translation | LibreTranslate (built-in local server, optional) |
| Tests | Vitest (127+ frontend tests), `cargo test` (Rust) |
| CI | GitHub Actions on `windows-latest` |

---

## Why this project is interesting

- **Large-library first** — snapshot boot, deferred indexing, virtualization, and background rescan policies are first-class, not afterthoughts.
- **Real media semantics** — release-name parsing, duplicate versions, franchises, and smart up-next sit alongside a conventional file browser.
- **Full subtitle stack on the desktop** — discovery, extraction, Whisper generation with cancel/progress, translation, and ASS speaker styling in one app.
- **Deliberate shell boundary** — the same React app targets Tauri and Electron through an adapter, which is how you migrate a desktop product without rewriting the UI.
- **Measured engineering** — startup perf marks, library perf counters, QA checklist for 20k+ libraries, and a documented release gate.

---

## Getting started

### Requirements

- **Windows** (primary target)
- **Node.js** 24+ (see CI)
- **Rust** stable (for Tauri builds and `cargo test`)
- **npm** — use `npm ci` in CI; `npm install` locally

Optional for subtitles (not stored in git — download after clone):

| Asset | Location | How to get |
|-------|----------|------------|
| `ffmpeg.exe`, `ffprobe.exe` | `src-tauri/resources/bin/windows/` | [ffmpeg.org](https://ffmpeg.org/download.html) builds for Windows |
| `whisper-cli.exe` (+ CUDA DLLs optional) | same folder | `scripts/setup-whisper-gpu.ps1` or [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases) |
| `ggml-base.bin` (~150 MB) | `src-tauri/resources/models/` | [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin) |

Details: `src-tauri/resources/bin/windows/README.txt` and `src-tauri/resources/models/README.txt`.

GitHub rejects individual files over **100 MB**; these stay on your machine and in release bundles, not in the repository.

### Install

```powershell
git clone <repository-url>
cd virelia-prism
npm install
```

### Development

**Tauri (recommended):**

```powershell
npm run tauri:dev
```

**Electron (legacy):**

```powershell
npm run dev
```

### Verify

```powershell
npm run typecheck
npm test
npm run test:rust
npm run build
```

### Production build (Tauri)

```powershell
npm run tauri:build
```

Other scripts: `tauri:build:fast`, `tauri:build:perf`, `measure:startup`, `release:check`.

### First run

1. Complete the onboarding wizard (language, metadata preferences, optional Whisper model benchmark/download).
2. Import a media folder from the library sidebar or drag-and-drop files.
3. Enable online metadata in Settings if you want posters and Discover; see [`PRIVACY.md`](PRIVACY.md) for network behavior.

---

## Release checklist

Before advertising a public build:

- [ ] `npm run release:check` passes
- [ ] `npm run tauri:build` passes on a clean machine
- [ ] Tauri icons and required native resources are present
- [ ] [`PRIVACY.md`](PRIVACY.md) matches enabled network features
- [ ] Known limitations are documented in release notes

---

## Roadmap

| Area | Direction |
|------|-----------|
| **Shell** | Tauri as the sole release shell; retire Electron dev path |
| **Settings & data** | Unify settings and library persistence across shells |
| **File watching** | Implement folder watchers (`watch_folders` is currently a stub) |
| **Distribution** | Windows installer signing and public release automation |
| **Subtitles** | Clearer bundling story for FFmpeg / Whisper in public artifacts |
| **Player** | Continue hardening HTML5 playback under Tauri asset protocol |

---

## Screenshots

Add captures under `docs/screenshots/` (referenced below). Suggested shots:

| File | Content |
|------|---------|
| `hero.png` | Library home with title grid (hero image above) |
| `watch-mode.png` | Cinema / watch layout with player chrome |
| `title-detail.png` | Title page with metadata and episode list |
| `discover.png` | Discover rails |
| `subtitles.png` | Subtitle menu or generation progress |
| `mini-player.png` | Mini player window |
| `settings.png` | Settings modal |

<p align="center">
  <img src="docs/screenshots/watch-mode.png" alt="Watch mode" width="45%" />
  &nbsp;
  <img src="docs/screenshots/discover.png" alt="Discover" width="45%" />
</p>

---

## Project layout

```
virelia-prism/
├── src/renderer/          # React UI, features, playback, mediaIntelligence
├── src/main/              # Electron main process (legacy)
├── src/shared/            # Shared types, i18n, defaults
├── src-tauri/             # Rust backend, commands, services, resources
├── docs/screenshots/      # README screenshots
├── public/sounds/         # UI sound assets
└── scripts/               # Release, Whisper, translation setup helpers
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [`PRIVACY.md`](PRIVACY.md) | Local data and network requests |
| [`SECURITY.md`](SECURITY.md) | Security reporting and alpha notes |

---

## License

This repository is **private and unlicensed** (`UNLICENSED` in `package.json`). All rights reserved unless the maintainer publishes an explicit license.

---

<p align="center">
  <sub>Virelia Prism · local-first media library</sub>
</p>
