<template>
  <div v-if="uiStore.win95" class="w95-desktop" @click="desktopClick">
    <!-- 桌面图标（整齐竖排一列） -->
    <div class="w95-dicon" :class="{ sel: iconSel === 'mail' }"
         style="left: 14px; top: 12px"
         @click.stop="iconSel = 'mail'" @dblclick.stop="iconSel = ''; openMail()">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <rect x="3" y="7" width="26" height="18" fill="#fff" stroke="#000"/>
        <path d="M3 7l13 9 13-9" fill="none" stroke="#000"/>
        <path d="M3 25l10-8M29 25l-10-8" stroke="#000" fill="none"/>
      </svg>
      <span>{{ $t('inbox') }}</span>
    </div>
    <div class="w95-dicon" :class="{ sel: iconSel === 'bin' }"
         style="left: 14px; top: 96px"
         @click.stop="iconSel = 'bin'" @dblclick.stop="iconSel = ''; openBin()">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <path d="M10 4h12l1 4H9z" fill="#dfdfdf" stroke="#000"/>
        <rect x="8" y="8" width="16" height="20" fill="#c0c0c0" stroke="#000"/>
        <path d="M12 12v12M16 12v12M20 12v12" stroke="#808080"/>
      </svg>
      <span>{{ $t('win95RecycleBin') }}</span>
    </div>
    <div class="w95-dicon" :class="{ sel: iconSel === 'site' }"
         style="left: 14px; top: 180px"
         @click.stop="iconSel = 'site'" @dblclick.stop="iconSel = ''; openSite()">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="#1e6fd9" stroke="#000"/>
        <ellipse cx="16" cy="16" rx="12" ry="4.6" fill="none" stroke="#fff"/>
        <path d="M16 4v24" stroke="#fff" fill="none"/>
        <path d="M6.4 11c6 3.4 13.2 3.4 19.2 0M6.4 21c6-3.4 13.2-3.4 19.2 0" fill="none" stroke="#fff"/>
      </svg>
      <span>{{ $t('win95Homepage') }}</span>
    </div>

    <!-- 用户身份卡（票据样式，默认显示；点击复制用户 ID，右上角 × 可关闭） -->
    <div class="w95-idcard" v-if="userStore.user && !idcardClosed" @click="copyUserId"
         :title="$t('win95IdcardCopyTip')">
      <span class="w95-idcard-close" @click.stop="closeIdcard">×</span>
      <span class="w95-idcard-tag">{{ $t('win95IdcardTag') }}</span>
      <div class="w95-idcard-head">
        <span class="w95-idcard-brand">{{ settingStore.settings.title || 'MAIL' }}</span>
      </div>
      <div class="w95-idcard-email" :title="$t('win95IdcardCopyEmailTip')"
           @click.stop="copyText(userStore.user.email, 'win95IdcardCopyEmailTip')">{{ userStore.user.email }}</div>
      <div class="w95-idcard-no">ID · {{ userStore.user.userId }}</div>
      <div class="w95-idcard-dash"></div>
      <div class="w95-idcard-foot">{{ $t('win95IdcardWish') }}</div>
    </div>

    <div class="w95-dicon" :class="{ sel: iconSel === 'idcard' }"
         style="left: 14px; top: 264px"
         @click.stop="iconSel = 'idcard'" @dblclick.stop="iconSel = ''; idcardClosed = false">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <rect x="4" y="6" width="24" height="20" fill="#fff" stroke="#000"/>
        <circle cx="11" cy="13" r="3" fill="#808080"/>
        <path d="M17 11h8M17 15h8M8 20h16" stroke="#000" fill="none"/>
      </svg>
      <span>{{ $t('win95Idcard') }}</span>
    </div>

    <!-- 主窗口：可拖动 / 最小化 / 最大化 / 关闭 -->
    <div
        v-show="!winClosed"
        ref="winRef"
        class="w95-window"
        :class="{ maximized, hidden: minimized }"
        :style="winStyle"
    >
      <div class="w95-titlebar" @mousedown="onTitlebarDown" @dblclick="toggleMax">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="1.5" y="3.5" width="13" height="9" fill="#fff" stroke="#000"/>
          <path d="M1.5 3.5L8 8.5l6.5-5" fill="none" stroke="#000"/>
        </svg>
        <span class="ttext">{{ windowTitle }}</span>
        <span class="tbtns">
          <button class="w95-tbtn" :title="$t('win95Min')" @click.stop="minimize">
            <svg width="8" height="8" viewBox="0 0 8 8"><rect x="1" y="5" width="5" height="2" fill="#000"/></svg>
          </button>
          <button class="w95-tbtn" :title="maximized ? $t('win95Restore') : $t('win95Max')" @click.stop="toggleMax">
            <svg v-if="maximized" width="9" height="9" viewBox="0 0 9 9">
              <rect x="0.5" y="2.5" width="6" height="5.5" fill="none" stroke="#000"/>
              <path d="M2.5 2.5v-2h6v5.5h-2" fill="none" stroke="#000"/>
            </svg>
            <svg v-else width="9" height="9" viewBox="0 0 9 9">
              <rect x="0.5" y="0.5" width="8" height="7" fill="none" stroke="#000"/>
              <rect x="0.5" y="0.5" width="8" height="2" fill="#000"/>
            </svg>
          </button>
          <button class="w95-tbtn" :title="$t('win95Close')" @click.stop="closeWin">
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1l6 6M7 1L1 7" stroke="#000" stroke-width="1.4"/></svg>
          </button>
        </span>
      </div>

      <!-- 菜单栏 -->
      <div class="w95-menubar">
      <span
          v-for="(menu, mi) in menus"
          :key="menu.label"
          class="w95-menu-item"
          :class="{ open: openIndex === mi }"
          @click.stop="toggleMenu(mi)"
          @mouseenter="hoverMenu(mi)"
      >
        {{ menu.label }}
        <span class="w95-dropdown" v-show="openIndex === mi">
          <template v-for="(item, ii) in menu.items" :key="ii">
            <div v-if="item.sep" class="w95-dsep"></div>
            <div
                v-else
                class="w95-ditem"
                :class="{ disabled: item.off }"
                @click.stop="runItem(item)"
            >{{ item.t }}</div>
          </template>
        </span>
      </span>
      </div>

      <!-- 内容区 -->
      <div class="w95-body">
        <slot/>
      </div>

      <!-- 状态栏 -->
      <div class="w95-statusbar">
        <span class="w95-sfield stretch">{{ statusText }}</span>
      </div>
    </div>

    <!-- 开始菜单 -->
    <div class="w95-startmenu" v-show="startOpen" @click.stop>
      <div class="w95-sm-side">Windows<span class="w95-sm-95">&nbsp;95</span></div>
      <div class="w95-sm-items">
        <div class="w95-sm-item" @click.stop="startProfile">
          <svg width="18" height="18" viewBox="0 0 16 16">
            <circle cx="8" cy="4.4" r="2.9" fill="#ffd29c" stroke="#000"/>
            <path d="M2.6 14.2c.5-3.4 2.5-4.9 5.4-4.9s4.9 1.5 5.4 4.9z" fill="#000080" stroke="#000"/>
          </svg>
          {{ $t('settings') }}
        </div>
        <div class="w95-dsep"></div>
        <div class="w95-sm-item" @click.stop="startMail">
          <svg width="18" height="18" viewBox="0 0 16 16">
            <rect x="1.5" y="3.5" width="13" height="9" fill="#fff" stroke="#000"/>
            <path d="M1.5 3.5L8 8.5l6.5-5" fill="none" stroke="#000"/>
          </svg>
          {{ $t('inbox') }}
        </div>
        <div class="w95-dsep"></div>
        <div class="w95-sm-item" @click.stop="startAbout">
          <svg width="18" height="18" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="#0000dd" stroke="#000"/>
            <text x="8" y="11.5" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold">?</text>
          </svg>
          {{ $t('about') }}
        </div>
        <div class="w95-dsep"></div>
        <div class="w95-sm-item" @click.stop="startTheme">
          <svg width="18" height="18" viewBox="0 0 16 16">
            <rect x="1.5" y="1.8" width="13" height="9.4" fill="#c0c0c0" stroke="#000"/>
            <path d="M3 3.4h10v6.2H3z" fill="#1e6fd9"/>
            <path d="M3 3.4h5v6.2H3z" fill="#000080"/>
            <rect x="5.8" y="12.8" width="4.4" height="1.2" fill="#808080"/>
            <rect x="3.8" y="14" width="8.4" height="1.4" fill="#c0c0c0" stroke="#000"/>
          </svg>
          {{ $t('win95SwitchTheme') }}
        </div>
        <div class="w95-dsep"></div>
        <div class="w95-sm-item" @click.stop="startShutdown">
          <svg width="18" height="18" viewBox="0 0 16 16">
            <path d="M8 1v6" stroke="#000" stroke-width="1.8"/>
            <path d="M4 3a6.5 6.5 0 1 0 8 0" fill="none" stroke="#000" stroke-width="1.8"/>
          </svg>
          {{ $t('win95Shutdown') }}
        </div>
      </div>
    </div>

    <!-- 任务栏 -->
    <div class="w95-taskbar" @click.stop>
      <button class="w95-btn w95-startbtn" :class="{ on: startOpen }" @click="startOpen = !startOpen">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M1 3.5l6-1v5H1zM8 2.3l7-1.2v6H8zM1 8.5h6v5l-6-1z" fill="#ff3b30" stroke="#a00" stroke-width=".5"/>
          <path d="M8 8.5h7v6l-7-1.2z" fill="#3bc44b" stroke="#080" stroke-width=".5"/>
        </svg>
        {{ $t('win95Start') }}
      </button>
      <div class="w95-tasks">
        <button v-if="!winClosed" class="w95-btn w95-taskbtn" :class="{ on: !minimized }" @click="taskClick">
          <svg width="14" height="14" viewBox="0 0 16 16">
            <rect x="1.5" y="3.5" width="13" height="9" fill="#fff" stroke="#000"/>
            <path d="M1.5 3.5L8 8.5l6.5-5" fill="none" stroke="#000"/>
          </svg>
          {{ windowTitle }}
        </button>
      </div>
      <div class="w95-tray">
        <svg width="14" height="14" viewBox="0 0 16 16">
          <path d="M2 11v-1l2-1 1-4h6l1 4 2 1v1z" fill="#c0c0c0" stroke="#404040"/>
        </svg>
        <svg width="14" height="14" viewBox="0 0 16 16">
          <path d="M8 2a5 5 0 0 1 5 5h-1.6A3.4 3.4 0 0 0 8 3.6z" fill="#404040"/>
          <path d="M8 4.5A2.5 2.5 0 0 1 10.5 7H9.2A1.2 1.2 0 0 0 8 5.8z" fill="#404040"/>
          <circle cx="8" cy="12.5" r="1.2" fill="#404040"/>
        </svg>
        <span class="w95-clock">{{ clock }}</span>
      </div>
    </div>

    <!-- 关机画面彩蛋 -->
    <div class="w95-shutdown" v-show="shutdownScreen" @click="shutdownScreen = false">
      {{ $t('win95ShutdownScreen') }}
    </div>
  </div>
  <!-- 非 Win95 模式：原样透传 -->
  <slot v-else/>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/store/ui.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useUserStore } from '@/store/user.js'
