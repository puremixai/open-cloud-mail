<template>
  <section ref="workspace" class="mail-workspace" :class="{ 'has-reader': split }" :style="split ? { gridTemplateColumns: `${listWidth}px 6px minmax(0, 1fr)` } : undefined" :aria-label="t('ux.mailWorkspace')">
    <div class="workspace-list"><slot /></div>
    <template v-if="split">
      <div class="reader-divider" role="separator" aria-orientation="vertical" tabindex="0"
           :aria-label="t('ux.resizeList')" :aria-valuemin="300" :aria-valuemax="maxListWidth" :aria-valuenow="listWidth"
           @pointerdown="startResize" @pointermove="resize" @pointerup="stopResize" @pointercancel="stopResize"
           @keydown="resizeKey" @dblclick="uiStore.mailListWidth = 380" />
      <div class="workspace-reader">
        <MailContent v-if="hasSelection" embedded @close="closeReader" />
        <div v-else class="reader-welcome">
          <Icon icon="mdi:email-outline" width="40" height="40" aria-hidden="true" />
          <h2>{{ t('ux.readerWelcome') }}</h2>
          <p>{{ t('ux.readerWelcomeHint') }}</p>
          <div class="reader-shortcuts"><kbd>↑</kbd><kbd>↓</kbd><span>{{ t('ux.browseMail') }}</span><kbd>Enter</kbd><span>{{ t('ux.openSelected') }}</span></div>
        </div>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import MailContent from '@/views/content/index.vue'
import { useUiStore } from '@/store/ui.js'
import { useEmailStore } from '@/store/email.js'
import { clampListWidth } from '@/utils/mail-navigation.js'

const { t } = useI18n()
const route = useRoute(), router = useRouter(), uiStore = useUiStore(), emailStore = useEmailStore()
const workspace = ref(null), width = ref(0)
const eligible = computed(() => ['email', 'star', 'send'].includes(route.name))
const split = computed(() => eligible.value && uiStore.readingPane && width.value >= 860)
const listWidth = computed(() => clampListWidth(uiStore.mailListWidth, width.value))
const maxListWidth = computed(() => clampListWidth(560, width.value))
const hasSelection = computed(() => emailStore.contentData.source === route.name && !!emailStore.contentData.email?.emailId)
let observer, dragging = null
watch(split, value => { uiStore.splitReader = value }, { immediate: true, flush: 'sync' })
// A selected message stays open when its pane is folded or the viewport narrows.
watch([split, width, () => route.query.message], ([value, size, message], [before, previousSize, previousMessage]) => {
  if (!value && size > 0 && eligible.value && hasSelection.value &&
      (before || (message && (previousSize === 0 || message !== previousMessage)))) {
    router.push({ path: '/mail', query: { message: emailStore.contentData.email.emailId, source: route.name } })
  }
})
onMounted(() => {
  width.value = workspace.value?.clientWidth || 0
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(entries => { width.value = entries[0].contentRect.width })
    observer.observe(workspace.value)
  }
})
onBeforeUnmount(() => { observer?.disconnect(); uiStore.splitReader = false })
async function closeReader() {
  const current = workspace.value?.querySelector('.email-row.is-current .mail-open')
  emailStore.contentData.email = null
  if (route.query.message) {
    const query = { ...route.query }; delete query.message
    router.replace({ query })
  }
  await nextTick()
  current?.focus({ preventScroll: true })
}
function startResize(event) {
  if (event.button !== 0) return
  dragging = { x: event.clientX, width: listWidth.value }
  event.currentTarget.setPointerCapture(event.pointerId)
  event.preventDefault()
}
function resize(event) {
  if (dragging) uiStore.mailListWidth = clampListWidth(dragging.width + event.clientX - dragging.x, width.value)
}
function stopResize() { dragging = null }
function resizeKey(event) {
  const values = { ArrowLeft: listWidth.value - 20, ArrowRight: listWidth.value + 20, Home: 300, End: maxListWidth.value }
  if (!(event.key in values)) return
  event.preventDefault()
  uiStore.mailListWidth = clampListWidth(values[event.key], width.value)
}
</script>
<style scoped>
.mail-workspace { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
.workspace-list, .workspace-reader { min-width: 0; min-height: 0; overflow: hidden; height: 100%; }
.workspace-reader { background: var(--mail-paper); }
.reader-divider { background: var(--mail-chrome); border-inline: 1px solid var(--mail-border); cursor: col-resize; touch-action: none; z-index: 1; }
.reader-divider:hover, .reader-divider:focus-visible { background: var(--el-color-primary); outline-offset: -2px; }
.reader-welcome { height: 100%; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; text-align: center; color: var(--secondary-text-color); }
.reader-welcome > svg { margin-bottom: 24px; opacity: .65; }
.reader-welcome h2 { font-size: 20px; font-weight: 600; color: var(--el-text-color-primary); margin-bottom: 8px; }
.reader-welcome p { max-width: 28ch; line-height: 1.8; }
.reader-shortcuts { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; font-size: 12px; margin-top: 32px; }
.reader-shortcuts span { margin-right: 10px; }
</style>
