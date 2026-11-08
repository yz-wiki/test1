<script lang="ts">
  /**
   * One modal for every download. Escape is handled in the capture phase so
   * the global go-back shortcut does not also navigate the page behind it.
   */
  import { onMount } from 'svelte';
  import { downloadPrompt } from '../lib/downloadPrompt.svelte';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !downloadPrompt.question) return;
      event.preventDefault();
      event.stopPropagation();
      downloadPrompt.cancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

{#if downloadPrompt.question}
  {@const request = downloadPrompt.question}
  <div class="scrim" role="presentation" onclick={() => downloadPrompt.cancel()}>
    <div
      class="dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="download-dialog-title"
      onclick={event => event.stopPropagation()}
      onkeydown={event => event.stopPropagation()}
    >
      <div class="dialog__icon"><Icon name="download" size={18} /></div>
      <h2 id="download-dialog-title" class="dialog__title">{t('downloads.whereTitle')}</h2>
      <p class="dialog__desc t-small t-secondary">
        {t('downloads.whereDesc', { title: request.title })}
      </p>

      <div class="dialog__dir">
        <span class="dialog__dir-label t-label">{t('downloads.currentDir')}</span>
        <span class="dialog__dir-path truncate" title={request.dir}>
          {request.dir || t('common.unknown')}
        </span>
      </div>

      {#if downloadPrompt.error}
        <p class="dialog__error t-small" role="alert">{downloadPrompt.error}</p>
      {/if}

      <div class="dialog__actions">
        <button class="btn btn--primary" onclick={() => downloadPrompt.useDefault()}>
          {t('downloads.useDefault')}
        </button>
        <button class="btn btn--quiet" onclick={() => void downloadPrompt.chooseCustom()}>
          <Icon name="download" size={14} />
          {t('downloads.chooseOther')}
        </button>
        <button class="btn btn--quiet btn--sm dialog__cancel" onclick={() => downloadPrompt.cancel()}>
          {t('common.cancel')}
        </button>
      </div>

      <p class="dialog__note t-small t-tertiary">{t('downloads.dirNotice')}</p>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(10 12 18 / 42%);
    backdrop-filter: blur(3px);
  }

  .dialog {
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    padding: var(--gap-section) var(--gap-block);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-3), 0 24px 64px rgb(0 0 0 / 22%);
    color: var(--text);
  }

  .dialog__icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .dialog__title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .dialog__desc {
    margin: 0;
  }

  .dialog__dir {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: var(--gap-row);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-inset);
  }

  .dialog__dir-label {
    color: var(--text-tertiary);
  }

  .dialog__dir-path {
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .dialog__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dialog__cancel {
    margin-left: auto;
  }

  .dialog__note {
    margin: 0;
    line-height: 1.5;
  }

  .dialog__error {
    margin: 0;
    color: var(--danger);
  }
</style>