import { hasPerm } from '@/perm/perm.js'
import { logout } from '@/request/login.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const userStore = useUserStore()

const openIndex = ref(-1)
const clock = ref('')
let clockTimer = null

/* ---- 窗口状态：位置 / 最大化 / 最小化 ---- */
const winRef = ref(null)
const win = reactive({ x: 60, y: 26, w: 900, h: 600 })
const maximized = ref(false)
const minimized = ref(false)
const startOpen = ref(false)
const shutdownScreen = ref(false)
const iconSel = ref('')
/* 用户身份卡关闭状态（持久化；桌面「身份卡」图标双击可重新打开） */
const idcardClosed = ref(localStorage.getItem('w95-idcard-closed') === '1')

function closeIdcard() {
  idcardClosed.value = true
  localStorage.setItem('w95-idcard-closed', '1')
}

function copyText(text, tipKey) {
  navigator.clipboard.writeText(String(text)).then(() => {
    ElMessage({ message: t(tipKey), type: 'success', plain: true })
  })
}

function copyUserId() {
  copyText(userStore.user.userId, 'win95IdcardCopyTip')
}
/* 邮箱窗口已关闭（Win95 关闭应用语义：窗口与任务栏按钮消失，桌面/开始菜单可重开） */
const winClosed = ref(false)
/* 因视口过小而自动最大化（视口恢复后自动还原，不干扰手动最大化） */
const autoMaxed = ref(false)

