# Changelog

Notable user-facing changes to Skald. Dates are the build cut dates.

## 2.4.0 (2026-11-04) — preview

A ground-up rebuild of the front end. The Rust core (playback, downloads, sync,
offline cache — 21k lines, 205 commands) is unchanged; everything above it is new.

### Architecture
- **React 19 → Svelte 5 (runes).** No virtual DOM. The bundle went from 971 kB
  of JS to 97 kB, CSS from 48.9 kB to 26.8 kB.
- **One design system, three files.** `tokens.css` (colour/type/spacing/motion),
  `base.css` (reset, text roles, scroll), `components.css` (buttons, inputs,
  segmented, cards, lists). Nothing is styled inline, so there is exactly one
  place a colour can come from.
- **Three small stores instead of one 1,600-line hook** — `session`, `library`,
  `player`. A screen imports what it reads.
- **A single typed IPC boundary** (`lib/ipc.ts`): every Rust command, its
  payload and its error shape live in one file.

### Working in this build
- Sign in with an API key or a password; libraries and titles load and search.
- Click a title to play it. Chapters, a 1.2×–2× speed control, volume, a
  ‑30/+30 second step, previous/next chapter, and a persistent transport bar
  that survives navigation.
- **Podcasts.** A show opens its own screen: cover, description, and the episode
  list with per-episode progress, played/in-progress badges and a resume button
  that picks up whatever is half-listened. Playing an episode keeps the rest of
  the show as a queue, so the transport's previous/next walk episodes.
- **Book detail screen.** A title now opens a page — cover, series, narrator,
  publisher, description with a "more" toggle, the chapter list (click a chapter
  to start there), the underlying files with sizes, and buttons to continue,
  start over or mark finished. Clicking a tile browses; clicking a card in
  Continue listening still plays immediately.
- **Sleep timer** in the player: 15/30/45/60 minutes, or end of chapter. Paused
  time does not count down, and the button shows the time left.
- **Equaliser** in Settings: ten bands from 62 Hz to 16 kHz, the built-in
  audiobook presets, preamp, and a reset. Bands commit on release, not on every
  pixel of the drag.
- **Output device picker**, storage folders with "show in folder", and the
  version/log-folder row in Settings.
- **Downloads.** Download a book from its detail page, watch the transfer in a
  new Downloads screen, remove it again. A downloaded book also plays with no
  network: playback falls back to the local file and queues the listening for
  the server.
- **Bookmarks.** In the player's third panel: add a bookmark at the current
  position with an optional label, and click any bookmark to jump back to it.
- **Server connection panel** in Settings: live socket state with reconnect,
  how many offline listenings are queued and a button to send them now, plus
  whatever other device is currently playing.
- **Keyboard shortcuts**, installed once for the window: Space or K play/pause,
  ←/→ skip 15 s (Shift for 90 s), [ / ] (or P / N) previous/next chapter or
  episode, Esc leaves the player. None of them fire while a field has focus.
- **Pinyin search.** Typing "santi" or "st" finds 《三体》, and the same works
  for author and series names. The dictionary is loaded when a search field is
  focused rather than at startup, so the initial bundle stays small.
- **Server screen** for root/admin accounts: libraries with folder counts and
  last scan plus a one-click scan, the user list with roles and last seen, the
  server's running/finished/failed tasks, and backups with a "back up now"
  button. Hidden entirely for ordinary accounts.
- **Continue listening is real.** The shelf now asks `/api/me` which titles were
  actually started and orders them by when you last listened, instead of showing
  the first six books in the library.
- Position comes from the Rust session's `playback-tick`, not a local timer, so
  the playhead cannot drift from the audio.
- Three themes (Graphite / Paper / Midnight), full English and 简体中文,
  reduced-motion preference.

### Deliberately not ported
Metadata matching and upload dialogs, share links/RSS feeds, cron editing,
server log streaming, and library create/edit forms. These are server
administration tasks that Audiobookshelf's own web UI does better, and half a
dialog is worse than none. Nothing in the menu leads to a dead end.

## 1.6.0 (2026-11-04)

Reported from the 1.5.0 build.

### New
- **System tray.** The window is undecorated, so a minimised one used to vanish
  with no way back. There is now a tray icon: left-click restores, its menu
  offers restore and a real quit. **Minimise hides to the tray by default**;
  Settings → Appearance has a "Minimise to tray" switch to restore a normal
  taskbar minimise.
- **Previous / next episode buttons** in the transport and the now-playing bar.
  On a podcast they walk episodes in that show's own order; on a book they walk
  chapters. (`lib/trackStep.ts`)

### Fixed
- **The seek bar rendered as a 72px purple slab.** `Waveform` used its `height`
  prop for the *bar thickness* while the Player passes 72 for a comfortable
  click target. The component now separates hit area from track: a 4px capsule
  with a 12px playhead, everywhere.
- **The mini-player drew 64 vertical ticks** that read as an audio waveform and
  moiréd when scaled. It uses the same capsule as the full player.
