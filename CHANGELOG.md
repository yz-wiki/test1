# Changelog

Notable user-facing changes to ADSplayer. Dates are the build cut dates.

## 2.19.8 (2026-11-09) — shelf polish and a working bookmark delete

- **Bookmark delete actually deletes.** ABS matches a bookmark by its exact position in seconds; the delete request rounded the position to whole seconds, so fractional marks were never found and the trash button looked inert. The exact value is sent first, with an integer-form retry for servers that store rounded seconds, and the row is removed locally before the refetch so a stale `/api/me` snapshot cannot resurrect it. "Rename" is now a pencil icon beside the trash instead of a text label.
- **Continue listening follows the window.** A tall window used to spread one or two history rows across the whole panel with `space-around`, leaving one book floating in a blank slab. A resize observer now measures the rail and renders only the whole rows that fit, so resizing the window reveals or drops the oldest entries; rows keep their natural height.
- **No overlap in the title bar.** The "N in this library" label was the first thing to spill out of the right-hand grid track over the centred search field. It is gone (the view bar still reports the count), the search now gives up width before the tools do, and the narrow-window breakpoints were moved up so filter/sort drop out earlier.
- **"Next chapter" is one row in one box.** The label, chapter name and chevron sat on a two-line stack where a long chapter name collided with the label; they now share a single bordered pill with the chapter name truncated.
- **One card language for groups.** The chevron that occupied its own row under every series / author / narrator tile is gone, as is the one in compact book cards — the whole tile is the click target. A late unscoped `.groups` rule was overriding the compact and list grid columns, shrinking group cards to 148px chips with three-character titles; grid, compact and list are now scoped independently, and compact group cards match the book card's 300px column floor, 56px cover and padding.

## 2.19.7 (2026-11-09) — startup resilience, centred chrome, one download path

- **Startup no longer waits for the server.** The boot screen used to stay up while `getMe` and `fetchLibraries` each waited on a 30 s read timeout, and a dead endpoint retried `/auth/refresh` on every command (the log shows 429 storms). The window now renders from the stored session immediately and reconciles in the background, with a 4 s hard cap on the splash and a dismissible offline banner. A retryable refresh failure sets a 60 s cooldown so one wedged endpoint cannot stall every later request.
- **Centred chrome.** The title bar is a `1fr auto 1fr` grid: brand + library switcher left, search field on the window centre line, shelf tools + account + window buttons right. The manual refresh button is gone — `item_added / item_updated / item_removed` socket events now refresh the shelf with a 250 ms debounce. Layout-switch icons are centred in equal cells. The category pills are centred on every shelf, not just the dashboard, and the redundant left-hand "书籍" heading is gone.
- **One card language.** Series / author / narrator cards on the dashboard now use the same cover-forward tile geometry as books; hover cards stay inside the listening panel instead of spilling over the adjacent grid. The continue-listening panel stretches to the page height and spreads its rows, so a tall window no longer leaves a blank slab under the last book.
- **Transport geometry.** The bar is a three-track grid: book label hard left, chapter facts centred in the remaining left track, volume centred between the play cluster and the right-hand tools. Both outer tracks are proportional, so folding the sidebar recomputes the midpoints automatically. The play capsule gained a hairline, inner shadow and a surface ring around the primary button.
- **Book detail.** The description is always shown in a fixed-height box (scrolls without a visible slider), so the chapter toolbar starts at the same y for every book. The file-info rail now adds series, genres, total size, formats, added date and download state. The per-chapter "save this audio file" button is removed — one book, one download path.
- **One download path.** "Download" and "Download to…" are merged. Every entry point asks the same question in an app modal showing the current folder, with "download here" or "choose another folder…" (native picker only on demand). The dialog states that choosing another folder changes the default and migrates existing downloads. The Downloads page gained total size, transferred/total bytes, cancel, and "open folder".
- **Bookmark management.** Bookmarks in the player card are all listed (not just the last four) and support jump, inline rename and delete through the ABS `PATCH / DELETE /api/me/item/{id}/bookmark` routes. "Next chapter" now shows the destination chapter's name.
- **Server notice.** When the ABS endpoint is unreachable the shell still opens; a dismissible banner shows the error and offers a retry.

## 2.19.6 (2026-11-08) — chrome-level shelf tools, one search story, fluid history

- **Shelf tools moved into the window chrome.** Filter / sort / layout / refresh and the library count now share the title bar with the global search field instead of owning a second row below it. Filter and sort became window-level state, so a route change no longer resets them or lets two pages rank the same query differently.
- **Transport edges.** The cover/title button is the first object on the left and 1.5x wider than the old shrink-to-fit chip; the speed / sleep / expand group is pinned to the right edge. Two equal outer flex tracks keep the play cluster on the window centre line.
- **One search story.** The dashboard and the library shelves use the same ranked result set and the same clickable series / author / narrator facets, which open their books in place. Matching reads `series[]` as well as the legacy `seriesName`, weighs literal prefixes above pinyin hits, and breaks score ties in favour of books already in progress. Empty facet rows are omitted.
- **Fluid continue-listening.** Width and height media queries switch the history panel between a sticky column, a hero + queue row and a compact single column; short windows drop the oldest rows instead of growing a nested scrollbar. During a search on a narrow window the queue collapses so results stay above the fold. Narrow shelves can no longer overflow their grid track.

## 2.19.5 (2026-11-08) — dashboard layout and selection geometry

- **Category switch moved to the shelf.** `书籍 / 系列 / 作者 / 播讲` now sits
  centred above the right-hand display area instead of in the top toolbar;
  filter / sort / layout / refresh keep the top row with a library count on the
  left. The heading / breadcrumb and `查看全部` flank the switch in a three-track
  grid that wraps to two rows on narrow windows.
- **Search stays on the dashboard.** Typing in the global field no longer
  switches `libraryView` to `books`; the home shelf becomes the result list in
  place while the continue-listening rail remains visible. Results use the same
  ranked/pinyin matching and the same tile shape.
- **No nested sliders on the dashboard.** The history panel and shelf no longer
  own scroll containers; the page is the single scroll surface, the rail is
  sticky, and scrollbars are hidden. History rows render at natural height.
- **One box for every selectable row.** `.queue__row` was shrink-to-fit, so its
  hover / selected / focus rings were drawn around boxes of different widths.
  All rows now use `width: 100%`, a 1px transparent border, a shared min-height
  and a 1px focus outline matching the selected inset ring.
- **Chapter picker follows its trigger.** The popover is centred on the chapter
  chip (viewport-clamped, recomputed on resize) instead of the window axis.
- **Book button sits next to the transport.** The cover/title button moved to
  the right end of the facts rail, leaving chapter facts on the left.
- **Player info cards restyled.** Ruled headers with a haloed dot, tabular
  numbers, slimmer progress tracks, aligned footer actions / spec sheet / add
  row, and a dashed empty state for bookmarks; the add button no longer crowds
  the card edge.

## 2.19.4 (2026-11-08) — one navigation stack, one shelf row