let drag = null
let resizeTimer = null

const winStyle = computed(() => {
  if (maximized.value) return {}
  return { left: win.x + 'px', top: win.y + 'px', width: win.w + 'px', height: win.h + 'px' }
})

function isSmallViewport() {
  return window.innerWidth < 1000 || window.innerHeight < 640
}

function initWindowSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (isSmallViewport()) {
    maximized.value = true
    autoMaxed.value = true
    return
  }
  win.w = Math.min(920, vw - 60)
  win.h = Math.min(620, vh - 110)
  win.x = Math.max(10, (vw - win.w) / 2 - 14)
  win.y = Math.max(6, (vh - 28 - win.h) / 2 - 12)
}

function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (isSmallViewport()) {
      if (!maximized.value) {
        maximized.value = true
        autoMaxed.value = true
      }
    } else if (autoMaxed.value) {
      maximized.value = false
      autoMaxed.value = false
      initWindowSize()
    }
  }, 150)
}

function onTitlebarDown(e) {
  if (e.target.closest('.w95-tbtn')) return
  if (maximized.value) return
  drag = { dx: e.clientX - win.x, dy: e.clientY - win.y }
  e.preventDefault()
}

function onMove(e) {
  if (!drag) return
  const el = winRef.value?.parentElement
  if (!el) return
  win.x = Math.min(Math.max(e.clientX - drag.dx, -win.w + 120), el.clientWidth - 120)
  win.y = Math.min(Math.max(e.clientY - drag.dy, 0), el.clientHeight - 40)
}

