<script lang="ts">
  import { ui } from '../lib/state.svelte';
  import { LOCALES, LOCALE_LABEL, getLocale, setLocale, t, type Locale } from '../lib/i18n.svelte';

  const themes = [
    { id: 'graphite', key: 'theme.graphite' },
    { id: 'paper', key: 'theme.paper' },
    { id: 'midnight', key: 'theme.midnight' },
  ] as const;
</script>

<div class="page scroll-y">
  <h1 class="t-title" style="margin-bottom: var(--gap-block)">{t('settings.title')}</h1>

  <section class="card" style="max-width: 720px">
    <div class="card__body">
      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.language')}</span>
          <span class="setting__hint">{t('settings.languageHint')}</span>
        </div>
        <div class="setting__control">
          <div class="segmented">
            {#each LOCALES as locale (locale)}
              <button
                class="segmented__item"
                aria-pressed={getLocale() === locale}
                onclick={() => setLocale(locale as Locale)}
              >{LOCALE_LABEL[locale]}</button>
            {/each}
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.theme')}</span>
          <span class="setting__hint">{t('settings.themeHint')}</span>
        </div>
        <div class="setting__control">
          <div class="segmented">
            {#each themes as theme (theme.id)}
              <button
                class="segmented__item"
                aria-pressed={ui.theme === theme.id}
                onclick={() => ui.setTheme(theme.id)}
              >{t(theme.key)}</button>
            {/each}
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.motion')}</span>
          <span class="setting__hint">{t('settings.motionHint')}</span>
        </div>
        <div class="setting__control">
          <button
            class="switch"
            role="switch"
            aria-checked={ui.reduceMotion}
            aria-label={t('settings.motion')}
            onclick={() => ui.setReduceMotion(!ui.reduceMotion)}
          ></button>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }
</style>