- **Back is a first-class control.** The rail's top slot is now "go back one
  level"; the fold toggle moved to the foot of the rail as a three-line menu.
  Esc is an editable `Go back` shortcut that unwinds popovers, the expanded
  player, an open group, a detail route, a search and finally the dashboard.
  Popovers claim Esc with `preventDefault`, so closing one no longer also
  navigates away.
- **Groups open in place.** Clicking a series, author or narrator card on the
  home dashboard now lists that group's books on the same screen with a
  breadcrumb, instead of switching views. The drill-down state is global so
  the rail button and Esc can both close it.
- **One shelf row.** The library switcher moved next to the ADSplayer brand in
  the title bar. Category tabs (books / series / authors / narrators) now share
  a single row with filter, sort, layout and refresh; the duplicate view
  switcher inside the shelf is gone.
- **Bigger book rows and cards.** History covers grew from 32px to 44px and
  compact card covers from 44px to 56px, with wider card padding and a larger
  card grid minimum.
- **Centred transport.** The bottom bar's facts, transport and quick controls
  now form one centred flex group instead of three grid columns pinned to the
  window edges. The chapter sheet is fixed to the window centre line, so it
  cannot be clipped by the bar.
- **Chapter tools.** A nowrap count and a right-aligned labelled "jump to
  current" pill replace the three-column grid that wrapped `共 1030 章` into
  three stacked glyphs.
- **Device sheet.** Full-width rows with an icon well, current-output header
  and a trailing check column; the native tooltip that duplicated the header
  is gone.

## 2.19.3 (2026-11-08) — layout corrections and log readability

- **Fixed a runaway render loop.** The library switcher's `$effect` spread the
  very `popPos` state it was writing, so Svelte re-ran it forever and the log
  viewer filled with `effect_update_depth_exceeded` errors. Identical log lines
  in the same burst now collapse into one row with a `×N` counter.
- **Logs highlight characters, not rows.** Removed the full-row WARN/ERROR
  wash. Status words, durations, URLs, error words and the exact text-filter
  match are coloured individually; content type tints the source word.
- **Search is window-level.** The field now lives in the title bar, so it never
  disappears on a book, settings or player route; Ctrl+F focuses it anywhere.
  Chapter filters in the player and book detail no longer vanish below 60
  chapters.
- **Cards are horizontal again.** Compact book and group cards had inherited
  `flex-direction: column` from their grid shapes, stacking a centred cover
  above centred text. They are now cover-left / facts-right: title, series,
  author, progress % and current chapter.
- **Series group properly.** Trailing volume markers (`盗墓笔记 #1` … `#8`)
  are stripped for grouping, so eight volumes read as one series of eight.
  Group cards show author, total duration, a count badge and a listened bar.
  The view switch sits on the centre line with no right-hand hint.
- **Book detail.** The window scrollbar now drives only the right column; the
  cover rail is pinned. Chapter/file switch is centred, the current chapter has
  an accent edge, tinted row and "now at" badge.
- **Now playing bar.** Chapter picker opens to the right of its chip and is no
  longer clipped by the left rail; the control row is capped and centred;
  transport icons share one pill with circular step buttons.
- **Expanded player.** Information cards moved above the transport, which now
  sits at the foot of the stage; cards are bordered boxes with a consistent
  eyebrow / value / object / progress / facts hierarchy, on one 760 px axis.

## 2.19.2 (2026-11-07) — instant open, real cards, one selection box

### Opening something no longer looks broken

- The portable package now ships LibVLC's `plugins.dat`. Without it the app
  indexed ~190 plugin DLLs during startup, **before the window existed** — the
  blank window and the "several seconds before anything plays" were the same
  scan. `lib.rs` also moved the scan off the startup path: if the cache is
  missing (source build), the window appears first and the index is built in the
  background; the first play waits for it instead of racing LibVLC's own scan.
- `play_audio` polls for the Playing state in 40 ms steps (1 s ceiling, was
  100 ms × 20 = 2 s), so the transport stops waiting after the sound started.
- Opening a title now shows the player screen and a spinner on the play button
  immediately, instead of switching only after the stream was negotiated. A
  failure collapses back out. Volume and rate commands no longer sit in front of
  `play()`; they fire in parallel with it.

### Library cards

- The compact layout is a card, not a dense row: cover on the left, then title,
  author and a metadata line (series · chapter · duration), with progress and a
  chevron on the right. Home's book shelf uses the same three-line split.
- Cards have a surface, a border, a 10 px gap and a 44 px cover, so the grid
  reads as a collection instead of a spreadsheet. The layout picker now says
  "Cards" instead of "Small cards".

### Player and bar

- Player right wing: sleep | device (icon only) | volume. The device label used
  to print the full Windows device name, which is arbitrary length and pushed
  the slider under the sleep button. The volume group is the only part allowed
  to shrink.
- The bar's right side is split into quick actions (mute + volume + device) and
  commands (speed, sleep, expand); only the quick group shrinks, so nothing can
  overlap at narrow widths.
- Lower panels: `剩 {time}` / `共 {time}` were rendered with the placeholder
  unfilled because those labels were written for inline values. They are now
  plain labels (`Left` / `Total`) beside their own values, and the bookmark
  input can no longer push the Add button out of the card.

### Keyboard

- The shortcut list is editable: click a key to re-record it, `Backspace`
  clears it, `Esc` cancels, `+` adds a second binding, per-row and global
  "restore defaults" are available, and a chord already in use reports which
  action owns it.
- New actions: volume ±5 %, mute, speed up/down, previous/next chapter. The
  global listener reads the same `ACTIONS` table the settings screen renders,
  so a rebind cannot drift from behaviour.

### Logs

- Content type is now a second highlight axis beside severity: network, sync,
  media and interface rows get their own tint and a 2 px left edge. A failure
  logged at DEBUG/INFO (timeout, refused, unauthorized) is painted as a failure
  instead of hiding in the column.
- Content chips filter the stream by type, including a "Failures" view.

### Popovers

- `Dropdown` and the library switcher are `position: fixed` with viewport
  clamping. Both sat inside scrolling containers (`settings__body`, the rail),
  which clipped their menus — the language list was cut in half.

### Selection

- `.hl` now uses one ring for both "playing" and "selected". The old current
  state drew a 3 px bar on the left edge while selected drew a 1 px inset ring,
  so the same row changed size with its state.

## 2.19.1 (2026-11-06) — one name everywhere, a much smaller runtime

### Every user-visible name is ADSplayer

2.19.0 changed the display name but left the old name in the running app and
in the portable package. This pass finishes the rename:

- `tauri.conf.json` gains `mainBinaryName: ADSplayer` and
  `bundle.publisher: ADSplayer`, so the executable and the MSI Manufacturer
  match the installers instead of `skald.exe` / `skald`.
- Window title, tray tooltip, tray "quit" item, ABS `clientName` / `model`,
  podcast + metadata-provider User-Agents, exported OPML title and the log
  export filename all say ADSplayer.
- Portable ZIP, its top-level folder and the bundled exe are now
  `ADSplayer_<version>_portable_win-x64.zip` / `ADSplayer_portable/` /
  `ADSplayer.exe`. CI artifact prefixes are `adsplayer-*`.
