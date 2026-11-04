<script lang="ts">
  import { session } from '../lib/state.svelte';
  import { t } from '../lib/i18n.svelte';
  import Titlebar from '../components/Titlebar.svelte';

  let host = $state(localStorage.getItem('skald.serverUrl')?.replace(/^https?:\/\//, '') ?? '');
  let method = $state<'apikey' | 'password'>('apikey');
  let apiKey = $state('');
  let username = $state('');
  let password = $state('');
  let pending = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';

    if (!host.trim()) {
      error = t('login.errServer');
      return;
    }
    if (method === 'apikey' && !apiKey.trim()) {
      error = t('login.errKey');
      return;
    }
    if (method === 'password' && !username.trim()) {
      error = t('login.errName');
      return;
    }
    if (method === 'password' && !password) {
      error = t('login.errPass');
      return;
    }

    pending = true;
    try {
      if (method === 'apikey') {
        await session.signInWithKey(host, apiKey.trim());
      } else {
        await session.signInWithPassword(host, username.trim(), password);
      }
    } catch (failure) {
      error = (failure as Error).message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="login">
  <Titlebar title={t('app.name')} />

  <div class="login__stage">
    <form class="card login__card" onsubmit={submit}>
      <div class="stack" style="gap: var(--gap-tight)">
        <h1 class="t-heading">{t('login.title')}</h1>
        <p class="t-small">{t('login.subtitle')}</p>
      </div>

      <div class="segmented" role="group" aria-label={t('login.method')}>
        <button
          type="button"
          class="segmented__item"
          aria-pressed={method === 'apikey'}
          onclick={() => (method = 'apikey')}
        >{t('login.apiKey')}</button>
        <button
          type="button"
          class="segmented__item"
          aria-pressed={method === 'password'}
          onclick={() => (method = 'password')}
        >{t('login.password')}</button>
      </div>

      <label class="field">
        <span class="field__label">{t('login.server')}</span>
        <input
          class="input"
          bind:value={host}
          placeholder={t('login.serverPlaceholder')}
          spellcheck="false"
          autocomplete="off"
        />
      </label>

      {#if method === 'apikey'}
        <label class="field">
          <span class="field__label">{t('login.apiKey')}</span>
          <textarea
            class="textarea textarea--mono"
            rows="3"
            bind:value={apiKey}
            spellcheck="false"
            autocomplete="off"
            style="resize: none"
          ></textarea>
          <span class="field__hint">{t('login.apiKeyHint')}</span>
        </label>
      {:else}
        <label class="field">
          <span class="field__label">{t('login.username')}</span>
          <input class="input" bind:value={username} autocomplete="username" spellcheck="false" />
        </label>
        <label class="field">
          <span class="field__label">{t('login.password')}</span>
          <input class="input" type="password" bind:value={password} autocomplete="current-password" />
        </label>
      {/if}

      {#if session.authNotice}
        <div class="login__error" role="alert">{t('auth.expired')}</div>
      {/if}

      {#if error}
        <div class="login__error" role="alert">{error}</div>
      {/if}

      <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={pending}>
        {pending ? t('login.pending') : t('login.submit')}
      </button>
    </form>
  </div>
</div>

<style>
  .login {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .login__stage {
    flex: 1 1 auto;
    display: grid;
    place-items: center;
    padding: var(--gap-page);
    min-height: 0;
    overflow-y: auto;
  }

  .login__card {
    display: flex;
    flex-direction: column;
    gap: var(--gap-panel);
    width: min(420px, 100%);
    padding: var(--gap-section);
    border-radius: var(--radius-lg);
  }

  .login__error {
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
    font-size: var(--text-sm);
  }
</style>