function onUp() {
  drag = null
}

function toggleMax() {
  maximized.value = !maximized.value
  /* 手动切换后，resize 不再自动跟随视口大小 */
  autoMaxed.value = false
}

function minimize() {
  minimized.value = true
}

/* 打开（或恢复）邮箱窗口：桌面图标双击 / 开始菜单收件箱 */
function openMail() {
  winClosed.value = false
  minimized.value = false
  startOpen.value = false
}

/* 标题栏右上角 ✕：关闭邮箱窗口（不退出 Win95 模式） */
function closeWin() {
  winClosed.value = true
  minimized.value = false
  openIndex.value = -1
  startOpen.value = false
}

function taskClick() {
  minimized.value = !minimized.value
}

function desktopClick() {
  iconSel.value = ''
}

function openBin() {
  ElMessageBox.alert(t('win95BinEmpty'), t('win95RecycleBin'), { confirmButtonText: t('confirm') })
}

function openSite() {
  ElMessage({
    message: t('win95UnderConstruction'),
    type: 'info',
    plain: true,
  })
}

function startProfile() {
  startOpen.value = false
  openMail()
  router.push({ name: 'setting' })
}

function startMail() {
  startOpen.value = false
  openMail()
}

function startAbout() {
  startOpen.value = false
  showAbout()
}

/* 切换主题：退出 Win95 复古模式，回到现代界面 */
function startTheme() {
  startOpen.value = false
  ElMessageBox.confirm(t('win95ExitConfirm'), t('win95SwitchTheme'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
  }).then(() => {
    uiStore.win95 = false
    uiStore.dark = uiStore.prevDark
    document.documentElement.setAttribute('class', uiStore.dark ? 'dark' : '')
    document.getElementById('theme-color-meta')
        ?.setAttribute('content', uiStore.dark ? '#000000' : '#F1F1F1')
  }).catch(() => {})
}