- **The now-playing bar's play button was a black disc** in the light theme
  (it was filled with the text colour). It is accent-filled now.

### Localisation gaps closed
Found by scanning for untranslated JSX, not by guessing:
- Greeting: time-of-day greeting, "Your stats"/"Library stats", the day unit,
  the date line (was hard-coded to `en-US`), and weekday axis labels.
- Player: "Now playing", every detail-pane row label (Publisher, Genre, Year,
  Language, Duration, Tags, Progress, Listened, Remaining, Last played…), the
  section heads, the Saved/Local bookmark tabs, download copy, seek aria-labels
  and the Back/Forward-seconds aria-labels.
- Also: Open Library shelf chips, user-modal access modes, podcast download
  state, listening-session empty state, the plain-HTTP warning, onboarding copy,
  library delete confirmation, About tagline, notification failure note.

Two shadowing bugs of the same shape were fixed on the way: loop variables named
`t` in the greeting toggle and the tag list, which would have made the translate
function uncallable.

Verified: `tsc` clean, 44 files / 350 tests, console gate clean, build passes.

## 1.5.0 (2026-11-04)

Completes the front-end reconstruction. 1.4.0 introduced the design system and
rebuilt the chrome; this release removes every remaining pixel decision from
component code.

### Zero tolerance for ad-hoc values
- **Type**: every `fontSize` in the app is now a `--fs-*` token. Before: 11
  distinct sizes across 700+ declarations. After: 8 steps, 0 raw pixels.
- **Spacing / radius**: every `gap`, `padding`, `margin` and `borderRadius` is a
  token (`--s-*`, `--r-*`). The one exception is the 2px seam in the cover
  mosaic, which is physical rather than rhythmic.
- **Elevation**: six hand-written shadows collapsed into `--shadow-popover` and
  `--shadow-dialog`.
- **Colour**: 91 hard-coded literals from the old warm palette
  (`#ebe7df`, `rgba(235,231,223,…)`, `#0b0b0e`) are gone. Those were the reason
  some panels rendered light-on-light in the Folio/Nord/Sepia themes.
- **Dialogs**: 16 hand-rolled scrims became `.ui-scrim`; every dialog panel now
  shares the same surface, border, radius and shadow.
- **`Glass` is deleted from the component tree** — the last two call sites
  (shelf container, Pick-it-up cards) use `.ui-card`.

### Rebuilt
- Onboarding's left column was a copy of the old editorial poster (gradient
  blobs, grain, serif display type). It is now a brand rail using the same
  surface, hairline and type scale as the sidebar it hands over to.
- Top bar: glass card → toolbar, native search field, shared buttons, shared
  dropdown surface.

### Documentation
- `docs/DESIGN-SYSTEM.md` — the full system: tokens, primitives, migration
  status, the few deliberate exceptions, accessibility contract, and the rules
  for adding a new screen.

Verified: `tsc` clean, 350 tests across 44 files, console gate clean, production
build passes.

## 1.4.0 (2026-11-03)

A ground-up front-end reconstruction. The old design mixed an editorial voice
(serif display type, monospace labels, gold gradients, glass cards) with
macOS-ish chrome, and every screen carried its own pixel decisions. That is now
replaced by one design system, and 25+ surfaces were rebuilt on top of it.

### The system (`src/styles/system.css`, `src/ui/`)
- **One type family.** Interface copy is a single sans stack with CJK fallbacks.
  Monospace is reserved for content where character alignment matters (paths,
  URLs, cron, keys) and serif is gone. Previously 487 inline `fontFamily: MONO`
  and 116 `fontFamily: SERIF` declarations were spread across 48 files.
- **One spacing scale** (4px base, `--s-1`…`--s-12`), **one radius scale**
  (6 / 10 / 14), **one control height set** (26 / 30 / 34).
- **Four surface roles** — canvas, raised, overlay, popover — separated by a
  1px hairline instead of layered glass and nested shadows.
- **One component vocabulary**: button (4 tones × 3 sizes), icon button, field,
  input, select, switch, segmented, card, list, tabs, badge, empty state,
  overlay sheet, popover, progress, keyboard hint, scroll container.
  `src/ui/index.tsx` exposes them as typed React primitives that take semantic
  props only — screens no longer pass arbitrary styles.

### Rebuilt on the system
- **Sidebar** — a plain source list (no glass, no accent-bordered pill rows),
  library switcher as a bordered header control, account pinned at the bottom,
  collapse to a 60px icon rail.
- **Titlebar / now-playing bar** — same hairlines and control heights as the rest
  of the app; the decorative background wash layer is gone, so the window is a
  flat canvas (this also removes the stacking-context hazard that once painted
  every screen black).
- **Settings** — nav rail is now a list, the content column scrolls separately,
  and all thirteen panes inherit the rebuilt `shared.tsx` primitives at once.
