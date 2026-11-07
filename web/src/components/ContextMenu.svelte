<script lang="ts">
  import { onMount } from 'svelte';
  import { menu } from '../lib/menu.svelte';

  onMount(() => {
    const close = () => menu.hide();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.open) {
        menu.hide();
        event.preventDefault();
      }
    };
    // No pointerdown listener here on purpose: a capture-phase listener would
    // hide the menu before the item's click could land on it. The scrim below
    // covers everything except the menu itself, which is what dismisses it.
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', close);
    };
  });
</script>

{#if menu.open}
  <!-- The overlay swallows the click that dismisses the menu, so the item under
       the cursor never also activates. -->
  <div
    class="menu__scrim"
    role="presentation"
    onpointerdown={() => menu.hide()}
    oncontextmenu={event => event.preventDefault()}
  ></div>

  <div class="menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
    {#each menu.items as item (item.id)}
      {#if item.separatorBefore}
        <div class="menu__sep"></div>
      {/if}
      <button
        class="menu__item"
        class:danger={item.danger}
        role="menuitem"
        disabled={item.disabled}
        onclick={() => menu.run(item)}
      >
        <span class="truncate">{item.label}</span>
        {#if item.hint}
          <span class="menu__hint t-num">{item.hint}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .menu__scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
  }

  .menu {
    position: fixed;
    z-index: 91;
    min-width: 200px;
    max-width: 280px;
    padding: var(--gap-hair);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-strong);
    box-shadow: var(--shadow-3);
    display: flex;
    flex-direction: column;
  }

  .menu__sep {
    height: 1px;
    margin: var(--gap-hair) var(--gap-inline);
    background: var(--hairline);
  }

  .menu__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-panel);
    padding: 7px var(--gap-row);
    border-radius: var(--radius-xs);
    text-align: left;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .menu__item:hover:not(:disabled) {
    background: var(--accent-soft);
    color: var(--text);
  }

  .menu__item.danger {
    color: var(--danger);
  }

  .menu__item:disabled {
    opacity: 0.4;
  }

  .menu__hint {
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
  }
</style>