function startShutdown() {
  startOpen.value = false
  ElMessageBox.confirm(t('win95ShutdownConfirm'), t('win95Shutdown'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
  }).then(() => {
    shutdownScreen.value = true
  }).catch(() => {})
}

/* 仅在收件箱页且列表已挂载时，编辑类菜单可用 */
const onInbox = computed(() => route.meta?.name === 'email' && !!emailStore.emailScroll)

/* 当前页面对应的虚拟列表（用于刷新） */
const activeScroll = computed(() => {
  const name = route.meta?.name
  if (name === 'star') return emailStore.starScroll
  if (name === 'send') return emailStore.sendScroll
  return emailStore.emailScroll
})

const windowTitle = computed(() => {
  const page = route.meta?.title ? t(route.meta.title) : ''
  const title = settingStore.settings.title || 'Mail'
  return page ? `${page} - ${title}` : title
})

const statusText = computed(() => {
  const page = route.meta?.title ? t(route.meta.title) : t('win95Ready')
  const total = activeScroll.value?.total
  return total ? `${page}　${t('emailCount', { total })}` : page
})

const menus = computed(() => [
  {
    label: t('menuFile'),
    items: [
      { t: t('newMail'), a: () => uiStore.writerRef?.open?.() },
      { sep: true },
      { t: t('logOut'), a: clickLogout },
    ],
  },
  {
    label: t('menuEdit'),
    items: [
      { t: t('selectAll'), a: () => emailStore.emailScroll?.handleCheckAllChange?.(true), off: !onInbox.value },
      { t: t('selectNone'), a: () => emailStore.emailScroll?.handleCheckAllChange?.(false), off: !onInbox.value },
      { sep: true },
      { t: t('markRead'), a: () => emailStore.emailScroll?.handleRead?.(), off: !onInbox.value },
    ],
  },
  {
    label: t('menuView'),
    items: [
      { t: t('refreshList'), a: () => activeScroll.value?.refreshList?.() },
      { t: t('accountPanel'), a: () => { uiStore.accountShow = !uiStore.accountShow } },
    ],
  },
  {
    label: t('menuGoto'),
    items: [
      { t: t('inbox'), a: () => router.push({ name: 'email' }) },
      { t: t('sent'), a: () => router.push({ name: 'send' }), off: !hasPerm('email:send') },
      { t: t('drafts'), a: () => router.push({ name: 'draft' }), off: !hasPerm('email:send') },
      { t: t('starred'), a: () => router.push({ name: 'star' }) },
      { t: t('settings'), a: () => router.push({ name: 'setting' }) },
    ],
  },
  {
    label: t('menuFav'),
    items: [
      { t: t('starred'), a: () => router.push({ name: 'star' }) },
      { t: t('allMail'), a: () => router.push({ name: 'all-email' }), off: !hasPerm('all-email:query') },
    ],
  },
  {
    label: t('menuHelp'),
    items: [
      { t: t('about'), a: showAbout },
    ],
  },
])

function toggleMenu(mi) {
  openIndex.value = openIndex.value === mi ? -1 : mi
}

function hoverMenu(mi) {
  if (openIndex.value !== -1 && openIndex.value !== mi) {
    openIndex.value = mi
  }
}

function runItem(item) {
  if (item.off) return
  openIndex.value = -1
  item.a?.()
}

function showAbout() {
  ElMessageBox.alert(
      `${settingStore.settings.title || 'Mail'} — ${t('win95AboutBody')}`,
      t('about'),
      { confirmButtonText: t('confirm') }
  )
}

function clickLogout() {
  logout().then(() => {
    localStorage.removeItem('token')
    router.replace('/login')
  })
}

function tick() {
  const d = new Date()
  clock.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function onDocClick() {
  openIndex.value = -1
  startOpen.value = false
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  openIndex.value = -1
  startOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', handleResize)
  initWindowSize()
  tick()
  clockTimer = setInterval(tick, 10000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', handleResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  clearInterval(clockTimer)
})
</script>
