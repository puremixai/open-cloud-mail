<template>
    <div class="w95-idcard" :class="{ bank: idcardBank, dragging: dragging }" ref="cardRef"
         :style="idcardStyle" @pointerdown="onIdcardDown" @pointermove="onIdcardMove"
         @pointerup="onIdcardUp" @pointercancel="onIdcardUp" @lostpointercapture="onIdcardUp">
      <button type="button" class="w95-idcard-style" @click.stop="switchIdcardStyle" :aria-label="flipLabel" :title="flipLabel">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1.5 3.5h7M6 1l2.5 2.5L6 6" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <path d="M10.5 8.5h-7M6 11L3.5 8.5 6 6" fill="none" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </button>
      <button type="button" class="w95-idcard-close" @click.stop="$emit('close')" :aria-label="$t('win95Close')" :title="$t('win95Close')">
        <svg width="9" height="9" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <div class="w95-idcard-flip" :class="{ bank: idcardBank }">
        <!-- 正面：票据 -->
        <div class="w95-idcard-face w95-idcard-front" :inert="idcardBank || detailsOpen ? '' : null" :aria-hidden="idcardBank || detailsOpen">
          <div class="w95-idcard-head">
            <span class="w95-idcard-mono" aria-hidden="true">{{ idcardMono }}</span>
            <span class="w95-idcard-brand" :title="settingStore.siteTitle">{{ settingStore.siteTitle }}</span>
          </div>
          <div class="w95-idcard-primary">
            <div class="w95-idcard-label">{{ $t('win95IdcardEmailLabel') }}</div>
            <IdcardEmail :email="email" :state="copyState" :expanded="detailsOpen" @copy="copyEmail" @details="showDetails" />
            <div class="w95-idcard-no">ID · {{ userStore.user.userId }}</div>
          </div>
          <div class="w95-idcard-dash"></div>
          <div class="w95-idcard-foot">{{ $t('win95IdcardWish') }}</div>
        </div>
        <!-- 背面：银行卡（低多边形花纹 + 品牌右上 + 掩码卡号） -->
        <div class="w95-idcard-face w95-idcard-back" :inert="!idcardBank || detailsOpen ? '' : null" :aria-hidden="!idcardBank || detailsOpen">
          <svg class="w95-bank-svg" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="w95BankFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#0d5c66" stop-opacity="0"/>
                <stop offset="1" stop-color="#0d5c66" stop-opacity="0.55"/>
              </linearGradient>
            </defs>
            <polygon points="0,0 340,0 150,214" fill="rgba(255,255,255,0.05)"/>
            <polygon points="340,0 340,214 150,214" fill="rgba(0,0,0,0.06)"/>
            <polygon points="0,0 150,214 0,214" fill="rgba(0,0,0,0.04)"/>
            <!-- 低多边形信封 -->
            <polygon points="26,64 112,64 112,130" fill="#9fd8d6"/>
            <polygon points="112,64 198,64 112,130" fill="#5cb8bd"/>
            <polygon points="26,64 112,130 26,170" fill="#178a94"/>
            <polygon points="198,64 198,170 112,130" fill="#0f6a75"/>
            <polygon points="112,130 198,170 26,170" fill="#0b4f58"/>
            <polygon points="26,64 64,64 45,100" fill="#6fc4c6"/>
            <polygon points="160,64 198,64 178,104" fill="#2a9aa3"/>
            <polygon points="26,170 60,170 40,140" fill="#2a9aa3"/>
            <polygon points="170,170 198,170 184,136" fill="#14808c"/>
            <polygon points="216,52 236,60 220,70" fill="#9fd8d6" opacity=".8"/>
            <polygon points="246,84 258,76 256,92" fill="#5cb8bd" opacity=".7"/>
            <polygon points="208,96 220,92 214,104" fill="#ffffff" opacity=".5"/>
            <polygon points="228,140 244,132 240,152" fill="#9fd8d6" opacity=".35"/>
            <polygon points="258,118 268,114 265,128" fill="#ffffff" opacity=".3"/>
            <polygon points="226,176 242,170 236,188" fill="#5cb8bd" opacity=".4"/>
            <polygon points="150,0 340,0 340,214 150,214" fill="url(#w95BankFade)"/>
          </svg>
          <div class="w95-bank-brand">
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.4" y="3.4" width="9.2" height="9.2" fill="#e4342f" transform="rotate(45 8 8)"/>
              <path d="M5 6.4h6v3.2H5z" fill="#fff"/>
              <path d="M5 6.4l3 1.8 3-1.8" stroke="#e4342f" stroke-width=".7" fill="none"/>
            </svg>
            <span :title="settingStore.siteTitle">{{ settingStore.siteTitle }}</span>
          </div>
          <div class="w95-bank-tier">{{ $t('idcardDeptValue') }}</div>
          <span class="w95-bank-holo" aria-hidden="true"></span>
          <svg class="w95-bank-wave" width="26" height="26" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3a7.5 7.5 0 0 1 0 10M8 4.5a5.5 5.5 0 0 1 0 7M11 6a3.5 3.5 0 0 1 0 4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
          </svg>
          <div class="w95-bank-num">{{ bankNum }}</div>
          <div class="w95-bank-meta">
            <span class="w95-bank-name" :title="userStore.user.name">{{ userStore.user.name || '—' }}</span>
            <span class="w95-bank-valid">{{ $t('win95IdcardValidThru') }} {{ bankValid }}</span>
          </div>
          <IdcardEmail class="w95-bank-email" :email="email" :state="copyState" :expanded="detailsOpen" @copy="copyEmail" @details="showDetails" />
          <div class="w95-bank-circles" aria-hidden="true"><i></i><i></i></div>
        </div>
      </div>
      <section v-if="detailsOpen" id="w95-email-details" class="w95-email-details" aria-labelledby="w95-email-heading" @keydown.esc.stop="hideDetails()">
        <div class="w95-email-details-head">
          <label id="w95-email-heading" for="w95-email-value">{{ $t('win95IdcardFullEmail') }}</label>
          <button type="button" :aria-label="$t('win95Close')" @click.stop="hideDetails()">×</button>
        </div>
        <textarea id="w95-email-value" ref="emailField" :value="email" readonly dir="ltr" spellcheck="false" rows="2" />
        <div class="w95-email-details-foot">
          <span>{{ $t(copyState === 'error' ? 'win95IdcardCopyFailed' : 'win95IdcardSelectEmail') }}</span>
          <button type="button" :disabled="!email || copyState === 'copying'" @click.stop="copyEmail">
            {{ $t(copyState === 'copied' ? 'win95IdcardCopyEmailTip' : 'win95IdcardCopyEmail') }}
          </button>
        </div>
      </section>
      <span class="w95-idcard-announcement" role="status" aria-live="polite">{{ copyState === 'copied' ? $t('win95IdcardCopyEmailTip') : copyState === 'error' ? $t('win95IdcardCopyFailed') : '' }}</span>
    </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/store/setting.js'
