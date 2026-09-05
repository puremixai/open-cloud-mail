<template>
  <slot v-if="ready" />
  <main v-else class="bootstrap-shell" :aria-busy="loading">
    <p v-if="loading" role="status">{{ chinese ? '正在加载邮箱…' : 'Loading mail…' }}</p>
    <div v-else role="alert">
      <p>{{ chinese ? '邮箱暂时无法加载，请检查网络后重试。' : 'Mail could not load. Check your connection and retry.' }}</p>
      <button type="button" @click="start">{{ chinese ? '重试' : 'Retry' }}</button>
    </div>
  </main>
</template>
<script setup>
import { ref } from 'vue'
const props = defineProps({ initialize: { type: Function, required: true } })
const loading = ref(false), ready = ref(false)
const chinese = navigator.language.startsWith('zh')
async function start() {
  if (loading.value) return
  loading.value = true
  try { await props.initialize(); ready.value = true } catch { ready.value = false }
  finally { loading.value = false }
}
start()
</script>
<style scoped>
.bootstrap-shell { min-height: 100vh; display: grid; place-content: center; padding: 24px; text-align: center; font: 16px/1.6 system-ui, sans-serif; }
button { padding: 8px 24px; cursor: pointer; }
</style>
