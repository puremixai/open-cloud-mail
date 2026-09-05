<template>
  <div class="w95-email-row">
    <button type="button" class="w95-email-copy" :class="{ copied: state === 'copied' }"
            :disabled="!email || state === 'copying'" :aria-label="$t('win95IdcardCopyEmail')"
            :title="$t('win95IdcardCopyEmail')" :aria-busy="state === 'copying'" @click.stop="$emit('copy')">
      <span v-if="state === 'copied'" class="w95-email-success">{{ $t('win95IdcardCopyEmailTip') }}</span>
      <span v-else class="w95-email-address" dir="ltr">
        <span class="w95-email-local">{{ parts.local || '—' }}</span><span class="w95-email-domain">{{ parts.domain }}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <path v-if="state === 'copied'" d="m3 8 3 3 7-7"/>
        <template v-else><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M10 5V2H2v9h3"/></template>
      </svg>
    </button>
    <button type="button" class="w95-email-more" :aria-label="$t('win95IdcardFullEmail')"
            :title="$t('win95IdcardFullEmail')" :aria-expanded="expanded" aria-controls="w95-email-details"
            @click.stop="$emit('details', $event)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="13" cy="8" r="1.2"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ email: { type: String, default: '' }, state: String, expanded: Boolean })
defineEmits(['copy', 'details'])
const parts = computed(() => {
  const at = props.email.lastIndexOf('@')
  return at < 0 ? { local: props.email, domain: '' } : { local: props.email.slice(0, at), domain: props.email.slice(at) }
})
</script>
