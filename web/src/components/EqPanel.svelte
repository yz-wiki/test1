<script lang="ts">
  import { onMount } from 'svelte';
  import {
    applyEqPreset,
    getEqBandFrequencies,
    getEqPresets,
    getEqSettings,
    resetEq,
    setEqBand,
    setEqEnabled,
    setEqPreamp,
    type EqPreset,
  } from '../lib/ipc';
  import { t } from '../lib/i18n.svelte';

  let enabled = $state(false);
  let preamp = $state(0);
  let bands = $state<number[]>(Array.from({ length: 10 }, () => 0));
  let frequencies = $state<number[]>([]);
  let presets = $state<EqPreset[]>([]);
  let preset = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    try {
      const [settings, freqs, list] = await Promise.all([
        getEqSettings(),
        getEqBandFrequencies(),
        getEqPresets(),
      ]);
      enabled = settings.enabled;
      preamp = settings.preamp;
      bands = settings.bands;
      preset = settings.presetName ?? null;
      frequencies = freqs;
      presets = list;
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  onMount(load);

  async function toggle(next: boolean): Promise<void> {
    enabled = next;
    try {
      await setEqEnabled(next);
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  /** Bands commit on release (`change`), not on every pixel of the drag — each
   *  call crosses the VLC audio pipeline. */
  function commitBand(index: number, value: number): void {
    bands[index] = value;
    preset = null;
    void setEqBand(index, value).catch(reason => (error = (reason as Error).message));
  }

  function commitPreamp(value: number): void {
    preamp = value;
    void setEqPreamp(value).catch(reason => (error = (reason as Error).message));
  }

  async function usePreset(index: number): Promise<void> {
    try {
      await applyEqPreset(index);
      await load();
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  async function reset(): Promise<void> {
    try {
      await resetEq();
      await load();
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  function label(hz: number): string {
    return hz >= 1000 ? `${Math.round(hz / 1000)}k` : String(Math.round(hz));
  }
  import Dropdown from './Dropdown.svelte';
</script>

<div class="card" style="max-width: 720px">
  <div class="card__body">
    <div class="setting">
      <div class="setting__main">
        <span class="setting__label">{t('eq.title')}</span>
        <span class="setting__hint">{t('eq.hint')}</span>
      </div>
      <div class="setting__control">
        <button
          class="switch"
          role="switch"
          aria-checked={enabled}
          aria-label={t('eq.enable')}
          onclick={() => void toggle(!enabled)}
        ></button>
      </div>
    </div>

    <div class="setting" class:dim={!enabled}>
      <div class="setting__main">
        <span class="setting__label">{t('eq.preset')}</span>
      </div>
      <div class="setting__control">
        <Dropdown
          value={preset === null || preset === undefined ? '' : String(preset)}
          options={[
            { value: '', label: preset ?? t('eq.flat') },
            ...presets.map(entry => ({ value: String(entry.index), label: entry.name })),
          ]}
          onSelect={next => {
            if (next === '') {
              void reset();
              return;
            }
            void usePreset(Number(next));
          }}
          disabled={!enabled}
          label={t('eq.preset')}
          variant="field"
        />
      </div>
    </div>

    <div class="bands" class:dim={!enabled}>
      {#each bands as gain, index (index)}
        <label class="band">
          <span class="band__gain t-num t-small">{(gain > 0 ? '+' : '') + gain.toFixed(1)}</span>
          <input
            class="band__slider"
            type="range"
            min="-20"
            max="20"
            step="0.5"
            value={gain}
            disabled={!enabled}
            aria-label={frequencies[index] ? label(frequencies[index]) : String(index)}
            oninput={event => (bands[index] = Number(event.currentTarget.value))}
            onchange={event => commitBand(index, Number(event.currentTarget.value))}
          />
          <span class="band__hz t-num t-small t-tertiary">
            {frequencies[index] ? label(frequencies[index]) : index}
          </span>
        </label>
      {/each}
    </div>

    <div class="setting" class:dim={!enabled}>
      <div class="setting__main">
        <span class="setting__label">{t('eq.preamp')}</span>
      </div>
      <div class="setting__control">
        <input
          class="preamp"
          type="range"
          min="-20"
          max="20"
          step="0.5"
          value={preamp}
          disabled={!enabled}
          oninput={event => (preamp = Number(event.currentTarget.value))}
          onchange={event => commitPreamp(Number(event.currentTarget.value))}
        />
        <span class="t-num t-small t-tertiary">{(preamp > 0 ? '+' : '') + preamp.toFixed(1)} dB</span>
      </div>
    </div>

    {#if error}
      <p class="t-small form-error" role="alert">{error}</p>
    {/if}
  </div>
</div>

<style>
  .dim {
    opacity: 0.45;
    pointer-events: none;
  }

  .bands {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--gap-inline);
    padding: var(--gap-block) var(--gap-inline);
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    overflow-x: auto;
  }

  .band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1 1 0;
    min-width: 34px;
  }

  .band__gain {
    color: var(--text-secondary);
    font-size: var(--text-2xs);
  }

  .band__slider {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 112px;
    accent-color: var(--accent);
  }

  .band__hz {
    font-size: var(--text-2xs);
  }

  .preamp {
    width: 160px;
    accent-color: var(--accent);
  }

  .form-error {
    color: var(--danger);
    padding: var(--gap-row) 0;
  }
</style>