import { useUserStore } from '@/store/user.js'
import IdcardEmail from './idcard-email.vue'

const { t } = useI18n()
const settingStore = useSettingStore()
const userStore = useUserStore()
defineEmits(['close'])
const cardRef = ref(null)
const emailField = ref(null)
const email = computed(() => userStore.user?.email || '')
const idcardBank = ref(localStorage.getItem('w95-idcard-style') === 'bank')
const flipLabel = computed(() => t(idcardBank.value ? 'win95IdcardShowFront' : 'win95IdcardShowBack'))
const detailsOpen = ref(false)
const copyState = ref('')
let copyTimer
let copyAttempt = 0
let detailsTrigger
let disposed = false

function switchIdcardStyle() {
  hideDetails(false)
  idcardBank.value = !idcardBank.value
  localStorage.setItem('w95-idcard-style', idcardBank.value ? 'bank' : 'ticket')
}

async function showDetails(event) {
  detailsTrigger = event?.currentTarget || cardRef.value?.querySelector(idcardBank.value ? '.w95-idcard-back .w95-email-more' : '.w95-idcard-front .w95-email-more')
  detailsOpen.value = true
  await nextTick()
  emailField.value?.focus()
  emailField.value?.select()
}

function hideDetails(restoreFocus = true) {
  if (!detailsOpen.value) return
  detailsOpen.value = false
  if (restoreFocus) nextTick(() => detailsTrigger?.focus())
}

