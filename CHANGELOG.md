# Changelog

Notable user-facing changes to Skald. Dates are the build cut dates.

## 1.3.0 (2026-11-03)

A shell and localisation release. The library/player logic is unchanged; what
moved is everything around it.

### New window shell (macOS-inspired)
- Persistent translucent **sidebar** replaces the "everything in a top bar"
  layout: grouped source-list navigation, count badges, and the account pinned to
  the bottom.
- **Traffic-light window controls** (close / minimise / zoom) at the top-left,
  with hover-revealed glyphs, replacing the right-aligned Windows-style buttons.
  Login and onboarding share the same chrome.
- **Unified titlebar**: the destination is the primary label, the current library
  or book count the subtitle, with offline and unencrypted-connection badges
  inline.
- **Persistent now-playing bar** docked at the bottom of every screen except the
  Player: cover, title, transport, scrub line with 30-second arrow-key steps, and
  volume. Playback no longer requires navigating back to a player, and the old
  per-screen MiniPlayer is gone.
- The Player screen's panels now use the shared macOS surface instead of the
  legacy glass cards, and its back-link gives way to the sidebar when one is
  showing.
- **Command palette** (`Ctrl+K` / `⌘K`) reaching every screen, every library,
  every settings pane, plus transport actions (play/pause, chapter skip),
  appearance toggle, sidebar toggle and language switch.
- Sidebar collapses to an icon rail automatically on narrow windows, and can be
  hidden entirely from the titlebar; the compact layout falls back to the
  original top-bar chrome.
- **Library information panel** is now collapsible from the shelf toolbar, and
  defaults to appearing only while a book from that library is playing — the
  shelf no longer reserves 360px for a greeting card when nothing is happening.
  Pin it open to restore the old always-on layout.
- **Reduce motion** switch in Settings → Appearance, applied through a document
  attribute so it also covers machines whose OS reports "no preference".
- New macOS surface system: 12/14 px radii, three-step elevation, hairline
  separators, capsule scrollbars, spring easing, `prefers-reduced-motion`
  respected throughout.

### Internationalisation
- Full **English and Simplified Chinese** interface, with a new
  **Settings → Language & Region** pane: language picker, follow-system toggle,
  date-format preference (auto / ISO / medium / long), and a 24-hour clock switch.
- Changes apply instantly, with no restart; the choice persists per device.
- `Ctrl+F` now focuses the shelf search field (previously `Ctrl+K`, which now
  belongs to the command palette).

### Appearance
- Dark and light palettes retuned to a neutral macOS grey scale instead of the
  previous warm-neutral tones; text is never pure white to avoid halation.
- Eight accent presets (Skald Gold plus the macOS system colours).
- CJK-aware typography: a PingFang / YaHei / Noto Sans stack plus looser tracking
  and line-height for Chinese.

### Packaging
- `pnpm package` builds an arbitrary selection of targets:
  **portable green zip**, **NSIS `.exe`**, **MSI**, **AppImage**, **deb**, **rpm**.
- Non-interactive mode (`--ci`) for release pipelines; unsupported targets fail
  loudly instead of being skipped.
- Linux packages now declare their WebKitGTK / GTK / LibVLC / libsecret
  dependencies.
- New `linux-packages.yml` workflow builds deb/rpm through
  `scripts/build.mjs --ci`, alongside the existing Windows and AppImage jobs.
- See `docs/BUILD.md` and `docs/I18N.md`.

## 1.2.0 (2026-07-11)

The first build since 1.1.0 (the Server Upload release). This one focuses on
the multi-library experience, accessibility, and a large round of under-the-hood
cleanup. Highlights are grouped below by what you'll actually notice.

### Libraries and the combined shelf
- New "All Libraries" shelf that merges your ABS server libraries and local
  on-disk libraries into one browsable view.
- Client-side Series, Authors, Narrators, Collections, and Playlists browse tabs
  now work on the combined shelf, and server-only tabs are correctly hidden for
  local libraries.
- One consistent workflow for importing local libraries from disk.
- A partial load of the combined shelf now shows a clear notice with a retry
  button instead of failing silently.
- Clearer labelling of which library a given item comes from throughout the
  shell, plus an explanation of what the "All Libraries" scope does and doesn't
  cover.
- Local scan progress now reports real counts instead of a fake percentage.
- Local listening stats feed the greeting and stats pane.

### Playback
- Manual chapter browsing is respected, so skipping ahead no longer gets pulled
  back by the auto-follow.
- Added feedback for playback actions that used to happen silently.
- Playback state is preserved across a set of recent regressions.
- Background playback tick and sync failures are now visible rather than dying
  quietly.

### Downloads and activity
- More detail in the download history.
- Retry for failed downloads.
- A disk-capacity check before a download starts, so you're warned before
  running out of space.
- Inline podcast download progress.
- A bounded activity history so the list stays useful and doesn't grow without
  limit.
- Offline library freshness is now shown, so you know how current your offline
  copy is.

### Podcasts
- Per-episode right-click menu (play, finish toggle, add to playlist, delete) on
  both the detail list and the browse feed.
- Episode sorting options.

### Audio
- Save and reuse custom equalizer profiles.

### Accessibility
- Broad keyboard-accessibility improvements across the app.
- The mini player is fully keyboard-accessible.
- Consistent modal focus behavior: focus is trapped and restored for the
  account, podcast, sharing, cover, collection and playlist picker, metadata
  editor, and user-account modals.
- Toast outcomes are announced to assistive technology.
- Accessible TopNav selectors for the library and device pickers.

### Sign-in and settings
- Friendlier authentication error messages.
- The live-sync toggle now reverts if the connection is never actually
  confirmed, instead of showing a false "on" state.
- Your server address is kept after logout so you don't have to retype it.
- Settings navigation search with better icons.
- Custom accent color controls.
- Shelf search and scroll position are kept as you move around.
- Item action menus are available directly on shelf tiles.
- Quick-start and import guidance for new and empty states.
- Unencrypted (HTTP) server connections are now flagged so you know when a
  connection isn't secure.

### Reliability and polish
- Corrupt persistence files are now kept and the reset is surfaced, rather than
  silently discarded.
- Context-menu rows no longer falsely mimic a hover state.
- The library focus column is clamped to the intended 360px card footprint.
- Quieter dev console (less LibVLC and StrictMode shortcut noise).

### Under the hood (nothing you'll see directly)
- Automated test suite, Phase 1: regression coverage for auth-material
  persistence, the HTML sanitizer, log redaction, the shortcut lifecycle,
  downloads and offline-progress persistence, upload path validation, and URL
  redaction, plus podcast-feed, bookHelpers, session-tick, ingest safety, and
  serde response-shape fixtures.
- All console diagnostics moved to the structured logging framework, with a
  check that keeps them there.
- All clippy warnings fixed, with a lint gate to stop them coming back.
- Large module splits for maintainability: commands.rs, api.rs, abs.ts,
  catalog.rs, AccountSection, and LibrariesSection broken into domain modules.
  Pure book, chapter, time, and session-tick helpers were pulled out, the
  live-sync effect cluster moved into a useLiveSync hook, and the Player's
  presentational leaves were peeled off.
- Security review follow-ups: URL-secret redaction, upload boundary hardening,
  and CSP fixes.

## 1.1.0 (2026-07-09)

- Server Upload: parity with the ABS web Upload page. Streamed multipart uploads
  with progress and cancel, for users with the `upload` permission.