- `package-portable.ps1` accepts `ADSplayer.exe` or `skald.exe` from the
  release tree, so both `tauri build` and plain `cargo build` still package.
- Cargo crate version was `1.2.0` while the app shipped as 2.19.x, so ABS
  displayed the wrong `clientVersion` in every session. It now tracks the
  release version.

Deliberately unchanged (stability identifiers): `com.skald.app`, the Cargo
package name, `%LOCALAPPDATA%\Skald\` data roots, `skald.log`, localStorage
keys and IPC event names. Changing any of those would discard the sign-in
state, downloads, local catalog and saved settings on upgrade.

### Package size

An audit of the 2.19.0 portable build showed the playback chain is only about
86 MiB unpacked; two metadata helpers owned 63.7% of the package:

| 2.19.0 unpacked | MiB | share |
|---|---:|---:|
| `ffprobe.exe` (local-library probe + chapters) | 100.35 | 42.4% |
| `tone.exe` (Embed Metadata writes) | 50.39 | 21.3% |
| VLC `plugins/` | 66.57 | 28.1% |
| exe + libvlc | 19.36 | 8.2% |

- **UPX on `ffprobe.exe` only.** A real pilot of UPX 5.3.0
  (`--force --best --lzma`) shrank it 100.35 → 26.64 MiB and it still starts
  normally. `--force` is required because the FFmpeg build is compiled with
  Control Flow Guard; packing clears that mitigation. `tone.exe` is a .NET
  single-file bundle and UPX corrupts its bundle header, so it is left alone.
  Any UPX failure restores the untouched binary instead of failing the build.
- **Second VLC plugin trim.** Drops the remaining non-audio inputs/renderers
  (SRT, libass, DCP, Blu-ray + its two jars, VBI, SID, GME, spatial audio,
  DirectShow, DTV, SFTP, CDDA) — about 19 MiB. HTTPS, plain HTTP, local files
  and all audio decoders stay; the eight-module guard is unchanged.
- **New `core` portable build.** `package-portable.ps1 -Core` omits
  `ffprobe.exe` and `tone.exe` entirely for users who only stream from an ABS
  server. It is roughly 60 MiB smaller unpacked and 46 MiB smaller as a ZIP.
  The app already degrades gracefully when those helpers are absent; local
  library chapter reading and "Embed Metadata" write-back are unavailable in
  that build. The full portable ZIP remains the default delivery.

Measured compression behaviour worth remembering: UPX helps the unpacked size
enormously (73.7 MiB) and the Deflate ZIP moderately (10.3 MiB), but the
already-compact LZMA installers barely move (0.4 MiB) because packed data is
high-entropy. Removing files, not packing them, is what shrinks installers.

Known trade-offs: UPX-packed executables can trigger heuristic antivirus
warnings, and the packed `ffprobe` no longer carries CFG. Neither affects
playback, and both are bypassed by using the `core` build.

## 2.19.0 (2026-11-05) — density, one highlight language, one device state

Still the 2.14 shape. This pass fixes three balance problems (empty left /
crowded right in the bar, an empty lower half on the player, and a different
"highlight" on every page) rather than redesigning any screen.

### Bar and sliders

- **Bar density.** Chapter count and whole-book percent are facts about what
  is playing; they moved into the left track next to the cover. The right
  track now holds controls only. Both tracks read evenly at 1280–1920 px.
- **Playhead.** The small seek bar's thumb used to be `scale(0)` until hover.
  It is always visible now: 14 px (18 px on the player), white ring, accent
  core and a soft halo; the played fill glows and a percentage bubble follows
  a drag. Progress is readable without a second glance.
- **Volume.** Reference was the iOS/Liquid-Glass volume panel (one large
  thumb, quick actions beside it) rather than Apple Music's hairline. Track
  3 → 6 px, thumb 11 → 16 px with halo, bar 84 → 132 px, player 88 → 128 px,
  and the percentage is always shown. Mute and output-device switching sit
  next to it. EQ / cover-size sliders keep their thin geometry.

### Quick output-device switching

- `audioDevice.svelte.ts` is the single state (device list + chosen id,
  persisted as `skald.audioDevice`). The bottom bar, the expanded player and
  Settings all write it, so they can never disagree. `set_audio_device` is a
  no-op before LibVLC exists; `refresh()` reapplies the saved choice.
- ABS has no client-output concept, so this is intentionally per install.

### Player and book detail

- The empty lower half of the player is now three surface-toned panels:
  this chapter (progress + next chapter), whole book (elapsed / left / total /
  chapter count) and recent bookmarks with an inline add field. Panels grow
  with the available height instead of pinning everything to the top.
- Book detail: file metadata is now a titled, right-aligned spec sheet pinned
  to the bottom of the side rail (`margin-top: auto`, viewport-relative
  height); the last odd action button spans the row instead of dangling.

### Logs

- The server page has its own **Server logs** tab. `LogsPanel` accepts a
  `scope` so the embedded copy hides its own tab bar and stays on that stream.
- Severity is now a whole-row property: DEBUG a hairline edge, INFO an accent
  edge, WARN/ERROR a tinted row with their own edge, and INFO/WARN/ERROR
  badges are filled. Source type gained a `network` colour.

### Layout and highlight system

- A shared `.hl` layer defines hover (neutral), current (accent edge) and
  selected (accent outline). Queue rows, list rows, chapter rows, log rows and
  popover items all use it; the open hover card marks its row `selected`, so
  "hovered" and "being inspected" are visibly different.
- **Third layout: small cards.** The compact square card used by author /
  series shelves is now available for books, on the home shelf and in the
  library. One data set, one sort/filter, three densities — no third tree.
  Also selectable under Settings → Playback as the default layout.
- Hover cards measure their real height and clamp to the viewport instead of
  assuming 240 px.

### Brand

- Display name is **ADSplayer** everywhere (titlebar, boot screen, window and
  HTML title, About, README, docs, build output). `productName` is ASCII
  `ADSplayer`, so installer names are `ADSplayer_2.19.0_…`. The existing mark
  (an open page folding into a sound wave) is kept — it carries no text.
- `com.skald.app`, `skald.exe`, the portable ZIP prefix, localStorage keys,
  IPC events and log filenames are unchanged so upgrades keep sign-in state
  and settings.

## 2.18.0 (2026-11-05) — one shape per concept, one identity

The 2.14 layout remains the base. This pass is about removing duality: two
layout trees that disagreed, two tooltip systems, two names for one deletion,
and a brand whose mark no longer matched its name.

### Fixed

- **Home grid/list switch did nothing.** The home shelf had its own hard-coded
  grid and never read `ui.libraryLayout`. It now uses the same state as the
  library page, in one DOM tree with a modifier class. The books tab shows
  **every book** (it was capped at 12) and honours filter/sort, so switching
  layout no longer resets the order.
- **Long bar grid vs long tag.** The full-width rows with a share bar and the
  three-column compact cards are the *same grouped data* in list / grid mode.
  No third component was added; the group cards gained the share bar, interval
  striping and a local-art marker.
- **Dead "Delete" entry.** ABS offers no safe delete-a-book action to a player.
  The only real deletion is the local download, so the entry now appears only
  when a download exists and is always clickable. Renamed to
  `Remove local download` so it cannot be mistaken for a server operation.
- **Fold pin moved when folding.** The pin was at the foot of the icon column
  in the compact tree and at the top in the full tree. It is now one element
  outside the shape switch, same row in both states.
- **Standalone white box on the player.** Speed and sleep sat in a bordered
  card below the transport. The card's border/background/radius are gone; the
  tools moved up into the control row (speed left, sleep + volume right), whose
  three equal tracks keep the play cluster on the window centre line.
- **Server tab decoder error.** `Promise.all` rejected the whole admin screen
  when `/api/tasks` or `/api/backups` had one unexpected field. Each endpoint
  now resolves independently (`allSettled`), `Task.id` / `Backup.path` tolerate
  missing values, and a bad task list degrades to an empty one with a log line.

### Changed / improved

- **Player:** transport widened 560 → 720 px (finer seeking), centred in the
  expanded state; time row and whole-book bar given more space below the track;
  volume joins the right wing instead of floating absolutely. Chapter rows get
  an accent edge, right-aligned tabular indices and a stronger current title.
- **Transport bar:** volume leads the right group, separated by a hairline;
  longer slider, always-visible percentage. The chapter chip carries the
  current chapter title plus its own accent marker, and no longer uses a
  native `title` tooltip.
- **Continue listening:** a self-drawn hover card (cover, author, chapter,
  four-line blurb, progress) replaces the native OS tooltip. It is anchored to
  the row with a 140 ms intent delay rather than following the pointer.
- **Search:** unchanged ranked/pinyin matching, but matching author and series
  names are now clickable group chips above the book results.
- **Artwork:** local overrides for book covers, author portraits and series
  art. ABS has no author id in our item payload and no series-image concept, so
  these are per-install overrides — instant, reversible, never written to the
  server. A hidden file input plus a 512 px WebP downscale is the shortest
  setting path (no new Rust command, works in a portable install).
- **Upload:** a prepared folder tree is split by subfolder into one book per
  folder, with names inferred from the directory; a single-episode mode can
  name a target series or book. ABS `/api/upload` always creates a new item, so
  "attach" means setting its metadata — it cannot merge into an existing item.
- **Logs:** severity is a badge, source type a colour dot, and selecting a line
  reveals the untruncated message with a copy action.
- **i18n:** language is a Dropdown driven by a locale registry; five more
  locales are pre-registered and fall back to English per key, so a partial
  translation is shippable.

### Brand

New name **叙听 / Xuting** and a new mark (an open page folding into a sound
wave), applied to the titlebar, boot screen, window/HTML title, product name,
README, changelog and the full icon set (PNG, ICO, ICNS, mobile trees).
`com.skald.app`, `skald.exe`, localStorage keys, IPC event names, log file
names and artifact file names are deliberately **unchanged** — renaming those
would drop the sign-in state and all saved settings on upgrade, and make the
installer treat this as a different application.

## 2.17.0 (2026-11-05) — back to the 2.14 shape

2.16 redesigned whole screens when only parts of them were wrong. This release
restores the 2.14 layout as the base and keeps only the fixes that were asked
for explicitly.

### Player screen: 2.14's two columns again

Cover and book information sit side by side in one band, the transport sits
below them, and the chapter/bookmark list stays docked on the right. The
centred, single-axis stage with the large empty area and the bottom drawer is
gone.

Only these parts changed on top of 2.14:

- The blurb no longer folds. It owns a fixed share of the viewport (`30vh`)
  and scrolls inside it when the text is longer.
- The chapter range picker is gone. One continuous list, a filter field past
  60 chapters, a jump-to-current button, and `content-visibility: auto` for
  the off-screen rows.
- Speed is a Dropdown instead of a segmented row.
- The time row shows elapsed and chapter length (tabular, 12 px, secondary
  strength) instead of a countdown.

### Transport bar: progress above, controls centred below

2.14's two-row shape is back. A full-width chapter track with elapsed and
length at its ends sits on the first row. The second row is a three-track
grid: book identity on the left, the play cluster on the window's centre line,
tools on the right. The 2.16 information model stays: no remaining-time
counters, the chapter count is the chapter-list button, speed opens upwards.

### Home: the left column stays put

The page no longer scrolls as a whole. The continue-listening card is pinned,
owns the full height of the window, and only scrolls inside itself if the
queue outgrows it, so resizing the window leaves no blank space beneath it.
The shelf on the right scrolls on its own. The 书籍 / 系列 / 作者 / 播讲者
switch now sits on the centre line of that column, with 查看全部 still at the
right edge. Below 1080 px both columns stack and the page scrolls again.

### Build

`stage-windows-runtime.ps1` now retries the small FFmpeg essentials archive
three times before reaching for the GPL mirror. One 503 on the primary URL had
swapped a 100 MB `ffprobe.exe` for a 162 MB one, adding ~27 MB to the portable
zip without any code change. An oversized probe is now called out in the build
log.

## 2.16.0 (2026-11-05) — preview

The transport bar stops saying the same thing four times, and the app grows one
select control instead of borrowing the operating system's.

### Transport bar: three numbers, not four

The row showed `5:48`, `本章剩余 11:11`, `全书 1%` and `剩 16:59:20` — four
answers to "how far in am I", all in different units. It now reads as three
questions:

1. **What is playing** — cover, title, chapter or episode name.
2. **Where am I** — transport, then `5:48 ────── 17:00` on the chapter scale,
   then `第 2 / 62 章` and `全书 1%`. No countdown anywhere.
3. **What can I change** — volume, speed, sleep, expand.

The chapter count is now the chapter-list button itself: one control, one
meaning, and the separate list icon is gone. The list handles books with over a
thousand chapters by scrolling (off-screen rows are skipped by the engine) and
by offering a filter box once there are more than 60.

Times went from 10.5 px at 42% opacity to 12 px at 66%, tabular, so the elapsed
time and the chapter length are actually readable.

### One select, drawn by us

Every `<select>` in the app opened the OS menu — grey hover bar, square
corners, system font. Speed, chapter ranges, filters, sort, theme base, audio
device, log level, EQ preset and the upload form now share a single popover
component with the app's own tokens and keyboard handling. The chapter-range
picker is gone entirely: both the book page and the player show one continuous
chapter list with a search field.

### Home keeps the two-column shape

Left: continue-listening card plus the rest of the queue. Right: 书籍 / 系列 /
作者 / 播讲者, with what you picked listed underneath. The switch changes
content in place; the rail remains the only way to leave the page.

### Smaller fixes

- The author/series/narrator views now switch between a card grid and a row
  list for real — one DOM tree with a modifier class, not two branches that
  looked alike. List rows add a share bar showing how large each group is.
- The rail's statistics block was a bordered card reading like a stray
  tooltip; it is now `已听 1 / 41` with a completion bar.
- Book page: a 收藏 toggle (kept locally — Audiobookshelf has no favourite
  field), and one stats row under the progress bar with 已听 / 剩余 / 进度.
- The view switch sits on the title row instead of stretching a four-item pill
  across the page.

## 2.15.0 (2026-11-05) — preview

Home stops being a second copy of the library, the player gets one vertical
axis, and the sidebar can be folded on purpose. The build also stops shipping
symbols and VLC's video stack.

### Home is a shelf, not a browse pane

The header title and the "书库共 41 本" line are gone — the rail already says
where you are and how many books there are. The `书籍 / 系列 / 作者 / 播讲者`
segmented control is gone from the home page entirely: those four views are a
filter *inside* the library, so they now live only in the library page's own
toolbar. Home reads top to bottom:

1. **Continue listening** — one wide card with the chapter position, both time
   scales, and the two actions.
2. **Recently added** — reverse-chronological, one card per book, `author ·
   3 天前`. The previous version collapsed by `seriesName` and produced twelve
   cards all labelled "共 1 卷", because Audiobookshelf leaves that field empty
   or per-volume.
3. **Series in progress** — only appears when `seriesName` (or the newer
   `series[]` array) really groups more than one volume.

Card size is fixed at the standard stop; the four-step density picker and its
`标准 · 5 列` readout are gone.

### The rail folds on purpose, and cleanly

- The duplicate `首页` entry is gone: `浏览` holds 首页 / 继续收听 / 正在播放,
  the library section holds the libraries, `系统` holds server / downloads /
  settings. Nothing is listed twice.
- Folding is a three-state switch (`auto` / `open` / `closed`) remembered in
  `localStorage`. `auto` folds below 1040 px.
- The folded rail is a **separate tree**, not the wide tree with hidden labels.
  Animating `width` on one tree was what produced the half-folded ghosting at
  the left edge of the screenshots.

### Player: one axis, one drawer

- Cover, title, chapter, progress, transport and tools stack on a single
  centred axis. The description is no longer a permanent right-hand panel; it
  opens under the tools when asked.
- The chapter rail is closed by default. A single line at the foot of the page
  says `第 3 / 1274 章 · 0002-李火旺` and offers 章节 / 书签; opening it slides
  the rail in (overlay below 980 px).
- The whole-book scale is a 2 px read-only line with `全书 0.2%` on the left and
  `剩 189 小时` on the right, instead of a second full transport.

### Transport bar

Three bands: title and chapter on the left, transport plus the chapter track in
the middle with `10:49` and `本章剩余 3:17` at its ends, and on the right two
fact lines (`第 3 / 1274 章`, `全书 0.2% · 剩 189 小时`) beside volume, speed,
sleep, queue and expand. The track used to sit above the row, disconnected from
everything, and the only time information was a single run-on string.

### Smaller build, faster CI

- `crate-type` is `["rlib"]` — `staticlib`/`cdylib` are mobile-only and each
  costs a full extra link pass on Windows.
- Added a `[profile.release]`: `lto = "thin"`, `strip = "symbols"`,
  `panic = "abort"`. There was no profile block before, so releases shipped
  unstripped.
- Trimmed dependency features: `tokio` no longer uses `full`, `symphonia` keeps
  only the containers audiobooks use, `image` only jpeg/png/webp.
- CI removes VLC's video output/filter/visualization/subtitle plugins before
  packaging, and caches compiled Rust dependencies with `rust-cache`.

## 2.14.0 (2026-11-05) — preview

The player screen, the transport bar and the home page now share one model of
progress and one idea of where a click lands. Front end only — no Rust change.

### Playback starts where you are

`player.open()` hard-coded `expanded = true`, so every way of starting a title
— the continue card, a chapter row, "开始收听" on the detail page — pushed the
full player screen. `open()` now takes `present`, and browse surfaces pass
false: playback starts, the page stays, and the bar is the receipt (it flashes
green for 1.4 s and reads 已开始播放). The full player is reached from the bar,
its expand arrow, or the 正在播放 rail entry. Entering **book** detail pages is
unchanged.

### One progress, three scales

- **Transport bar**: the draggable track is the chapter. It was the whole book,
  with every chapter boundary drawn on it — 1771 ticks of noise on a long title.
- **Player**: the 2px whole-book line is read-only and carries bookmark
  diamonds. `chapterMarks` is gone.
- **Lists and cards**: percentage only.

### Player screen

- The description moved beside the cover — three lines, expandable — and the
  详情 tab is gone. The side rail is chapters and bookmarks only.
- Bookmarks appear in three places with one shape: a flag on the chapter row, a
  diamond on the book line, and "note · time · chapter" in the tab.
- Podcasts list their episodes in the player again; removing the detail tab
  would otherwise have left them with an empty chapter panel.

### Home

- The four category cards are replaced by one segmented row that switches the
  content in place instead of navigating away.
- Recently added is sorted by `addedAt`, newest first, collapsed to one card per
  series with "共 N 卷 · 3 天前". It was an unsorted `items.slice(0, 10)`.
- Cover size is four stops (紧凑 / 标准 / 宽松 / 大图) with a "标准 · 5 列"
  readout; Ctrl+wheel steps through the same stops.
- The sidebar's manual collapse toggle is gone; it folds to an icon rail below
  1040px on its own.

## 2.13.0 (2026-11-05) — preview

A ground-up rebuild of the front end. The Rust core (playback, downloads, sync,
offline cache — 21k lines, 205 commands) is unchanged; everything above it is new.

### Fixed — the persistent "no chapters after continue" problem

`playItem()` passed the **library list item** to the player. ABS list items
omit `media.chapters` and `media.audioFiles`, so `chapterSpans()` returned an
empty array and the player showed "no chapter markers" for the whole session.
The book detail screen worked because it uses `fetchItem`. Now `playItem()`
prefers the full item from the reading cache, otherwise fetches it in the
background and swaps it into the running player via `refreshItem()` — no
restart, no lost position. The chapter list shows a loading state meanwhile.
Also: clicking "continue" on a title that was already playing no longer pauses
it; the early-return branch only resumes when paused.

### Layout and controls

- **Home is two columns**: the left ~30% is a continue panel (featured book
  plus the in-progress queue), the right holds category cards and recent books.
  It stacks to one column below 900px.
- **Toolbar no longer overlaps**: the old 3-column grid squeezed the right-hand
  selects into a single letter over the search box. It is flex now; the right
  group never shrinks and the least important controls drop out on narrow
  windows. The "188px" readout is replaced by a hairline slider.
- **All selects** share one crisp chevron, hover and focus treatment; volume
  and size sliders use a 3px track with a filled portion (equaliser sliders
  are untouched).
- **List layout now applies to grouped views** (series / authors / narrators),
  and rows carry a third line with series and narrator plus a status pill.
- **Bottom bar shows chapter progress**, chapter ordinal / total and the
  whole-book percentage instead of a bare total-time pair.
- Player speed and sleep timer are one unified tools strip.
- Book screen: the back row is sticky above the content; chapter tabs and the
  range picker share a single sticky row instead of two overlapping ones.

### Downloads and uploads: keep the system picker

A self-rendered file browser was evaluated and declined (see the analysis in
the release note). Downloads no longer open a folder dialog on every click:
the configured directory is used directly, with an explicit "Download to…"
entry and Settings > Storage for changing it. Uploads keep the native picker.

### Fixed — clicking play did not open the player (2.12.0)

`player.open()` returns early when the clicked title is already the one in the
bottom bar (`isCurrent → toggle()`), and the successful-start path that sets
`expanded = true` was below that return. So clicking "Continue" on the book
that was already playing only toggled it in the background. The early return
now opens the player too, and every play affordance (book, shelf, continue
page, podcast, context menu) goes through one `playItem()` helper.

### Home is a dashboard, not a grid

- A hero card for the book you are on: cover, chapter ordinal and name,
  progress bar, listened/total, and resume / details / view-all actions.
- The rest of the in-progress queue below it, then **browse-by category cards**
  (books, series, authors, narrators) with live counts, then recently added.
- The full grid belongs to the Books view now. The view switcher gained icons
  and works from both the home header and every other view.

### Library switcher and list

- The library name is no longer a pointer-positioned context menu that drifted
  over the shelf in a narrow window. It is an anchored popover, clamped to the
  viewport, with an icon, media type and a check on the active library.
- List rows now have zebra surfaces, hover borders and a status pill
  (in progress / finished); the plain white rows were unreadable as a list.

### Settings

- The content column is centred and wider instead of hugging the left edge
  with a large empty right side.
- The Display pane has a **live theme preview** built from the current tokens,
  so switching or customising a theme shows its effect immediately.
- The Account pane gained **Switch user** (same server, prefilled) and
  **Switch server** (blank host) alongside sign out.

### Build (2.11.0)

- The Windows build's ffprobe download now falls back to a GitHub-hosted
  FFmpeg build when gyan.dev answers 503 (it did for the first 2.11.0 run).

### Continue listening is a real screen now

The shelf could never say which chapter a book was on: `chapterSpans()` needs
`media.chapters` / `audioFiles`, and library list items deliberately omit both.
A lazy detail cache (`reading.svelte.ts`) now fetches full items for only the
handful of ids on screen and resolves a saved time into a chapter. The shelf
shows "Chapter 1 of 50 · name", and there is a **dedicated Continue listening
page** (sidebar entry + "View all" on the shelf) with a resume hero, per-book
chapter, percentage, remaining time and last-listened date.

### Player transport

- **Play/pause and the skip controls moved above the progress bars**; volume
  now sits on that same row at the right, and the tool strip below keeps speed
  and sleep timer.
- The main bar is 8px (10px on hover), has an always-visible thumb and a
  gradient fill. The full-book bar is quieter.
- The full-book legend is no longer the words "Whole book": it shows the
  chapter ordinal, the chapter name and the whole-book percentage.
- Chapter name and ordinal in the time row are now emphasised.

### Library toolbar

- The library name is a **click-to-switch menu** listing every library.
- The right-hand cluster is grouped with separators: status filter
  (all / not finished / finished), sort, grid-list, cover size with a visible
  px value, refresh.

### Fixed — the server screen was gone (2.10.0)

`MeResponse` had no `type` field and bootstrap stored only `{id, username}`, so
`session.user?.type` was always undefined and the conditional that renders the
server entry hid it. Uploads, libraries, users, tasks and backups all became
unreachable. The entry now shows whenever the role is unknown or privileged,
and the merged account pane has a second, explicit shortcut to it.

### Shell and navigation

- The rail is grouped (Browse / Views / Libraries / System), carries a small
  library-and-progress stat card, and no longer produces a horizontal
  scrollbar. Folded state is a 56px icon rail; long library names ellipsise.
- **Home / Books / Series / Authors / Narrators are real navigation.** They live
  in the sidebar and, mirrored, in a centred high-contrast switcher on the
  library page. Selecting one changes the heading, the count and the content.

### Library

- The toolbar is three columns: library name and total on the left, a centred
  search in the middle, sort / grid-list / cover size / refresh on the right.
  Search shows how many titles matched.
- **Grid or list**, and cover size adjustable in 20px steps (112–280px),
  remembered between launches. List rows show the chapter you are on, a
  progress bar, the percentage and the runtime.
- **Search is ranked**: multiple words are AND-ed, title hits outrank author /
  series / narrator hits, prefix and exact matches outrank bare substrings,
  and results are ordered by that score. Pinyin and initials still work.
- Continue cards show the chapter, a progress percentage and open the player.

### Book screen

- "Already listened" is a card showing **the chapter you are on**, its ordinal
  out of the total, the bar and the percentage — not `— / —`.
- Metadata facts are labelled (narrator / publisher / year / language /
  length / chapters / files) instead of a bare stack of values.
- The chapter tab strip and the range picker are sticky while a 1000-chapter
  list scrolls beneath them.

### Player and bottom bar

- **The bottom bar has volume** (mute button, slider, transient percentage),
  playback speed, sleep timer, open-player and the chapter menu.
- The player's speed / volume / sleep controls are one centred tool strip
  instead of three loose clusters.

### Settings, logs and themes

- **Panes merged**: Appearance + Language → Display; Account + Server → Account
  & server. Old saved pane names are migrated on open.
- **New Logs pane**: two live streams (application events and every command
  sent to the server), with level filter, text filter, freeze, auto-scroll,
  clear, copy, export and a shortcut to the on-disk log directory.
- **Porcelain**, a ninth light theme.
- **Custom theme editor**: pick a base theme, edit seven colour tokens visually
  or type raw CSS, preview instantly, reset any time. Custom themes inherit the
  base for every untouched token.

### Shell and navigation (2.9.0)

- **The sidebar folds** to a 58px icon rail (button at its top, remembered
  between launches), so the library gets the width on small screens.
- **The account moved to the title bar** — it is window-level, not
  library-level, and it stopped being a mystery row at the bottom of the rail.
- Downloads sits between Server and Settings, where a tool that produces files
  belongs.

### Library

- **Views are now Home / Books / Series / Authors / Narrators**, under the
  Continue listening shelf rather than buried in the toolbar.
- **Continue listening shows the chapter you are on**, not the total runtime.
  A duration tells you nothing about where you are.

### Book screen

- The secondary actions are a two-up grid instead of a column of full-width
  buttons, so they read as options rather than as four competing primaries.
- **Chapters are paged** — 100 at a time with a range picker and a
  "jump to where I am" button. A 1083-chapter serial used to mount 1083 rows.
- **Any chapter can be saved on its own**: the button downloads that chapter's
  audio file to the downloads folder. Whole-book download is unchanged.

### Player

- The chapter list pages and follows the playhead: open a book at chapter 507
  and the list is already there.

### Server

- **Upload a whole audiobook as a folder**: pick the folder, Skald expands it
  into audio files, fills the title from the folder name, and reports how many
  files it found. Loose files still work.

### Settings

- Each pane now opens with its own title and a line saying what it is for, and
  Appearance is grouped (theme / interface). The account pane shows the role and
  the live connection state instead of two lonely rows.

### Fixed

- **Every screen said "Not authenticated: no token stored".** When the server
  rejected the refresh token, Rust cleared the credential and emitted
  `auth-expired` — which the rebuild never listened for. The UI stayed "signed
  in" with a dead token, so the library, the book page, the server screen and
  every cover silently failed. The shell now listens for that event *and* for
  the same error coming back from any command, and drops to the sign-in screen
  with an explanation. The book page's empty chapter list and missing covers
  were this same failure, not a chapter bug.
- **The book screen is a two-column layout.** Cover, play button and facts on
  the left (sticky), everything you read — series, title, description, chapters,
  files, the metadata editor — on the right. Before, the page was one column
  that pushed the title off the top of the viewport.
- **The progress bar reads better**: 6px and rounded in the player, growing to
  8px on hover, 3px and quiet in the bar, chapter ticks in the canvas colour.
- **Volume moved** next to the sleep timer on the right; speed keeps the left.
- **The upload form** got proper spacing, a dashed file area and a separated
  action row; the server's lists now say when the server returned nothing
  instead of rendering a blank page.

- **The player's bar measures the chapter, not the book.** On a 189-hour title
  the playhead moved a pixel an hour. The large bar is now the current chapter
  (drag = scrub within the chapter, times are chapter-relative), with a thin
  full-book bar underneath that still scrubs across the whole title and marks
  every chapter boundary.
- **The chapter menu numbers its rows.** It listed titles and offsets but no
  ordinal, so "which chapter am I on" needed counting.
- **Empty covers showed a random letter.** The placeholder was the first
  character of the item *id* ("B", "4", "0"); it is now the first character of
  the title, which is at least meaningful.
- **The sidebar said "Unknown".** Restoring a token never fetched the user, so
  the account chip, and the admin entry that depends on the role, were blank.
  The chip is also a button now and opens Settings → Account.
- **The webview's context menu appeared on right-click** (Back, Reload, Save as,
  Print). It is suppressed outside text fields and replaced by a real menu on
  shelf and grid items: play, details, download, remove download, mark
  finished, copy title.
- **Volume showed no value while adjusting** — it now shows the percentage
  for a moment after each change.

### New

- **Series and author views** in the library, next to All. Group cards show how
  many titles each holds; opening one filters the grid, with the group name as
  the way back.
- **Metadata editing** on the book screen: title, subtitle, authors, narrators,
  series and sequence, publisher, year, language, genres, tags, description.
- **Upload** in the server screen: pick a book library and folder, enter title
  and author, choose the audio files, watch the transfer.
- **Another light theme** (Daylight) and higher contrast in Paper. Seven
  themes total.
- Minimise now goes to the tray along with close, so playback survives either.

### Known gap

Windows' media flyout still shows "Unknown app": that card is driven by a
system media session (SMTC), which this build does not create — LibVLC plays
outside it. Adding SMTC also brings hardware media keys and needs a dedicated
Rust pass rather than a UI change.

### Fixed in this build
- **Volume did nothing.** `set_volume` takes 0–100 (LibVLC), the UI sent 0–1,
  so every call failed with `invalid type: floating point, expected i32`.
- **Settings was unreadable.** The page was a scrolling *flex column*, so once
  the cards were taller than the viewport they were shrunk to ~20px slivers and
  clipped. Children of a scrolling column no longer shrink — the same latent bug
  was present on the book, podcast, downloads and server screens.
- **Books without chapters showed one 189-hour bar.** When ABS has no chapter
  table, the audio files now stand in as chapters: the grid shows them, the
  transport's prev/next walk them, and the seek bar draws a tick at each
  boundary with a "12 / 189 · chapter name" line under the times.
- **The expand button in the transport is gone.** In its place, a list button
  opens a chapter (or episode) menu for jumping straight to one.

### New in this build
- Six themes — Graphite, Slate, Midnight, Nord, Paper, Sepia — an accent
  swatch override, and a 90–125% interface scale.
- Settings is a two-pane screen again: appearance, language, playback, storage,
  keyboard, account, server, about.
- Downloads ask where to go: the folder picker opens on the download button and
  the choice is remembered. Nothing is ever prefetched; only the item playing is
  streamed.
- Close-to-tray, sign out, Ctrl+F for search, Ctrl+, for settings, and a
  shortcut reference.

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
- **Large libraries scroll smoothly.** Above 240 titles the shelf grid only
  mounts the rows in view (plus two rows of overscan) and reserves the full
  scroll height, so a few thousand covers no longer mean a few thousand DOM
  nodes. Below the threshold nothing changes.
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

### Fixed — the persistent "no chapters after continue" problem

`playItem()` passed the **library list item** to the player. ABS list items
omit `media.chapters` and `media.audioFiles`, so `chapterSpans()` returned an
empty array and the player showed "no chapter markers" for the whole session.
The book detail screen worked because it uses `fetchItem`. Now `playItem()`
prefers the full item from the reading cache, otherwise fetches it in the
background and swaps it into the running player via `refreshItem()` — no
restart, no lost position. The chapter list shows a loading state meanwhile.
Also: clicking "continue" on a title that was already playing no longer pauses
it; the early-return branch only resumes when paused.

### Layout and controls

- **Home is two columns**: the left ~30% is a continue panel (featured book
  plus the in-progress queue), the right holds category cards and recent books.
  It stacks to one column below 900px.
- **Toolbar no longer overlaps**: the old 3-column grid squeezed the right-hand
  selects into a single letter over the search box. It is flex now; the right
  group never shrinks and the least important controls drop out on narrow
  windows. The "188px" readout is replaced by a hairline slider.
- **All selects** share one crisp chevron, hover and focus treatment; volume
  and size sliders use a 3px track with a filled portion (equaliser sliders
  are untouched).
- **List layout now applies to grouped views** (series / authors / narrators),
  and rows carry a third line with series and narrator plus a status pill.
- **Bottom bar shows chapter progress**, chapter ordinal / total and the
  whole-book percentage instead of a bare total-time pair.
- Player speed and sleep timer are one unified tools strip.
- Book screen: the back row is sticky above the content; chapter tabs and the
  range picker share a single sticky row instead of two overlapping ones.

### Downloads and uploads: keep the system picker

A self-rendered file browser was evaluated and declined (see the analysis in
the release note). Downloads no longer open a folder dialog on every click:
the configured directory is used directly, with an explicit "Download to…"
entry and Settings > Storage for changing it. Uploads keep the native picker.

### Fixed — clicking play did not open the player (2.12.0)

`player.open()` returns early when the clicked title is already the one in the
bottom bar (`isCurrent → toggle()`), and the successful-start path that sets
`expanded = true` was below that return. So clicking "Continue" on the book
that was already playing only toggled it in the background. The early return
now opens the player too, and every play affordance (book, shelf, continue
page, podcast, context menu) goes through one `playItem()` helper.

### Home is a dashboard, not a grid

- A hero card for the book you are on: cover, chapter ordinal and name,
  progress bar, listened/total, and resume / details / view-all actions.
- The rest of the in-progress queue below it, then **browse-by category cards**
  (books, series, authors, narrators) with live counts, then recently added.
- The full grid belongs to the Books view now. The view switcher gained icons
  and works from both the home header and every other view.

### Library switcher and list

- The library name is no longer a pointer-positioned context menu that drifted
  over the shelf in a narrow window. It is an anchored popover, clamped to the
  viewport, with an icon, media type and a check on the active library.
- List rows now have zebra surfaces, hover borders and a status pill
  (in progress / finished); the plain white rows were unreadable as a list.

### Settings

- The content column is centred and wider instead of hugging the left edge
  with a large empty right side.
- The Display pane has a **live theme preview** built from the current tokens,
  so switching or customising a theme shows its effect immediately.
- The Account pane gained **Switch user** (same server, prefilled) and
  **Switch server** (blank host) alongside sign out.

### Build (2.11.0)

- The Windows build's ffprobe download now falls back to a GitHub-hosted
  FFmpeg build when gyan.dev answers 503 (it did for the first 2.11.0 run).

### Continue listening is a real screen now

The shelf could never say which chapter a book was on: `chapterSpans()` needs
`media.chapters` / `audioFiles`, and library list items deliberately omit both.
A lazy detail cache (`reading.svelte.ts`) now fetches full items for only the
handful of ids on screen and resolves a saved time into a chapter. The shelf
shows "Chapter 1 of 50 · name", and there is a **dedicated Continue listening
page** (sidebar entry + "View all" on the shelf) with a resume hero, per-book
chapter, percentage, remaining time and last-listened date.

### Player transport

- **Play/pause and the skip controls moved above the progress bars**; volume
  now sits on that same row at the right, and the tool strip below keeps speed
  and sleep timer.
- The main bar is 8px (10px on hover), has an always-visible thumb and a
  gradient fill. The full-book bar is quieter.
- The full-book legend is no longer the words "Whole book": it shows the
  chapter ordinal, the chapter name and the whole-book percentage.
- Chapter name and ordinal in the time row are now emphasised.

### Library toolbar

- The library name is a **click-to-switch menu** listing every library.
- The right-hand cluster is grouped with separators: status filter
  (all / not finished / finished), sort, grid-list, cover size with a visible
  px value, refresh.

### Fixed — the server screen was gone (2.10.0)

`MeResponse` had no `type` field and bootstrap stored only `{id, username}`, so
`session.user?.type` was always undefined and the conditional that renders the
server entry hid it. Uploads, libraries, users, tasks and backups all became
unreachable. The entry now shows whenever the role is unknown or privileged,
and the merged account pane has a second, explicit shortcut to it.

### Shell and navigation

- The rail is grouped (Browse / Views / Libraries / System), carries a small
  library-and-progress stat card, and no longer produces a horizontal
  scrollbar. Folded state is a 56px icon rail; long library names ellipsise.
- **Home / Books / Series / Authors / Narrators are real navigation.** They live
  in the sidebar and, mirrored, in a centred high-contrast switcher on the
  library page. Selecting one changes the heading, the count and the content.

### Library

- The toolbar is three columns: library name and total on the left, a centred
  search in the middle, sort / grid-list / cover size / refresh on the right.
  Search shows how many titles matched.
- **Grid or list**, and cover size adjustable in 20px steps (112–280px),
  remembered between launches. List rows show the chapter you are on, a
  progress bar, the percentage and the runtime.
- **Search is ranked**: multiple words are AND-ed, title hits outrank author /
  series / narrator hits, prefix and exact matches outrank bare substrings,
  and results are ordered by that score. Pinyin and initials still work.
- Continue cards show the chapter, a progress percentage and open the player.

### Book screen

- "Already listened" is a card showing **the chapter you are on**, its ordinal
  out of the total, the bar and the percentage — not `— / —`.
- Metadata facts are labelled (narrator / publisher / year / language /
  length / chapters / files) instead of a bare stack of values.
- The chapter tab strip and the range picker are sticky while a 1000-chapter
  list scrolls beneath them.

### Player and bottom bar

- **The bottom bar has volume** (mute button, slider, transient percentage),
  playback speed, sleep timer, open-player and the chapter menu.
- The player's speed / volume / sleep controls are one centred tool strip
  instead of three loose clusters.

### Settings, logs and themes

- **Panes merged**: Appearance + Language → Display; Account + Server → Account
  & server. Old saved pane names are migrated on open.
- **New Logs pane**: two live streams (application events and every command
  sent to the server), with level filter, text filter, freeze, auto-scroll,
  clear, copy, export and a shortcut to the on-disk log directory.
- **Porcelain**, a ninth light theme.
- **Custom theme editor**: pick a base theme, edit seven colour tokens visually
  or type raw CSS, preview instantly, reset any time. Custom themes inherit the
  base for every untouched token.

### Shell and navigation (2.9.0)

- **The sidebar folds** to a 58px icon rail (button at its top, remembered
  between launches), so the library gets the width on small screens.
- **The account moved to the title bar** — it is window-level, not
  library-level, and it stopped being a mystery row at the bottom of the rail.
- Downloads sits between Server and Settings, where a tool that produces files
  belongs.

### Library

- **Views are now Home / Books / Series / Authors / Narrators**, under the
  Continue listening shelf rather than buried in the toolbar.
- **Continue listening shows the chapter you are on**, not the total runtime.
  A duration tells you nothing about where you are.

### Book screen

- The secondary actions are a two-up grid instead of a column of full-width
  buttons, so they read as options rather than as four competing primaries.
- **Chapters are paged** — 100 at a time with a range picker and a
  "jump to where I am" button. A 1083-chapter serial used to mount 1083 rows.
- **Any chapter can be saved on its own**: the button downloads that chapter's
  audio file to the downloads folder. Whole-book download is unchanged.

### Player

- The chapter list pages and follows the playhead: open a book at chapter 507
  and the list is already there.

### Server

- **Upload a whole audiobook as a folder**: pick the folder, Skald expands it
  into audio files, fills the title from the folder name, and reports how many
  files it found. Loose files still work.

### Settings

- Each pane now opens with its own title and a line saying what it is for, and
  Appearance is grouped (theme / interface). The account pane shows the role and
  the live connection state instead of two lonely rows.

### Fixed

- **Every screen said "Not authenticated: no token stored".** When the server
  rejected the refresh token, Rust cleared the credential and emitted
  `auth-expired` — which the rebuild never listened for. The UI stayed "signed
  in" with a dead token, so the library, the book page, the server screen and
  every cover silently failed. The shell now listens for that event *and* for
  the same error coming back from any command, and drops to the sign-in screen
  with an explanation. The book page's empty chapter list and missing covers
  were this same failure, not a chapter bug.
- **The book screen is a two-column layout.** Cover, play button and facts on
  the left (sticky), everything you read — series, title, description, chapters,
  files, the metadata editor — on the right. Before, the page was one column
  that pushed the title off the top of the viewport.
- **The progress bar reads better**: 6px and rounded in the player, growing to
  8px on hover, 3px and quiet in the bar, chapter ticks in the canvas colour.
- **Volume moved** next to the sleep timer on the right; speed keeps the left.
- **The upload form** got proper spacing, a dashed file area and a separated
  action row; the server's lists now say when the server returned nothing
  instead of rendering a blank page.
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
