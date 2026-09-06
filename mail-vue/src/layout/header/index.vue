<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger :is-active="uiStore.asideShow" @toggle-click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <IconButton v-perm="'email:send'" class="writer-box" action="compose" :label="$t('newMail')" @click="openSend">
      <span class="writer-label">{{ $t('newMail') }}</span>
    </IconButton>
    <div class="toolbar">
      <button v-if="['email','star','send','content'].includes(route.name)" type="button" class="reading-pane-toggle" :aria-pressed="uiStore.readingPane" @click="toggleReadingPane">{{ t('ux.readingPane') }}</button>
      <button type="button" class="keyboard-help-button" @click="helpOpen = true">{{ t('ux.keyboardHelp') }}</button>
      <template v-if="!uiStore.win95">
        <IconButton :action="uiStore.dark ? 'sun' : 'moon'" :label="$t(uiStore.dark ? 'ux.lightTheme' : 'ux.darkTheme')" @click="openDark" />
        <IconButton action="monitor" :label="$t('win95Mode')" @click="openWin95" />
      </template>
      <IconButton action="notice" :label="$t('noticeTitle')" @click="openNotice" />
      <el-dropdown trigger="click" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <button type="button" class="avatar" :aria-label="$t('ux.accountMenu')" :aria-expanded="userInfoShow">
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </button>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar">
              {{ formatName(userStore.user.email) }}
            </div>
            <div class="user-name">
              {{ userStore.user.name }}
            </div>
            <button type="button" class="detail-email" :title="$t('ux.copyEmail')" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </button>
            <div class="detail-user-type">
              <el-tag>{{ userStore.user.role.name }}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{ $t('sendCount') }}</span>
                <span style="margin-right: 10px">{{ $t('accountCount') }}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px">{{ sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')">{{ sendType }}</el-tag>
                  <el-tag v-else>{{ sendType }}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')"
                        style="margin-right: 5px">{{ $t('totalUserAccount', {msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')">{{ $t('unlimited') }}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')">{{ $t('unauthorized') }}</el-tag>
                </div>
              </div>
            </div>
            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
  <el-dialog v-model="helpOpen" :title="t('ux.keyboardHelp')" width="min(420px, calc(100vw - 32px))" append-to-body>
    <dl class="keyboard-help">
      <div><dt>{{ t('ux.shortcutSearch') }}</dt><dd><kbd>/</kbd></dd></div>
      <div><dt>{{ t('ux.shortcutCompose') }}</dt><dd><kbd>C</kbd></dd></div>
      <div><dt>{{ t('ux.shortcutNext') }}</dt><dd><kbd>J</kbd> / <kbd>K</kbd></dd></div>
      <div><dt>{{ t('ux.shortcutClose') }}</dt><dd><kbd>Esc</kbd></dd></div>
    </dl><p class="shortcut-hint">{{ t('ux.shortcutHint') }}</p>
  </el-dialog>
</template>

<script setup>
import IconButton from '@/components/icon-button/index.vue';
import hanburger from '@/components/hamburger/index.vue'
import {logoutSession} from '@/utils/session.js';
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute, useRouter} from "vue-router";
import {useEmailStore} from '@/store/email.js';
import {computed, ref, onMounted, onBeforeUnmount} from "vue";
import { isEditingTarget } from '@/utils/mail-navigation.js'
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";

const {t} = useI18n();
const route = useRoute();
const router = useRouter();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const helpOpen = ref(false)
function toggleReadingPane() {
  uiStore.readingPane = !uiStore.readingPane
  const { source, email } = useEmailStore().contentData
  if (uiStore.readingPane && route.name === 'content' && ['email', 'star', 'send'].includes(source)) {
    router.replace({ name: source, query: email?.emailId ? { message: email.emailId } : {} })
  }
}
function shortcuts(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || isEditingTarget(event.target) || helpOpen.value) return
  if ([...document.querySelectorAll('[role="dialog"]')].some(el => el.getClientRects().length)) return
  if (event.key === '/') {
    const search = document.querySelector('#inbox-search-input')
    if (search) { event.preventDefault(); search.focus(); search.select() }
  }
  if (event.key.toLowerCase() === 'c' && hasPerm('email:send')) { event.preventDefault(); openSend() }
  if (event.key === '?') { event.preventDefault(); helpOpen.value = true }
}
onMounted(() => window.addEventListener('keydown', shortcuts))
onBeforeUnmount(() => window.removeEventListener('keydown', shortcuts))

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})


async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}


function openNotice() {
  uiStore.showNotice()
}

function transitionTheme(e, flag, apply) {
  const root = document.documentElement

  if (!document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    apply(root);
    return
  }

  const rect = e.currentTarget?.getBoundingClientRect()
  const x = e.clientX || (rect ? rect.left + rect.width / 2 : window.innerWidth / 2)
  const y = e.clientY || (rect ? rect.top + rect.height / 2 : window.innerHeight / 2)

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', flag)
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    apply(root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function openDark(e) {
  const nextIsDark = !uiStore.dark
  transitionTheme(e, nextIsDark ? 'dark' : 'light', (root) => switchDark(nextIsDark, root));
}

function openWin95(e) {
  transitionTheme(e, 'dark', (root) => switchWin95(root))
}

function isMobilePointer() {
  return !window.matchMedia("(pointer: fine) and (hover: hover)").matches
}

function setMetaColor(color) {
  const metaTag = document.getElementById('theme-color-meta');
  metaTag?.setAttribute('content', color)
}

function switchDark(nextIsDark, root) {
  root.setAttribute('class', nextIsDark ? 'dark' : '')
  setMetaColor(nextIsDark ? (isMobilePointer() ? '#141414' : '#000000') : (isMobilePointer() ? '#FFFFFF' : '#F1F1F1'))
  uiStore.dark = nextIsDark
  uiStore.prevDark = nextIsDark
}

function switchWin95(root) {
  uiStore.prevDark = uiStore.dark
  uiStore.dark = false
  uiStore.win95 = true
  root.setAttribute('class', 'win95')
  setMetaColor('#c0c0c0')
}

function openSend() {
  uiStore.writerRef.open()
}

function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

async function clickLogout() {
  if (logoutLoading.value) return
  logoutLoading.value = true
  try { await logoutSession() } catch {} finally { logoutLoading.value = false }
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}


.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 10px;
  grid-template-columns: auto auto 1fr;
}

.header.not-send {
  grid-template-columns: auto 1fr;
}

.writer-box { margin-left: 5px; }

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.breadcrumb-item {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  justify-content: end;
  gap: 15px;
  @media (max-width: 767px) {
    gap: 10px;
  }

  .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: var(--base-fill);
  }

  .notice {
    font-size: 22px;
    margin-right: 4px;
  }

  .dark-icon {
    font-size: 20px;
  }

  .sun-icon {
    font-size: 24px;
  }

  .win95-icon {
    font-size: 20px;
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-text {
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 30px;
      width: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}

.writer-box { align-self: center; color: var(--el-color-primary); }
.avatar { color: inherit; min-height: 32px; }
@media (pointer: coarse) { .avatar { min-height: 44px; } .toolbar { gap: 2px; } }
</style>
