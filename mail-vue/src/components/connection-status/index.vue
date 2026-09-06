<template>
  <aside v-if="offline || restored" class="connection-status" role="status" aria-live="polite">
    <strong>{{ t(offline ? 'ux.offlineTitle' : 'ux.onlineAgain') }}</strong>
    <span v-if="offline">{{ t('ux.offlineHint') }}</span>
    <button v-if="!offline && activeList" type="button" @click="retry">{{ t('ux.retryConnection') }}</button>
  </aside>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useEmailStore } from '@/store/email.js'
const { t } = useI18n(), route = useRoute(), store = useEmailStore()
const offline = ref(navigator.onLine === false), restored = ref(false)
const activeList = computed(() => ({ email: store.emailScroll, star: store.starScroll, send: store.sendScroll }[route.name]))
let timer
function update() {
  const wasOffline = offline.value
  offline.value = navigator.onLine === false
  restored.value = wasOffline && !offline.value
  clearTimeout(timer)
  if (restored.value) timer = setTimeout(() => { restored.value = false }, 8000)
}
function retry() {
  activeList.value?.refreshList(false)
  restored.value = false
}
onMounted(() => { window.addEventListener('online', update); window.addEventListener('offline', update) })
onBeforeUnmount(() => { clearTimeout(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update) })
</script>
<style scoped>
.connection-status { position: fixed; left: 50%; bottom: 52px; transform: translateX(-50%); z-index: 1600; width: max-content; max-width: calc(100vw - 32px); display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 12px 16px; border: 1px solid var(--mail-border); background: var(--mail-paper); color: var(--el-text-color-primary); box-shadow: var(--el-box-shadow-light); font-size: 13px; }
.connection-status span { max-width: 42ch; color: var(--mail-muted); }
.connection-status button { cursor: pointer; color: var(--el-color-primary); min-height: 32px; }
</style>