function dismissDetails(event) {
  if (!cardRef.value?.contains(event.target)) hideDetails(false)
}

async function copyEmail() {
  if (!email.value || copyState.value === 'copying') return
  clearTimeout(copyTimer)
  const attempt = ++copyAttempt
  copyState.value = 'copying'
  try {
    await navigator.clipboard.writeText(email.value)
    if (disposed || attempt !== copyAttempt) return
    copyState.value = 'copied'
    copyTimer = setTimeout(() => { copyState.value = '' }, 1500)
  } catch {
    if (disposed || attempt !== copyAttempt) return
    copyState.value = 'error'
    showDetails()
  }
}

watch(email, () => {
  ++copyAttempt
  clearTimeout(copyTimer)
  copyState.value = ''
  hideDetails(false)
})

/* 银行卡样式下的掩码卡号：16 位分组，仅末 4 位为用户 ID（补零） */
const bankNum = computed(() => {
  const id = String(userStore.user?.userId ?? '')
  const tail = id.padStart(4, '0').slice(-4)
  return `•••• •••• •••• ${tail}`
})

/* VALID THRU：入学年份 + 四年学制 → MM/YY */
const bankValid = computed(() => {
  const raw = userStore.user?.account?.createTime || ''
  if (!raw) return '--/--'
  const [y, m] = raw.slice(0, 10).split('-')
  return `${m}/${String(Number(y) + 4).slice(-2)}`
})

/* 票据正面右上角的姓名首字圆章 */
const idcardMono = computed(() => (userStore.user?.name || 'M').trim().charAt(0).toUpperCase() || 'M')

/* Card coordinates are relative to the desktop, which excludes the taskbar. */
const idcardPos = reactive({ x: null, y: null })
const dragging = ref(false)
let pointerDrag = null
let resizeObserver
const idcardStyle = computed(() => idcardPos.x === null ? null : {
  left: idcardPos.x + 'px', top: idcardPos.y + 'px', right: 'auto'
})

function placeCard(x, y) {
  const card = cardRef.value
  const desktop = card?.parentElement
  if (!desktop) return
  const margin = 8
  idcardPos.x = Math.max(margin, Math.min(desktop.clientWidth - card.offsetWidth - margin, x))
  idcardPos.y = Math.max(margin, Math.min(desktop.clientHeight - card.offsetHeight - margin, y))
}

function rememberPosition() {
  if (idcardPos.x !== null) localStorage.setItem('w95-idcard-pos', JSON.stringify({ x: idcardPos.x, y: idcardPos.y }))
}

function keepCardVisible() {
  const card = cardRef.value
  if (!card) return
  placeCard(idcardPos.x ?? card.offsetLeft, idcardPos.y ?? card.offsetTop)
  rememberPosition()
}

function onIdcardDown(event) {
  if (!event.isPrimary || event.button !== 0 || event.target.closest('button, input, textarea, a')) return
  if (detailsOpen.value) return
  const card = cardRef.value
  pointerDrag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: card.offsetLeft, y: card.offsetTop }
  card.setPointerCapture(event.pointerId)
}

function onIdcardMove(event) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return
  const dx = event.clientX - pointerDrag.sx
  const dy = event.clientY - pointerDrag.sy
  if (!dragging.value && Math.hypot(dx, dy) < 4) return
  dragging.value = true
  placeCard(pointerDrag.x + dx, pointerDrag.y + dy)
}

function onIdcardUp(event) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return
  const id = pointerDrag.id
  pointerDrag = null
  if (dragging.value) rememberPosition()
  dragging.value = false
  if (cardRef.value?.hasPointerCapture(id)) cardRef.value.releasePointerCapture(id)
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('w95-idcard-pos') || 'null')
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) placeCard(saved.x, saved.y)
  } catch { /* Ignore invalid saved positions. */ }
  keepCardVisible()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(keepCardVisible)
    resizeObserver.observe(cardRef.value.parentElement)
    resizeObserver.observe(cardRef.value)
  }
  window.addEventListener('resize', keepCardVisible)
  document.addEventListener('pointerdown', dismissDetails)
})

onBeforeUnmount(() => {
  disposed = true
  ++copyAttempt
  clearTimeout(copyTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', keepCardVisible)
  document.removeEventListener('pointerdown', dismissDetails)
})
</script>
