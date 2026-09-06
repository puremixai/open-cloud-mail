<template>
  <a class="skip-link" href="#mail-main" @click.prevent="focusMail">{{ $t('ux.skipToMail') }}</a>
  <Win95Frame v-if="userStore.user.email">
    <el-container class="layout">
      <el-aside
          class="aside"
          :inert="!uiStore.asideShow" :aria-hidden="!uiStore.asideShow"
          :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
        <Aside />
      </el-aside>
      <div
          :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
          @click="uiStore.asideShow = false"
      ></div>
      <el-container class="main-container">
        <el-main id="mail-main" tabindex="-1">
          <el-header>
            <Header />
          </el-header>
          <Main />
        </el-main>
      </el-container>
    </el-container>
  </Win95Frame>
  <writer v-if="userStore.user.email" ref="writerRef" />
  <ConnectionStatus v-if="userStore.user.email" />
</template>

<script setup>
import {useEmailStore} from '@/store/email.js'
import {useUserStore} from "@/store/user.js"
const userStore = useUserStore()
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import Win95Frame from '@/layout/win95/frame.vue'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import writer from '@/layout/write/index.vue'
import ConnectionStatus from '@/components/connection-status/index.vue'

const uiStore = useUiStore();
const writerRef = ref({})
function focusMail() { document.getElementById('mail-main')?.focus() }
const isMobile = ref(window.innerWidth < 1025)
const sidebarPreference = { desktop: isMobile.value ? true : uiStore.asideShow, mobile: isMobile.value ? uiStore.asideShow : false }
let resizing = false
watch(() => uiStore.asideShow, show => {
  if (!resizing) sidebarPreference[isMobile.value ? 'mobile' : 'desktop'] = show
}, { flush: 'sync' })
const handleResize = () => {
  const mobile = window.innerWidth < 1025
  if (mobile === isMobile.value) return
  resizing = true
  isMobile.value = mobile
  uiStore.asideShow = sidebarPreference[mobile ? 'mobile' : 'desktop']
  resizing = false
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  uiStore.writerRef = null
  const emailStore = useEmailStore()
  emailStore.emailScroll = emailStore.starScroll = emailStore.sendScroll = null
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: all 100ms ease;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: all 100ms ease;
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  transition: all 100ms ease;
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
}

.main-container {
  min-height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0 0 0 0;
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: all 0.3s;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}
</style>
