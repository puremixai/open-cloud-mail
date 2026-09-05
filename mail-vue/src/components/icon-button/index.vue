<template>
  <button type="button" class="icon-button" :data-action="action || icon" :disabled="disabled || loading" :aria-label="label"
          :title="label" :aria-busy="loading || undefined" @click="activate">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
         focusable="false" :class="{ 'icon-button-spinner': loading }">
      <path :d="paths[loading ? 'loading' : action] || paths[icon] || paths.menu" />
    </svg>
    <slot />
  </button>
</template>

<script setup>
const props = defineProps({
  action: { type: String, default: '' }, icon: { type: String, default: '' },
  label: { type: String, required: true }, loading: Boolean, disabled: Boolean,
})
const emit = defineEmits(['click'])
function activate(event) { if (!props.loading && !props.disabled) emit('click', event) }
const paths = {
  loading: 'M20 12a8 8 0 1 1-8-8',
  refresh: 'M20 7v5h-5 M20 12a8 8 0 1 0-2.3 5.7 M20 7l-2.3-2.7',
  delete: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  read: 'M3 8l9-5 9 5v13H3z M3 8l9 6 9-6',
  sortAsc: 'M6 20V4 M3 7l3-3 3 3 M12 6h9 M12 12h6 M12 18h3',
  sortDesc: 'M6 4v16 M3 17l3 3 3-3 M12 6h3 M12 12h6 M12 18h9',
  density: 'M4 5h16 M4 10h16 M4 15h16 M4 20h16',
  accounts: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M18 15a4 4 0 0 1 3 4v2',
  back: 'M20 12H4 M10 6l-6 6 6 6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  reply: 'M9 5l-6 6 6 6 M3 11h10a8 8 0 0 1 8 8',
  forward: 'M15 5l6 6-6 6 M21 11H11a8 8 0 0 0-8 8',
  attachment: 'M8 13l7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2 M6 15l8-8',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  preview: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  close: 'M6 6l12 12 M18 6L6 18', clear: 'M6 6l12 12 M18 6L6 18',
  contacts: 'M5 3h15v18H5z M2 7h5 M2 12h5 M2 17h5 M15 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M9 17v-1a4 4 0 0 1 8 0v1',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10',
  notice: 'M3 10v5h5l12 5V5L8 10z M8 15l2 6H6l-2-6',
  compose: 'M14 4l6 6 M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  copy: 'M9 8h12v13H9z M5 16H3V3h12v2',
  monitor: 'M3 3h18v14H3z M8 21h8 M12 17v4',
}
</script>

<style scoped>
.icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; min-width: 32px; min-height: 32px; padding: 6px; border: 1px solid transparent; border-radius: 4px; color: inherit; cursor: pointer; vertical-align: middle; }
.icon-button:hover:not(:disabled) { background: var(--base-fill); }
.icon-button[aria-pressed="true"] { background: var(--choose-account-background, var(--base-fill)); border-color: currentColor; }
.icon-button[data-action="star"][aria-pressed="true"] svg { fill: currentColor; }
.icon-button:disabled { cursor: default; opacity: .5; }
.icon-button svg { flex-shrink: 0; width: 20px; height: 20px; }
.icon-button-spinner { animation: icon-button-spin 1s linear infinite; }
@keyframes icon-button-spin { to { transform: rotate(360deg); } }
@media (pointer: coarse) { .icon-button { min-width: 44px; min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .icon-button-spinner { animation: none; } }
:global(html.win95) .icon-button { border-radius: 0; }
:global(html.win95) .icon-button:hover:not(:disabled) { background: #c0c0c0; box-shadow: inset -1px -1px #808080, inset 1px 1px #fff; }
</style>
