<script lang="ts">
  /**
   * Live log viewer.
   *
   * Two streams: application events (window errors, lifecycle) and every
   * command sent to the Audiobookshelf server. The list is virtual-free —
   * capped at 800 lines in the store — and the controls are the ones a log
   * viewer actually needs: scope, level, text filter, freeze, follow, clear,
   * copy, export, and a shortcut to the on-disk Rust log directory.
   */
  import { logs, formatLogTime, type LogLevel } from '../lib/logs.svelte';
  import { openLogDir } from '../lib/ipc';
  import { t } from '../lib/i18n.svelte';
  import Dropdown from './Dropdown.svelte';
  import Icon from './Icon.svelte';

  /** `scope` pins the panel to one stream and hides its own tabs, so the
      server page can embed it without two competing tab bars. */
  let { scope = undefined, embedded = false }: {
    scope?: 'app' | 'server';
    embedded?: boolean;
  } = $props();

  $effect(() => {
    if (scope) logs.scope = scope;
  });

  /** Selecting a line reveals its untruncated message and metadata. */
  let selected = $state<number | null>(null);

  /** Content type, separate from severity: a DEBUG from the socket and a
      DEBUG from the router are not the same kind of event. */
  type LogKind = 'sync' | 'ui' | 'media' | 'network' | 'other';
  function kindOf(source: string): LogKind {
    const name = source.toLowerCase();
    if (/(http|request|fetch|upload|api|response)/.test(name)) return 'network';
    if (/(sync|socket|auth|token|server)/.test(name)) return 'sync';
    if (/(route|ui|window|settings|app)/.test(name)) return 'ui';
    if (/(player|play|audio|download|cover|library|book|media)/.test(name)) return 'media';
    return 'other';
  }

  let listEl = $state<HTMLDivElement | null>(null);
  let notice = $state<string | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  const LEVELS: { id: LogLevel | 'all'; key: 'logs.level.all' | 'logs.level.debug' | 'logs.level.info' | 'logs.level.warn' | 'logs.level.error' }[] = [
    { id: 'all', key: 'logs.level.all' },
    { id: 'debug', key: 'logs.level.debug' },
    { id: 'info', key: 'logs.level.info' },
    { id: 'warn', key: 'logs.level.warn' },
    { id: 'error', key: 'logs.level.error' },
  ];

  $effect(() => {
    const count = logs.visible.length;
    if (!logs.follow || logs.frozen || !listEl) return;
    void count;
    listEl.scrollTop = listEl.scrollHeight;
  });

  function flash(message: string): void {
    notice = message;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = null), 1800);
  }

  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(logs.asText());
      flash(t('logs.copied'));
    } catch {
      flash('clipboard unavailable');
    }
  }

  function exportAll(): void {
    const blob = new Blob([logs.asText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ADSplayer-${logs.scope}-${new Date().toISOString().slice(0, 10)}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
    flash(t('logs.exported'));
  }
</script>

<div class="logs" class:embedded>
  {#if !scope}
  <div class="logs__tabs">
    <button
      class="logs__tab"
      aria-pressed={logs.scope === 'app'}
      onclick={() => (logs.scope = 'app')}
    >
      <Icon name="activity" size={14} />
      {t('logs.app')}
      <span class="logs__count t-num">{logs.counts.app}</span>
    </button>
    <button
      class="logs__tab"
      aria-pressed={logs.scope === 'server'}
      onclick={() => (logs.scope = 'server')}
    >
      <Icon name="server" size={14} />
      {t('logs.server')}
      <span class="logs__count t-num">{logs.counts.server}</span>
    </button>

    <span class="logs__state" class:frozen={Boolean(logs.frozen)}>
      <span class="logs__pulse"></span>
      {logs.frozen ? t('logs.frozen') : t('logs.live')}
    </span>
  </div>
  {/if}

  <div class="logs__tools">
    <Dropdown
      value={logs.minLevel}
      options={LEVELS.map(level => ({ value: level.id, label: t(level.key) }))}
      onSelect={next => (logs.minLevel = next as typeof logs.minLevel)}
      label={t('logs.level')}
      variant="field"
      align="start"
    />

    <input class="input input--sm" bind:value={logs.query} placeholder={t('logs.filter')} spellcheck="false" />

    <button class="btn btn--quiet btn--sm" onclick={() => logs.toggleFreeze()}>
      <Icon name={logs.frozen ? 'play' : 'pause'} size={13} />
      {logs.frozen ? t('logs.resume') : t('logs.freeze')}
    </button>

    <label class="logs__check t-small">
      <input type="checkbox" bind:checked={logs.follow} />
      {t('logs.follow')}
    </label>

    <div class="logs__spacer"></div>

    <button class="btn btn--quiet btn--sm" onclick={() => void copyAll()}>{t('logs.copy')}</button>
    <button class="btn btn--quiet btn--sm" onclick={exportAll}>{t('logs.export')}</button>
    <button class="btn btn--quiet btn--sm" onclick={() => void openLogDir()}>{t('logs.openDir')}</button>
    <button class="btn btn--quiet btn--sm" onclick={() => logs.clear()}>
      <Icon name="trash" size={13} />
      {t('logs.clear')}
    </button>
  </div>

  <p class="logs__hint t-small t-tertiary">
    {embedded ? t('admin.serverLogsHint') : t('logs.hint')} · {t('logs.detailHint')}
  </p>

  <div class="logs__list scroll-y" bind:this={listEl}>
    {#if logs.visible.length === 0}
      <p class="logs__empty t-small t-tertiary">{t('logs.empty')}</p>
    {:else}
      {#each logs.visible as entry (entry.id)}
        <div class="line-wrap">
          <button
            class="line hl hl-level-{entry.level} level-{entry.level}"
            class:selected={selected === entry.id}
            aria-expanded={selected === entry.id}
            onclick={() => (selected = selected === entry.id ? null : entry.id)}
          >
            <span class="line__time t-num">{formatLogTime(entry.at)}</span>
            <span class="line__level">{entry.level.toUpperCase()}</span>
            <span class="line__source">
              <span class="line__dot kind-{kindOf(entry.source)}" aria-hidden="true"></span>
              <span class="truncate">{entry.source}</span>
            </span>
            <span class="line__message truncate">{entry.message}</span>
          </button>
          {#if selected === entry.id}
            <div class="line-detail">
              <div class="line-detail__meta t-small t-tertiary t-num">
                <span>{formatLogTime(entry.at)}</span>
                <span>{t('logs.fullMessage')}</span>
                <span>{t('logs.source')}: {entry.source}</span>
              </div>
              <pre class="line-detail__body">{entry.message}</pre>
              <button
                class="btn btn--quiet btn--sm"
                onclick={() => void navigator.clipboard.writeText(entry.message)}
              >{t('logs.copy')}</button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  {#if notice}
    <div class="logs__toast t-small">{notice}</div>
  {/if}
</div>

<style>
  .logs {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    min-height: 0;
  }

  .logs__tabs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .logs__tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .logs__tab[aria-pressed='true'] {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  .logs__count {
    font-size: var(--text-2xs);
    opacity: 0.7;
  }

  .logs__state {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
    color: var(--positive);
  }

  .logs__state.frozen {
    color: var(--warning);
  }

  .logs__pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .logs__tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .select--sm {
    width: auto;
    min-width: 82px;
    height: var(--control-sm);
    font-size: var(--text-xs);
  }

  .input--sm {
    width: 150px;
    height: var(--control-sm);
    font-size: var(--text-xs);
  }

  .logs__check {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .logs__spacer {
    flex: 1 1 auto;
  }

  .logs__hint {
    font-size: var(--text-2xs);
  }

  .logs__list {
    height: min(52vh, 520px);
    min-height: 240px;
    overflow: auto;
    padding: var(--gap-inline);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--surface-inset);
    font-family: ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
    font-size: var(--text-xs);
    line-height: 1.65;
  }

  .logs__empty {
    padding: var(--gap-row);
    font-family: inherit;
  }

  .line {
    display: grid;
    grid-template-columns: 86px 46px 132px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    padding: 2px 4px;
    border-radius: 2px;
    text-align: left;
    color: var(--text-secondary);
  }

  /* Hover / selected / severity backgrounds all come from the shared `.hl`
     layer now; only the message colour stays scoped to this component. */
  .line__time {
    color: var(--text-tertiary);
  }

  /* Severity is now a badge, not a word in the same colour as everything
     else; source gets a second, independent colour axis for its type. */
  .line__level {
    display: inline-grid;
    place-items: center;
    height: 15px;
    margin-top: 1px;
    border: 1px solid currentColor;
    border-radius: var(--radius-xs);
    font-size: 9px;
    font-weight: var(--weight-semibold);
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
  }

  .line.level-info .line__level { color: var(--accent); }
  .line.level-warn .line__level { color: var(--warning); }
  .line.level-error .line__level { color: var(--danger); }
  .line.level-debug .line__level { opacity: 0.5; }

  .line.level-warn .line__message { color: var(--warning); }
  .line.level-error .line__message { color: var(--danger); }

  .line__source {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--text-tertiary);
  }

  .line__dot {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
  }

  .line__dot.kind-sync { background: var(--positive); }
  .line__dot.kind-ui { background: var(--accent); }
  .line__dot.kind-media { background: var(--warning); }
  .line__dot.kind-network { background: var(--info, var(--accent)); }

  /* The badge is filled for the levels that matter; DEBUG stays a quiet
     outline, so a wall of DEBUG rows does not compete with one ERROR. */
  .line.level-info .line__level,
  .line.level-warn .line__level,
  .line.level-error .line__level {
    border: none;
    color: var(--on-accent);
  }
  .line.level-info .line__level { background: var(--accent); }
  .line.level-warn .line__level { background: var(--warning); }
  .line.level-error .line__level { background: var(--danger); }

  .logs.embedded .logs__list {
    height: min(58vh, 560px);
  }

  .line-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 2px 4px var(--gap-inline) 90px;
    padding: var(--gap-inline);
    border-left: 2px solid var(--accent-line);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: var(--surface);
  }

  .line-detail__meta {
    display: flex;
    gap: var(--gap-panel);
    flex-wrap: wrap;
  }

  .line-detail__body {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: var(--text-xs);
    line-height: 1.55;
    color: var(--text);
  }

  .line-detail .btn {
    align-self: flex-start;
  }

  .line__message {
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
  }

  .logs__toast {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