- **Player** — panes use the shared card surface, the narrow-window pane switch
  is the shared segmented control, gutters and padding moved onto the scale.
- **Library / Podcast detail** — same padding and gutter tokens as every screen.
- **Login** — rewritten from a two-column editorial poster (serif display type,
  gold gradient CTA, grain overlay) into a single centred card using the same
  inputs, segmented control and primary button as the rest of the app.
  Hard-coded English validation strings are now translated.
- **Confirm dialog** — the app-wide confirmation uses the shared overlay sheet,
  so destructive prompts match every other dialog.

### Accessibility / correctness carried by the rewrite
- Every switch is a real `role="switch"` with `aria-checked`; segmented controls
  use `aria-pressed`; tabs use `role="tab"`/`aria-selected`.
- Numbers that change under the user (timecodes, counts, progress) use tabular
  figures, so nothing jitters as digits update.

## 1.3.2 (2026-11-03)

A localisation-completeness release. No layout or logic changes.

### Whole-app Chinese (Simplified) coverage
The dictionary went from 150 to **1044 keys**, with English and Chinese kept in
lockstep by the parity test (identical key sets, no empty values, no drifted
placeholders). Coverage now includes:

- **All thirteen Settings panes** — playback, account, downloads, notifications,
  server, backups, audio/EQ, sync, sharing & RSS, scheduled tasks, keyboard,
  appearance, logs — plus every option hint and every confirmation.
- **Onboarding**, all seven steps: eyebrows, headers, bodies, buttons, and the
  decorative quote panel.
- **Library surfaces**: shelf tab titles and their count subtitles, filter
  popover, playlist/collection detail and list views, files modal, item context
  menu, cover picker, metadata editor, match dialog, file & track inspector.
- **Podcasts**: browse, detail, subscribe, download and per-show settings.
- **1xx toast messages** — including the ones raised from the state layer, so
  "session expired", "server unreachable" and sync-restored notices are localised
  too, not just the ones fired from components.
- **Error dialogs**: `presentError` resolves all eleven branches through the
  dictionary. Fault *classification* still depends on the raw transport text;
  only the copy shown to the user is translated.

Left in English deliberately: product names (Open Library, Audiobookshelf),
field acronyms (ISBN, ASIN), and example values (`my-book`, `email@example.com`,
`host:port`) — translating those makes the forms harder to read, not easier.

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

### Localisation and playback polish
- **Settings → Appearance is fully localised** (theme, accent, scale,
  translucency, every shelf option and tab toggle), as are the Player pane
  labels and the item context menu.
- **Synopsis stays under the cover** at every window size. It used to move into a
  right-hand tab when the window narrowed, which reflowed the page into a
  different layout at the breakpoint.
- **Five theme presets**: Onyx, Folio, Midnight, Nord and Sepia, each a complete
  surface palette rather than an accent swap.
- **New seek bar**: a rounded capsule with a playhead dot replaces the 140-bar
  waveform, which read as an equaliser and moiréd when scaled.
- **Chapter quick-select** in the now-playing bar: a list button opens a chapter
  list with positions, current chapter highlighted.
- **No more button drift**: accent swatches no longer change border width on
  selection, the seek track no longer grows on hover, and buttons no longer scale
  on press — each of those nudged neighbouring elements by 1–2px.
- Cover fetch failures are now logged once per item instead of being swallowed,
  so "server has no cover" and "request failed" stop looking identical.

### Fixes found by running the 1.3.0 build against a live server
- **The content area rendered as a black pane.** `OnyxWash` is absolutely
  positioned, so it painted *above* the statically-positioned `.mac-body` and
  covered every screen; only the z-indexed chrome (titlebar, sidebar, now-playing
  bar) stayed visible. The body now establishes its own stacking level.
- **Two playback surfaces are one.** The Library's left "in focus" column no
  longer appears while a book is playing — the shell's now-playing bar is the
  single transport, so the cover/title/controls are no longer duplicated. The
  column still shows the greeting when idle, and can be pinned from the toolbar.
- Player: the three panes no longer split evenly (chapters take the slack, details
  and bookmarks are fixed-width), pane padding tightened, and the collapsed
  "Play this book" strip is a compact centred bar instead of a full-width band.
- Search-scope options respond to the press before any focus hand-off.
- **Every log line was written twice.** `tauri-plugin-log`'s builder starts with
  a default `LogDir` target whose file name is the package name (`Skald.log`);
  adding our own `skald.log` target pointed at the same file on Windows'
  case-insensitive filesystem. Targets are now declared explicitly after
  `clear_targets()`.
- **One unavailable global shortcut aborted the whole registration.** Bindings are
  now registered independently and the failures are reported; Settings → Keyboard
  shows which combination another application already owns and lets you remap it
  without reading the log.
- **`https://` against a plain-HTTP server gave a useless error.** The sign-in
  failure now names the scheme mismatch and suggests `http://`, instead of
  telling the user to "check the address" they had just typed correctly.

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
