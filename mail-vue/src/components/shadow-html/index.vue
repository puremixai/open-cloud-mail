<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return;

  // 1. 提取 <body> 的 style 属性（如果存在）
  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
  const bodyStyleMatch = props.html.match(bodyStyleRegex);
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

  // 2. 移除 <body> 标签（保留内容）
  const cleanedHtml = props.html.replace(/<\/?body[^>]*>/gi, '');

  // 3. 将 body 的 style 应用到 .shadow-content
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: -apple-system, Inter, BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: #FFFFFF;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
        ${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

    </style>
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth
  const childHeight = shadowContent.scrollHeight

  if (childWidth === 0) return

  const scale = Math.min(1, parentWidth / childWidth)
  const hostElement = shadowRoot.host

  /* 用 transform 代替 zoom 做等比缩放：
     zoom 会导致浏览器选区命中错位，邮件正文无法用鼠标选中；
     transform 下选择正常，但布局尺寸不会跟随缩放，需要手动把
     宿主的布局宽高补偿为缩放后的可视大小，外层滚动范围才正确 */
  if (scale < 1) {
    hostElement.style.transformOrigin = '0 0'
    hostElement.style.transform = `scale(${scale})`
    hostElement.style.width = `${parentWidth}px`
    hostElement.style.height = `${Math.ceil(childHeight * scale)}px`
  } else {
    hostElement.style.transform = ''
    hostElement.style.width = ''
    hostElement.style.height = ''
  }
}

let resizeObserver = null

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
  /* 图片等异步资源加载后会改变内容实际尺寸，transform 缩放不会自动重排，
     监听内容尺寸变化后重新计算缩放和宿主布局高度 */
  const shadowContent = shadowRoot.querySelector('.shadow-content')
  if (shadowContent) {
    resizeObserver = new ResizeObserver(() => autoScale())
    resizeObserver.observe(shadowContent)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, Inter, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
