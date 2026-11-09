<script lang="ts">
  import { createBookmark, deleteBookmark, updateBookmark } from '../lib/ipc';
  import { progress, session } from '../lib/state.svelte';
  import { player, RATES } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import SeekBar from '../components/SeekBar.svelte';
  import ProgressLine from '../components/ProgressLine.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import DevicePicker from '../components/DevicePicker.svelte';

  /** The blurb lives beside the cover and folds; it is not a tab. */
  let tab = $state<'chapters' | 'bookmarks'>('chapters');
  let sleepOpen = $state(false);
  /** Shows the percentage only while the volume slider is in use. */
  let volumeActive = $state(false);
  let volumeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVolume = $state(1);

  function toggleMute(): void {
    if (player.volume > 0) {
      lastVolume = player.volume;
      void player.setVolume(0);
    } else {
      void player.setVolume(lastVolume || 0.8);
    }
  }

  function onVolumeInput(value: number): void {
    void player.setVolume(value);
    volumeActive = true;
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => (volumeActive = false), 1200);
  }
  let markLabel = $state('');
  let markError = $state<string | null>(null);
  /** Bookmark management: the time in seconds is the bookmark's identity. */
  let editingMark = $state<number | null>(null);
  let editingLabel = $state('');

  async function removeMark(mark: { time: number }): Promise<void> {
    if (!item || !session.serverUrl) return;
    markError = null;
    try {
      await deleteBookmark(session.serverUrl, item.id, mark.time);
      // Drop the row locally first: a refetch of /api/me can still return the
      // pre-delete snapshot, which made the trash button look like a no-op.
      progress.removeBookmark(item.id, mark.time);
      void progress.load(session.serverUrl, true);
    } catch (reason) {
      markError = (reason as Error).message;
    }
  }

  async function renameMark(mark: { time: number; title: string }): Promise<void> {
    const title = editingLabel.trim();
    editingMark = null;
    if (!item || !session.serverUrl || !title || title === mark.title) return;
    markError = null;
    try {
      await updateBookmark(session.serverUrl, item.id, mark.time, title);
      progress.renameBookmark(item.id, mark.time, title);
      void progress.load(session.serverUrl, true);
    } catch (reason) {
      markError = (reason as Error).message;
    }
  }

  async function addMark(): Promise<void> {
    if (!item || !session.serverUrl) return;
    markError = null;
    try {
      await createBookmark(
        session.serverUrl,
        item.id,
        player.position,
        markLabel.trim() || formatDuration(player.position),
      );
      markLabel = '';
      await progress.load(session.serverUrl, true);
    } catch (reason) {
      markError = (reason as Error).message;
    }
  }

  const SLEEP_CHOICES = [15, 30, 45, 60] as const;

  const sleepLabel = $derived.by(() => {
    if (player.sleepMode === 'off') return t('sleep.title');
    if (player.sleepMode === 'chapter') return t('sleep.chapter');
    if (player.sleepRemaining > 0) {
      return t('sleep.remaining', { time: formatDuration(player.sleepRemaining) });
    }
    return t('sleep.title');
  });

  const item = $derived(player.item);
  const meta = $derived(item?.media?.metadata);
  const chapters = $derived(player.chapters);
  const marks = $derived(item ? progress.bookmarksFor(item.id) : []);
  const isEpisode = $derived(player.kind === 'episode');
  const shownTab = $derived(isEpisode ? 'chapters' : tab);

  /**
   * Bookmarks belong on the whole-book line, not on the chapter track: their
   * times are book-wide, so drawing them over a chapter-scale rail would place
   * a mark for chapter 12 somewhere in the middle of chapter 37.
   */
  const bookmarkFractions = $derived(
    player.duration > 0 ? marks.map(mark => mark.time / player.duration) : [],
  );

  /** Chapters that hold a bookmark, so the list can flag them in place. */
  const flaggedChapters = $derived.by(() => {
    const set = new Set<number>();
    for (const mark of marks) {
      const index = chapters.findIndex(chapter => mark.time >= chapter.start && mark.time < chapter.end);
      if (index >= 0) set.add(index);
    }
    return set;
  });

  /**
   * A 1 274-chapter book wants one list you can scroll and type into, not a
   * range picker that makes you guess which hundred your chapter lives in.
   * `content-visibility: auto` keeps off-screen rows out of layout.
   */
  let chapterQuery = $state('');
  const shownChapters = $derived.by(() => {
    const query = chapterQuery.trim().toLowerCase();
    return chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(row => !query || row.chapter.title.toLowerCase().includes(query));
  });

  function jumpToCurrent(): void {
    const index = Math.max(player.chapterIndex, 0);
    chapterQuery = '';
    requestAnimationFrame(() => {
      listEl?.querySelector<HTMLElement>(`[data-chapter="${index}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  }

  /** Which chapter a bookmark falls in — the list says "1:12:30 · 第 12 集"
   *  instead of a bare timestamp the listener cannot place. */
  function chapterOfMark(time: number): string {
    return chapters.find(chapter => time >= chapter.start && time < chapter.end)?.title ?? '';
  }

  // Follow the playhead: when a new title opens or the chapter changes, put it
  // in view instead of leaving the list at chapter 1.
  let listEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const index = player.chapterIndex;
    if (!listEl || index < 0 || chapterQuery.trim()) return;
    const row = listEl.querySelector<HTMLElement>(`[data-chapter="${index}"]`);
    row?.scrollIntoView({ block: 'center' });
  });

  /** The transport's main bar measures the current chapter, not the book: a
   *  189-hour title otherwise moves its playhead by one pixel an hour. */
  const chapterLength = $derived(player.chapter ? player.chapter.end - player.chapter.start : 0);
  const chapterPos = $derived(
    player.chapter ? Math.max(player.position - player.chapter.start, 0) : player.position,
  );
  const chapterFraction = $derived(
    chapterLength > 0
      ? Math.min(Math.max(chapterPos / chapterLength, 0), 1)
      : player.progress,
  );

  function seekChapter(fraction: number): void {
    const chapter = player.chapter;
    if (!chapter || chapterLength <= 0) {
      void player.seekFraction(fraction);
      return;
    }
    void player.seek(chapter.start + fraction * chapterLength);
  }

  /** "12 / 189 · 第十二章" — where you are, in chapter terms. */
  const chapterLine = $derived.by(() => {
    if (isEpisode || chapters.length === 0) return '';
    const index = Math.max(player.chapterIndex, 0);
    const name = player.chapter?.title ?? '';
    return `${index + 1} / ${chapters.length}${name ? ` · ${name}` : ''}`;
  });

  /** "12 / 189" for the lower chapter panel — a number, not a sentence. */
  const chapterIndexLabel = $derived(
    chapters.length > 0
      ? `${Math.max(player.chapterIndex, 0) + 1} / ${chapters.length}`
      : '—',
  );

  /** "Next chapter" is far more useful when it says where it goes. */
  const nextChapter = $derived(
    chapters.length > 0 && player.chapterIndex + 1 < chapters.length
      ? chapters[player.chapterIndex + 1]
      : null,
  );

  const description = $derived(
    isEpisode ? (player.episode?.description ?? '') : (meta?.description ?? ''),
  );

  const facts = $derived(
    isEpisode
      ? [
          player.showTitle,
          player.episode?.publishedAt
            ? new Date(player.episode.publishedAt).toLocaleDateString()
            : '',
        ].filter(Boolean)
      : [
          meta?.narratorName ? t('player.narrator', { name: meta.narratorName }) : '',
          meta?.publisher ? `${t('player.publisher')} · ${meta.publisher}` : '',
          meta?.publishedYear ? `${t('player.year')} · ${meta.publishedYear}` : '',
        ].filter(Boolean),
  );
</script>

{#if item}
  <div class="player">
    <header class="player__head">
      <button class="btn btn--quiet btn--sm" onclick={() => player.collapse()}>
        <Icon name="chevron-down" size={14} />
        {t('player.collapse')}
      </button>
      {#if player.error}
        <span class="t-small player__error" role="alert">{player.error}</span>
      {/if}
    </header>

    <div class="player__body">
      <section class="stage">
        <div class="stage__head">
          <div class="stage__cover">
            <Cover itemId={item.id} size={560} radius="var(--radius-lg)" title={player.showTitle} />
          </div>

          <div class="stage__info">
            <h1 class="t-title clamp-2">{player.title}</h1>
            <p class="t-secondary truncate">{isEpisode ? player.showTitle : (meta?.authorName ?? '')}</p>
            {#if facts.length > 0}
              <p class="t-small t-tertiary truncate">{facts.join('  ·  ')}</p>
            {/if}

            {#if description}
              <p class="stage__desc">{description}</p>
            {/if}

            {#if meta?.genres?.length}
              <div class="stage__genres">
                {#each meta.genres as genre (genre)}
                  <span class="chip">{genre}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="transport">
          <SeekBar
            value={chapterFraction}
            size="lg"
            label={t('player.progressOf', {
              done: formatDuration(chapterPos),
              total: formatDuration(chapterLength || player.duration),
            })}
            onSeek={seekChapter}
            disabled={player.duration <= 0}
          />
          <div class="transport__times t-num t-small t-tertiary">
            <span class="transport__t">{formatDuration(chapterPos)}</span>
            {#if chapterLine}
              <span class="transport__chapter truncate">{chapterLine}</span>
            {/if}
            <span class="transport__t">
              {formatDuration(chapterLength || player.duration)}
            </span>
          </div>

          <div class="transport__top">
            <div class="transport__wing">
              <Dropdown
                value={String(player.rate)}
                options={RATES.map(rate => ({ value: String(rate), label: `${rate}×` }))}
                onSelect={next => void player.setRate(Number(next))}
                label={t('player.speed')}
                variant="field"
                width="76px"
              />
            </div>

            <div class="transport__buttons">
              <button
                class="icon-btn"
                aria-label={t('player.prevChapter')}
                title={t('player.prevChapter')}
                onclick={() => void player.step(-1)}
                disabled={!player.canStepBack}
              >
                <Icon name="skip-back" />
              </button>
              <button
                class="icon-btn"
                aria-label={t('player.back30')}
                title={t('player.back30')}
                onclick={() => void player.skip(-30)}
              >
                <span class="t-num t-small">30</span>
              </button>
              <button
                class="transport__play"
                aria-label={player.loading ? t('player.opening') : player.playing ? t('player.pause') : t('player.play')}
                title={player.loading ? t('player.opening') : player.playing ? t('player.pause') : t('player.play')}
                onclick={() => void player.toggle()}
                disabled={player.loading}
              >
                {#if player.loading}
                  <span class="transport__spin" aria-hidden="true"></span>
                {:else}
                  <Icon name={player.playing ? 'pause' : 'play'} size={22} />
                {/if}
              </button>
              <button
                class="icon-btn"
                aria-label={t('player.forward30')}
                title={t('player.forward30')}
                onclick={() => void player.skip(30)}
              >
                <span class="t-num t-small">30</span>
              </button>
              <button
                class="icon-btn"
                aria-label={t('player.nextChapter')}
                title={t('player.nextChapter')}
                onclick={() => void player.step(1)}
                disabled={!player.canStepForward}
              >
                <Icon name="skip-forward" />
              </button>
            </div>

            <div class="transport__wing transport__wing--right">
            <div class="extra extra--sleep">
              <button
                class="btn btn--quiet btn--sm"
                aria-expanded={sleepOpen}
                onclick={() => (sleepOpen = !sleepOpen)}
              >
                <Icon name="clock" size={14} />
                {sleepLabel}
              </button>

              {#if sleepOpen}
                <div class="sleep-menu" role="menu">
                  <button
                    class="sleep-menu__item"
                    aria-pressed={player.sleepMode === 'off'}
                    onclick={() => {
                      player.setSleep('off');
                      sleepOpen = false;
                    }}
                  >{t('sleep.off')}</button>

                  {#each SLEEP_CHOICES as minutes (minutes)}
                    <button
                      class="sleep-menu__item"
                      aria-pressed={player.sleepMode === minutes}
                      onclick={() => {
                        player.setSleep(minutes);
                        sleepOpen = false;
                      }}
                    >{t('sleep.minutes', { count: minutes })}</button>
                  {/each}

                  <button
                    class="sleep-menu__item"
                    aria-pressed={player.sleepMode === 'chapter'}
                    onclick={() => {
                      player.setSleep('chapter');
                      sleepOpen = false;
                    }}
                  >{t('sleep.chapter')}</button>
                </div>
              {/if}
            </div>

            <span class="wing__sep" aria-hidden="true"></span>

            <!-- Icon only: the previous label printed the full Windows device
                 name, which is arbitrary length and pushed the slider under the
                 sleep control. The name is still in the tooltip and the menu. -->
            <DevicePicker placement="down" />

            <div class="transport__volume">
              <button
                class="icon-btn icon-btn--sm"
                aria-label={player.volume > 0 ? t('player.mute') : t('player.unmute')}
                title={player.volume > 0 ? t('player.mute') : t('player.unmute')}
                onclick={toggleMute}
              ><Icon name="volume" size={14} /></button>
              <input
                class="volume"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={player.volume}
                style="--fill: {player.volume * 100}%"

                aria-label={t('player.volume')}
                oninput={event => onVolumeInput(Number(event.currentTarget.value))}
              />
              <span class="volume__value t-num" class:active={volumeActive}>
                {Math.round(player.volume * 100)}%
              </span>
            </div>

            </div>
          </div>

          {#if !isEpisode && chapters.length > 1}
            <div class="book-bar">
              <span class="book-bar__tag t-small t-tertiary">{t('player.wholeBook')}</span>
              <ProgressLine
                value={player.progress}
                label={t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
                marks={bookmarkFractions}
              />
              <span class="book-bar__pct t-small t-num t-secondary">
                {Math.round(player.progress * 100)}%
              </span>
            </div>
          {/if}

        </div>

        <!-- The lower half used to be empty canvas. Three compact panels turn
             it into information the listener actually needs: where this
             chapter ends, how far the whole book has come, and the shortcuts
             back to marked moments. Nothing here duplicates the docked
             chapter list on the right. -->
        <section class="below" aria-label={t('player.belowBook')}>
          <div class="below__card">
            <span class="below__label t-label">{t('player.belowChapter')}</span>
            <span class="below__big t-num">{chapterIndexLabel}</span>
            <span class="below__sub truncate">{player.chapter?.title ?? player.title}</span>
            <div class="below__bar" aria-hidden="true">
              <span style:width="{Math.round(chapterFraction * 100)}%"></span>
            </div>
            <div class="below__pair t-small t-num t-tertiary">
              <span>{formatDuration(chapterPos)}</span>
              <span>{formatDuration(chapterLength || player.duration)}</span>
            </div>
            {#if player.canStepForward}
              <button class="below__next" onclick={() => void player.step(1)} aria-label={t('player.nextChapter')}>
                <span class="below__next-label">{t('player.nextChapterGo')}</span>
                {#if nextChapter}
                  <span class="truncate below__next-title">{nextChapter.title}</span>
                {/if}
                <Icon name="chevron-right" size={12} />
              </button>
            {/if}
          </div>

          <div class="below__card">
            <span class="below__label t-label">{t('player.belowBook')}</span>
            <span class="below__big t-num">{Math.round(player.progress * 100)}%</span>
            <span class="below__sub truncate">{player.showTitle}</span>
            <div class="below__bar" aria-hidden="true">
              <span style:width="{Math.round(player.progress * 100)}%"></span>
            </div>
            <div class="below__facts">
              <div><span class="t-small t-tertiary">{t('player.bookListened')}</span><span class="t-num">{formatDuration(player.position)}</span></div>
              <div><span class="t-small t-tertiary">{t('player.factLeft')}</span><span class="t-num">{formatDuration(Math.max(player.duration - player.position, 0))}</span></div>
              <div><span class="t-small t-tertiary">{t('player.factTotal')}</span><span class="t-num">{formatDuration(player.duration)}</span></div>
              <div><span class="t-small t-tertiary">{t('player.chapters')}</span><span class="t-num">{chapters.length}</span></div>
            </div>
          </div>

          <div class="below__card below__card--marks">
            <span class="below__label t-label">{t('player.belowMarks')}</span>
            {#if marks.length === 0}
              <div class="below__empty-box">
                <p class="below__empty t-small t-tertiary">{t('player.noMarks')}</p>
              </div>
            {:else}
              <div class="below__marks scroll-y">
                {#each [...marks].reverse() as mark (mark.time + mark.title)}
                  <div class="below__mark-row hl">
                    {#if editingMark === mark.time}
                      <input
                        class="input input--sm below__mark-input"
                        bind:value={editingLabel}
                        onkeydown={event => {
                          if (event.key === 'Enter') void renameMark(mark);
                          if (event.key === 'Escape') editingMark = null;
                        }}
                      />
                      <button class="btn btn--sm" onclick={() => void renameMark(mark)}>
                        {t('bookmark.save')}
                      </button>
                    {:else}
                      <button class="below__mark" onclick={() => void player.seek(mark.time)}>
                        <span class="below__mark-dot" aria-hidden="true"></span>
                        <span class="truncate">{mark.title}</span>
                        <span class="t-num t-small t-tertiary">{formatDuration(mark.time)}</span>
                      </button>
                      <button
                        class="icon-btn icon-btn--sm below__mark-icon"
                        title={t('bookmark.rename')}
                        aria-label={t('bookmark.rename')}
                        onclick={() => { editingMark = mark.time; editingLabel = mark.title; }}
                      ><Icon name="pencil" size={12} /></button>
                      <button
                        class="icon-btn icon-btn--sm below__mark-icon"
                        title={t('bookmark.delete')}
                        aria-label={t('bookmark.delete')}
                        onclick={() => void removeMark(mark)}
                      ><Icon name="trash" size={12} /></button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            <div class="below__add">
              <input
                class="input input--sm"
                bind:value={markLabel}
                placeholder={t('bookmark.placeholder')}
                onkeydown={event => { if (event.key === 'Enter') void addMark(); }}
              />
              <button class="btn btn--sm" onclick={() => void addMark()}>{t('bookmark.add')}</button>
            </div>
          </div>
        </section>
      </section>

      <aside class="side">
        {#if !isEpisode}
          <div class="side__tabs">
            <div class="segmented">
              <button
                class="segmented__item"
                aria-pressed={tab === 'chapters'}
                onclick={() => (tab = 'chapters')}
              >{t('player.chapters')}</button>
              <button
                class="segmented__item"
                aria-pressed={tab === 'bookmarks'}
                onclick={() => (tab = 'bookmarks')}
              >{t('player.bookmarks')}{#if marks.length > 0}<span class="segmented__count t-num">{marks.length}</span>{/if}</button>
            </div>
          </div>
        {/if}

        {#if shownTab === 'chapters'}
          {#if isEpisode}
            <div class="chapter-list scroll-y">
              {#each player.queue as entry, index (entry.id)}
                <button
                  class="chapter hl"
                  aria-current={entry.id === player.episode?.id ? 'true' : undefined}
                  onclick={() => void player.open(item!, entry, player.queue, undefined, false)}
                >
                  <span class="chapter__index t-num">{entry.index ?? player.queue.length - index}</span>
                  <span class="chapter__body">
                    <span class="truncate chapter__title">{entry.title}</span>
                    <span class="t-small t-num t-tertiary">{formatDuration(entry.duration ?? 0)}</span>
                  </span>
                  {#if entry.id === player.episode?.id}
                    <span class="chapter__dot" aria-hidden="true"></span>
                  {/if}
                </button>
              {/each}
              {#if player.queue.length === 0}
                <p class="t-small t-tertiary" style="padding: var(--gap-row)">{t('podcast.empty')}</p>
              {/if}
            </div>
          {:else}
          <!-- The filter is unconditional. Hiding it below 60 chapters made the
               search box "disappear" on short books; a one-chapter list simply
               has nothing to filter, which is not a reason to move the field.
               The switch sits on the centre line, with no text hint at the
               right edge. -->
          <!-- A flex row with a nowrap count. The old three-column grid gave
               the count a fraction of a column, so "共 1030 章" wrapped into
               three stacked glyphs. Locate-current now sits at the far right
               as a labelled pill instead of an unexplained icon. -->
          <div class="chapter-tools">
            <span class="chapter-tools__count t-small t-tertiary t-num">
              {t('player.chapterCount', { count: chapters.length })}
            </span>
            <input
              class="input chapter-search"
              bind:value={chapterQuery}
              placeholder={t('player.chapterSearch')}
              spellcheck="false"
            />
            <button
              class="chapter-tools__locate"
              title={t('book.jumpToCurrent')}
              aria-label={t('book.jumpToCurrent')}
              onclick={jumpToCurrent}
            >
              <Icon name="activity" size={13} />
              <span>{t('book.jumpToCurrent')}</span>
            </button>
          </div>

          <div class="chapter-list scroll-y" bind:this={listEl}>
            {#if chapters.length === 0}
              <p class="t-small t-tertiary" style="padding: var(--gap-row)">
                {player.chaptersLoading ? t('player.loadingChapters') : t('player.noChapters')}
              </p>
            {:else}
              {#each shownChapters as row (row.chapter.start)}
                {@const chapter = row.chapter}
                {@const index = row.index}
                <button
                  class="chapter hl"
                  data-chapter={index}
                  aria-current={index === player.chapterIndex ? 'true' : undefined}
                  onclick={() => void player.seek(chapter.start)}
                >
                  <span class="chapter__index t-num">{index + 1}</span>
                  <span class="chapter__body">
                    <span class="truncate chapter__title">{chapter.title}</span>
                    <span class="t-small t-num t-tertiary">
                      {formatDuration(chapter.start)} · {formatDuration(chapter.end - chapter.start)}
                    </span>
                  </span>
                  {#if flaggedChapters.has(index)}
                    <span class="chapter__flag" aria-hidden="true" title={t('player.bookmarks')}></span>
                  {/if}
                  {#if index === player.chapterIndex}
                    <span class="chapter__dot" aria-hidden="true"></span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
          {/if}
        {:else if shownTab === 'bookmarks'}
          <div class="bookmarks">
            <div class="mark-add">
              <input
                class="input"
                bind:value={markLabel}
                placeholder={t('bookmark.placeholder')}
                onkeydown={event => {
                  if (event.key === 'Enter') void addMark();
                }}
              />
              <button class="btn btn--sm" onclick={() => void addMark()}>{t('bookmark.add')}</button>
            </div>
            {#if markError}
              <p class="t-small player__error" role="alert">{markError}</p>
            {/if}
            {#if marks.length === 0}
              <p class="t-small t-tertiary">{t('bookmark.empty')}</p>
            {:else}
              <div class="chapter-list scroll-y">
                {#each marks as mark (mark.time + mark.title)}
                  <button class="chapter hl" onclick={() => void player.seek(mark.time)}>
                    <span class="chapter__flag" aria-hidden="true"></span>
                    <span class="chapter__body">
                      <span class="truncate chapter__title">{mark.title}</span>
                      <span class="t-small t-num t-tertiary">
                        {formatDuration(mark.time)}{#if chapterOfMark(mark.time)} · {chapterOfMark(mark.time)}{/if}
                      </span>
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  .player {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .player__head {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-row) var(--gap-block) 0;
  }

  .player__error {
    color: var(--danger);
  }

  .player__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--gap-section);
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  /* Reading order on screen: cover/blurb → information cards → transport.
     The controls belong at the foot of the stage (like every player), while
     the facts sit directly under what they describe. `order` swaps the two
     bands without duplicating or re-parenting either DOM subtree. */
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap-block);
    min-width: 0;
    overflow-y: auto;
  }

  .stage__head { order: 0; }
  .below { order: 1; }
  .transport { order: 2; }

  /* Cover and blurb share one band: the description is context for the title,
     not a separate document worth a tab of its own. */
  .stage__head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--gap-section);
    width: 100%;
    max-width: 760px;
  }

  .stage__cover {
    width: min(228px, 32vh);
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-3);
  }

  .stage__info {
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
    min-width: 0;
    padding-top: var(--gap-inline);
  }

  /* Fixed share of the viewport, not a fold/unfold button: the blurb always
     occupies the same space, and long text scrolls inside that space. */
  .stage__desc {
    margin-top: var(--gap-inline);
    max-height: 30vh;
    padding-right: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .stage__genres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-tight);
    margin-top: var(--gap-inline);
  }

  @media (max-width: 980px) {
    /* Keep the play cluster centred when the side panel becomes an overlay. */
    .transport__top {
      gap: 4px;
    }
    .transport__volume {
      max-width: 124px;
    }
    .transport__volume .volume {
      width: 72px;
      min-width: 56px;
      max-width: 72px;
    }
    /* The sleep button keeps its icon and drops the word, which is the first
       thing that used to collide with the slider. */
    .extra--sleep .btn {
      padding-inline: 7px;
    }
  }

  @media (max-width: 900px) {
    .stage__head {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      text-align: center;
    }

  }

  /* Expanded player is centred on the window axis; the longer track also makes
     a 17-minute chapter adjustable at a useful granularity. */
  /* `margin-top: auto` used to pin the whole transport to the very bottom of
     the stage, leaving a large dead band between the information cards and
     the controls. A bounded gap keeps it in the lower third but noticeably
     higher, and still leaves a little breathing room on a tall window. */
  .transport {
    width: min(760px, 100%);
    margin-inline: auto;
    margin-top: clamp(20px, 6vh, 72px);
    padding-top: var(--gap-row);
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
  }

  /* Three tracks: speed on the left, the play cluster on the centre line,
     sleep + volume on the right. Tools no longer sit in their own bordered
     card at the bottom of the stage. */
  /* The seek bar and its times now sit ABOVE the play cluster, so the space
     belongs above this row rather than below it. */
  .transport__top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-inline);
    min-height: 58px;
    margin-top: var(--gap-inline);
    margin-bottom: 0;
  }

  .transport__wing {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .transport__wing--right {
    justify-content: flex-end;
    gap: 8px;
  }

  /* Only the volume group is allowed to shrink; every other control keeps its
     intrinsic width, so the sleep menu and the device button can never be
     pushed underneath the slider. */
  .transport__wing--right > .extra--sleep { flex: 0 0 auto; }
  .transport__wing--right > :global(.devpick) { flex: 0 0 auto; }

  .wing__sep {
    flex: 0 0 1px;
    width: 1px;
    height: 18px;
    background: var(--hairline);
  }

  .transport__volume {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 176px;
  }

  /* ── Information band ──────────────────────────────────────────────────
     Three independent white cards, one information hierarchy: an eyebrow
     label, the number that matters, the object it belongs to, a progress
     line, then the supporting facts. Cards keep their own box instead of
     melting into the canvas. */
  .below {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    gap: var(--gap-inline);
    width: min(760px, 100%);
    margin-inline: auto;
    flex: 0 0 auto;
    min-height: 0;
  }

  /* Equal-height panels with a common ruled header. Numbers, progress, and
     the footer action all land on the same baseline across the three cards. */
  .below__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 188px;
    box-sizing: border-box;
    padding: 13px 15px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }

  .below__label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--hairline);
    color: var(--text-tertiary);
  }

  .below__label::before {
    content: '';
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .below__big {
    margin-top: 7px;
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: var(--text);
    line-height: 1.1;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }

  .below__sub {
    min-height: 16px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .below__bar {
    height: 4px;
    margin-top: 12px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .below__bar > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-line);
  }

  .below__pair {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
  }

  /* "Next chapter" is one row in one box. The old two-line stack put a long
     chapter name directly under the label, so the two strings collided on a
     narrow card. Everything now shares a single baseline with ellipsis. */
  .below__next {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    margin-top: auto;
    padding: 6px 9px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-inset);
    text-align: left;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
  }

  .below__next:hover {
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }

  .below__next-label {
    flex: 0 0 auto;
    font-size: var(--text-2xs);
  }

  .below__next > :global(svg) {
    flex: 0 0 auto;
  }

  .below__next-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  /* A ruled 2×2 spec sheet: labels stay tiny, values tabular and dark. */
  .below__facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px var(--gap-inline);
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
  }

  .below__facts > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .below__facts .t-small {
    font-size: var(--text-2xs);
  }

  .below__facts .t-num {
    font-size: var(--text-xs);
    color: var(--text);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }

  /* Empty state is a real surface, not a floating line of grey text. */
  .below__empty-box {
    display: grid;
    place-items: center;
    flex: 1 1 auto;
    min-height: 62px;
    margin-top: 10px;
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-inset);
  }

  .below__empty {
    margin: 0;
  }

  .below__marks {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    max-height: 108px;
    overflow-y: auto;
  }

  /* One row owns the jump target and its two management actions, so the
     hover/selection box is the same size for every bookmark. */
  .below__mark-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    border-radius: var(--radius-xs);
  }

  .below__mark {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 3px 5px;
    text-align: left;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  /* Two quiet icon actions (pencil / trash) instead of a text label plus an
     icon: the row keeps one height and the time stays readable. */
  .below__mark-icon {
    flex: 0 0 auto;
    color: var(--text-tertiary);
  }

  .below__mark-icon:hover {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .below__mark-input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .below__mark-dot {
    width: 5px;
    height: 5px;
    flex: 0 0 5px;
    border-radius: 50%;
    background: var(--accent);
  }

  /* Grid, not flex: the add button used to be pushed out of the card when the
     placeholder text made the input claim its full intrinsic width. */
  .below__add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
  }

  .below__add .input {
    width: 100%;
    min-width: 0;
    font-size: var(--text-xs);
  }

  .below__add .btn {
    flex: 0 0 auto;
    padding-inline: 9px;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .below {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-height: 0;
    }
    .below__card--marks {
      grid-column: 1 / -1;
    }
  }

  .book-bar {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    margin-top: var(--gap-row);
  }

  .book-bar__tag {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .book-bar__pct {
    flex: 0 0 auto;
    min-width: 30px;
    text-align: right;
  }

  /* 10.5 px at 42% was unreadable. Both endpoints are now 12 px, tabular,
     and at full secondary strength; the middle line names the chapter. */
  .transport__times {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gap-row);
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .transport__t {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .transport__chapter {
    flex: 1 1 auto;
    text-align: center;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .transport__buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--gap-row);
    margin-block: var(--gap-row);
  }

  .transport__play {
    position: relative;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    transition: background var(--dur-1) var(--ease), transform var(--dur-1) var(--ease);
  }

  .transport__spin {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2.5px solid rgb(255 255 255 / 0.4);
    border-top-color: var(--on-accent);
    animation: transport-spin 0.7s linear infinite;
  }

  @keyframes transport-spin {
    to { transform: rotate(360deg); }
  }

  .transport__play:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .transport__play:active:not(:disabled) {
    transform: scale(0.97);
  }

  .transport__play:disabled {
    opacity: 0.6;
  }

  .extra {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .volume {
    flex: 1 1 auto;
    width: 128px;
    min-width: 64px;
    max-width: 128px;
  }

  .volume__value {
    min-width: 38px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    transition: color var(--dur-1) var(--ease);
  }

  .volume__value.active {
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }

  .extra--sleep {
    position: relative;
  }

  .sleep-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 168px;
    padding: var(--gap-hair);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-strong);
    box-shadow: var(--shadow-2);
  }

  .sleep-menu__item {
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-xs);
    text-align: left;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .sleep-menu__item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .sleep-menu__item[aria-pressed='true'] {
    color: var(--accent);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
    min-height: 0;
    border-left: 1px solid var(--hairline);
    padding-left: var(--gap-block);
  }

  .side__tabs .segmented {
    width: 100%;
  }

  .side__tabs .segmented__item {
    flex: 1 1 0;
  }

  /* One flex row: count (nowrap) · filter (grow) · locate (far right).
     The previous equal-column grid squeezed the count into a narrow track,
     splitting "共 1030 章" into three vertical lines. */
  .chapter-tools {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: var(--gap-inline);
    margin-bottom: var(--gap-inline);
    border-bottom: 1px solid var(--hairline);
  }

  .chapter-tools__count {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .chapter-search {
    flex: 1 1 auto;
    width: auto;
    min-width: 72px;
    height: var(--control-sm);
    font-size: var(--text-xs);
  }

  .chapter-tools__locate {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    height: var(--control-sm);
    padding: 0 8px;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .chapter-tools__locate:hover {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }

  .chapter-tools__locate span {
    max-width: 7em;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chapter-list {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chapter {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-secondary);
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
  }

  /* Hover and current come from the shared `.hl` layer, identical to the
     bottom-bar chapter list, the queue and the log viewer. */
  /* The row you are hearing must be findable at a glance even after scrolling
     a thousand chapters: accent edge + tinted surface + bold index. */
  .chapter[aria-current='true'] {
    color: var(--text);
    background: var(--accent-soft);
    box-shadow: inset 3px 0 0 var(--accent), inset 0 0 0 1px var(--accent-line);
  }

  .chapter[aria-current='true'] .chapter__index,
  .chapter[aria-current='true'] .chapter__title {
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }

  .chapter__index {
    flex: 0 0 30px;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .chapter__title {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .chapter__body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .chapter__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex: 0 0 auto;
  }

  /* A bookmark sits in the chapter list as a flag, so "where did I mark this"
     is answerable without opening the bookmarks tab. */
  .chapter__flag {
    width: 7px;
    height: 9px;
    flex: 0 0 auto;
    background: var(--accent);
    opacity: 0.8;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%);
  }

  .segmented__count {
    margin-left: 4px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    font-size: var(--text-2xs);
    color: var(--text-secondary);
  }

  .bookmarks {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
  }

  .mark-add {
    display: flex;
    gap: var(--gap-inline);
  }

  .mark-add .input {
    flex: 1 1 auto;
  }

  .chip {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    border: 1px solid var(--hairline);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
</style>
