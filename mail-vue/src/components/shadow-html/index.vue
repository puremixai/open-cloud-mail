<template>
  <div class="content-box" ref="contentBox">
    <button v-if="hasRemoteImages && !allowRemoteImages" type="button" class="load-images" @click="loadExternalImages">
      {{ loadImagesLabel }}
    </button>
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { sanitizeMailHtml } from '@/utils/mail-html.js'

const props = defineProps({
  html: { type: String, required: true },
  // Supply mailId (or key the component by mail ID) to reset identical bodies.
  mailId: { type: [String, Number], default: undefined }
})
const { locale } = useI18n({ useScope: 'global' })
const loadImagesLabel = computed(() => /^zh(?:[-_]|$)/i.test(locale.value)
  ? '加载外部图片' : 'Load external images')
const container = ref(null)
const contentBox = ref(null)
const hasRemoteImages = ref(false)
const allowRemoteImages = ref(false)
let shadowRoot = null
let shadowContent = null
let resizeObserver = null

// This stylesheet is application-owned. Email stylesheets never enter the root.
const BASE_STYLE = `
  :host {
    all: initial;
    display: block;
    font-family: -apple-system, Inter, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #13181D;
    word-break: break-word;
  }
  h1, h2, h3, h4 { font-size: 18px; font-weight: 700; }
  p { margin: 0; }
  a { text-decoration: none; color: #0E70DF; }
  .shadow-content {
    display: flow-root;
    background: #fff;
    width: fit-content;
    height: fit-content;
    min-width: 100%;
  }
  img:not(table img) { max-width: 100%; height: auto !important; }
`

function updateContent() {
  if (!shadowRoot) return
  resizeObserver?.disconnect()
  const result = sanitizeMailHtml(props.html, { allowRemoteImages: allowRemoteImages.value })
  hasRemoteImages.value = result.hasRemoteImages
  const style = document.createElement('style')
  style.textContent = BASE_STYLE
  shadowContent = document.createElement('div')
  shadowContent.className = 'shadow-content'
  shadowContent.style.cssText = result.bodyStyle
  shadowContent.append(result.fragment)
  shadowRoot.replaceChildren(style, shadowContent)
  resizeObserver?.observe(contentBox.value)
  resizeObserver?.observe(shadowContent)
  autoScale()
}

function autoScale() {
  if (!shadowRoot || !shadowContent || !contentBox.value) return
  const host = shadowRoot.host
  const parentWidth = contentBox.value.offsetWidth
  const childWidth = shadowContent.scrollWidth
  const childHeight = shadowContent.scrollHeight
  const scale = parentWidth > 0 && childWidth > 0 ? Math.min(1, parentWidth / childWidth) : 1
  // Transform preserves mouse text selection; compensate the host layout height.
  host.style.transformOrigin = '0 0'
  host.style.transform = scale < 1 ? `scale(${scale})` : ''
  host.style.width = scale < 1 ? `${parentWidth}px` : ''
  host.style.height = scale < 1 ? `${Math.ceil(childHeight * scale)}px` : ''
}

function loadExternalImages() {
  allowRemoteImages.value = true
  updateContent()
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(autoScale)
  // Capturing load/error also covers image overflow that does not resize its box.
  shadowRoot.addEventListener('load', autoScale, true)
  shadowRoot.addEventListener('error', autoScale, true)
  window.addEventListener('resize', autoScale)
  updateContent()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  shadowRoot?.removeEventListener('load', autoScale, true)
  shadowRoot?.removeEventListener('error', autoScale, true)
  window.removeEventListener('resize', autoScale)
  shadowRoot = null
  shadowContent = null
})

watch(() => [props.html, props.mailId], () => {
  allowRemoteImages.value = false
  updateContent()
}, { flush: 'post' })
</script>

<style scoped>
.content-box {
  width: 100%;
  overflow: hidden;
  position: relative;
  isolation: isolate;
  contain: paint;
  font-family: -apple-system, Inter, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}

.content-html {
  width: 100%;
}

.load-images {
  margin: 0 0 12px;
  padding: 6px 12px;
  border: 1px solid #c7d4e5;
  border-radius: 4px;
  background: #f4f8fd;
  color: #0e70df;
  font: inherit;
  cursor: pointer;
}
</style>
