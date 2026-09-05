<template>
  <div class="sid-page">
    <!-- 页头：标题 + 操作 -->
    <div class="sid-head">
      <div class="sid-head-text">
        <h2>{{ $t('idcardTitle') }}</h2>
        <p>{{ $t('idcardSub') }}</p>
      </div>
      <div class="sid-actions">
        <el-button @click="flipped = !flipped">{{ $t('idcardFlip') }}</el-button>
        <el-button @click="copyText(no, 'idcardCopiedNo')">{{ $t('idcardCopyNo') }}</el-button>
        <el-button @click="copyText(email, 'copySuccessMsg')">{{ $t('idcardCopyEmail') }}</el-button>
        <el-button type="primary" @click="printCard">{{ $t('idcardPrint') }}</el-button>
      </div>
    </div>

    <div class="sid-body">
      <!-- 证件舞台：固定 540×340 版式按容器等比缩放，鼠标微倾斜 + 点击翻面 -->
      <div class="sid-stage" ref="stageRef">
        <div class="sid-fit" :style="fitStyle">
          <div class="sid-scaler" :style="scaleStyle">
            <div class="sid-tilt" :style="tiltStyle" @mousemove="onTiltMove" @mouseleave="onTiltLeave">
              <div class="sid-flip" :class="{ on: flipped }" role="button" tabindex="0"
                   :title="$t('idcardFlipHint')" @click="flipped = !flipped"
                   @keydown.enter.prevent="flipped = !flipped" @keydown.space.prevent="flipped = !flipped">

            <!-- 正面 -->
            <div class="sid-face sid-front">
              <!-- 校徽水印 -->
              <svg class="sid-mark" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="29" fill="none" stroke="#8f2b23" stroke-width="2.5"/>
                <circle cx="32" cy="32" r="23.5" fill="none" stroke="#8f2b23" stroke-width="1"/>
                <rect x="24.8" y="24.8" width="14.4" height="14.4" fill="#8f2b23" transform="rotate(45 32 32)"/>
                <path d="M27.4 28.4h9.2v4.4h-9.2z" fill="#fdfaf1"/>
                <circle cx="32" cy="9" r="1.8" fill="#8f2b23"/>
                <circle cx="55" cy="32" r="1.8" fill="#8f2b23"/>
                <circle cx="9" cy="32" r="1.8" fill="#8f2b23"/>
                <circle cx="32" cy="55" r="1.8" fill="#8f2b23"/>
              </svg>

              <!-- 校名横带 -->
              <div class="sid-band">
                <svg class="sid-crest" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="29" fill="rgba(255,255,255,.1)" stroke="#e8c98e" stroke-width="2.5"/>
                  <circle cx="32" cy="32" r="23.5" fill="none" stroke="#e8c98e" stroke-width="1"/>
                  <rect x="24.8" y="24.8" width="14.4" height="14.4" fill="#fdfaf1" transform="rotate(45 32 32)"/>
                  <path d="M27.4 28.4h9.2v4.4h-9.2z" fill="#a63b2c"/>
                  <path d="M27.4 28.4l4.6 2.8 4.6-2.8" stroke="#fff" stroke-width=".8" fill="none"/>
                  <circle cx="32" cy="9" r="1.8" fill="#e8c98e"/>
                  <circle cx="55" cy="32" r="1.8" fill="#e8c98e"/>
                  <circle cx="9" cy="32" r="1.8" fill="#e8c98e"/>
                  <circle cx="32" cy="55" r="1.8" fill="#e8c98e"/>
                </svg>
                <span class="sid-band-school" :style="bandStyle">{{ school }}</span>
                <span class="sid-band-en">{{ $t('idcardEnglish') }}</span>
              </div>

              <!-- 居中题名 -->
              <div class="sid-ribbon"><i></i><span>{{ $t('idcardRibbon') }}</span><i></i></div>

              <!-- 照片 + 信息栏 -->
              <div class="sid-main">
                <div class="sid-photo">
                  <svg viewBox="0 0 18 24" shape-rendering="crispEdges" aria-hidden="true">
                    <defs>
                      <linearGradient id="sidPhotoBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" :stop-color="avatar.bg[0]"/>
                        <stop offset="1" :stop-color="avatar.bg[1]"/>
                      </linearGradient>
                    </defs>
                    <rect width="18" height="24" fill="url(#sidPhotoBg)"/>
                    <rect v-for="(p, i) in avatar.cells" :key="i" :x="p.x" :y="p.y" :width="p.w" :height="p.h" :fill="p.fill"/>
                  </svg>
                </div>
                <div class="sid-rows">
                  <div class="sid-row">
                    <span class="sid-row-k">{{ $t('idcardFieldName') }}</span>
                    <span class="sid-row-v sid-name">{{ name }}</span>
                  </div>
                  <div class="sid-row">
                    <span class="sid-row-k">{{ $t('idcardFieldNo') }}</span>
                    <span class="sid-row-v">{{ no }}</span>
                  </div>
                  <div class="sid-row">
                    <span class="sid-row-k">{{ $t('idcardFieldDept') }}</span>
                    <span class="sid-row-v">{{ dept }}</span>
                  </div>
                  <div class="sid-row">
                    <span class="sid-row-k">{{ $t('idcardFieldEnroll') }}</span>
                    <span class="sid-row-v">{{ enroll || '—' }}</span>
                  </div>
                  <div class="sid-row">
                    <span class="sid-row-k">{{ $t('idcardFieldEmail') }}</span>
                    <span class="sid-row-v sid-email">{{ email }}</span>
                  </div>
                </div>
              </div>

              <!-- 底部：编号 + 条码 + 校训 -->
              <div class="sid-foot">
                <span class="sid-no">NO.{{ no }}</span>
                <svg class="sid-bars" :viewBox="`0 0 ${bars.w} 24`" preserveAspectRatio="none" aria-hidden="true">
                  <rect v-for="(b, i) in bars.list" :key="i" :x="b.x" y="0" :width="b.w" height="24" fill="#2b2a26"/>
                </svg>
                <span class="sid-motto">{{ $t('idcardMotto') }}</span>
              </div>

              <!-- 红色钢印（弧线跨 240°，文字沿传统公章走向环绕） -->
              <svg class="sid-seal" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="56" fill="none" stroke="#c0392b" stroke-width="4"/>
                <circle cx="60" cy="60" r="45" fill="none" stroke="#c0392b" stroke-width="1.5"/>
                <path id="sidSealArc" d="M25.4,80 A40,40 0 1,1 94.6,80" fill="none"/>
                <text fill="#c0392b" :font-size="sealFont" font-weight="700" letter-spacing="1.2">
                  <textPath href="#sidSealArc" startOffset="50%" text-anchor="middle">{{ school }}</textPath>
                </text>
                <path d="M60 44.5 L63.7 55.7 75.5 55.7 66 62.6 69.6 73.8 60 66.9 50.4 73.8 54 62.6 44.5 55.7 56.3 55.7 Z" fill="#c0392b"/>
                <text x="60" y="99" text-anchor="middle" font-size="11" font-weight="700" fill="#c0392b">{{ $t('idcardSealText') }}</text>
              </svg>

              <!-- 毕业纪念章（满四年后出现） -->
              <div class="sid-grad" v-if="graduated">{{ $t('idcardGraduatedStamp') }}</div>
            </div>

            <!-- 背面 -->
            <div class="sid-face sid-back">
              <div class="sid-stripe"><span>CLOUD MAIL STUDENT CARD</span></div>
              <div class="sid-back-main">
                <div class="sid-notes">
                  <div class="sid-notes-title">{{ $t('idcardNotesTitle') }}</div>
                  <p><i>1.</i>{{ $t('idcardNote1') }}</p>
                  <p><i>2.</i>{{ $t('idcardNote2') }}</p>
                  <p><i>3.</i>{{ $t('idcardNote3') }}</p>
                  <p><i>4.</i>{{ $t('idcardNote4') }}</p>
                </div>
                <div class="sid-reg">
                  <div class="sid-notes-title">{{ $t('idcardRegTitle') }}</div>
                  <div class="sid-stamps">
                    <div class="sid-stamp" v-for="(y, i) in stampYears" :key="y" :class="{ ok: i < stamped }">
                      <span>{{ y }}</span>
                      <svg v-if="i < stamped" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10.5" fill="none" stroke="#c0392b" stroke-width="1.6"/>
                        <path d="M7 12.4l3.2 3.2 6.4-6.8" fill="none" stroke="#c0392b" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div class="sid-back-foot">
                <svg class="sid-bars" :viewBox="`0 0 ${bars.w} 24`" preserveAspectRatio="none" aria-hidden="true">
                  <rect v-for="(b, i) in bars.list" :key="i" :x="b.x" y="0" :width="b.w" height="24" fill="#2b2a26"/>
                </svg>
                <span class="sid-back-no">{{ no }}</span>
              </div>
              <div class="sid-lost-line">{{ $t('idcardLost') }}</div>
            </div>
            </div>
            </div>
          </div>
        </div>
        <p class="sid-hint">{{ $t('idcardFlipHint') }}</p>
      </div>

      <!-- 侧栏：证件档案 + 使用说明 -->
      <div class="sid-aside">
        <fieldset class="sid-panel">
          <legend>{{ $t('idcardDossier') }}</legend>
          <div class="sid-item">
            <span>{{ $t('idcardFieldName') }}</span>
            <b>{{ name }}</b>
          </div>
          <div class="sid-item" :title="$t('idcardCopiedNo')" @click="copyText(no, 'idcardCopiedNo')">
            <span>{{ $t('idcardFieldNo') }}</span>
            <b class="sid-copy">{{ no }}</b>
          </div>
          <div class="sid-item">
            <span>{{ $t('idcardFieldDept') }}</span>
            <b>{{ dept }}</b>
          </div>
          <div class="sid-item" :title="$t('copySuccessMsg')" @click="copyText(email, 'copySuccessMsg')">
            <span>{{ $t('idcardFieldEmail') }}</span>
            <b class="sid-copy">{{ email }}</b>
          </div>
          <div class="sid-item">
            <span>{{ $t('idcardFieldEnroll') }}</span>
            <b>{{ enroll || '—' }}</b>
          </div>
          <div class="sid-item">
            <span>{{ $t('idcardFieldExpiry') }}</span>
            <b>{{ expiry || '—' }}</b>
          </div>
          <div class="sid-item">
            <span>{{ $t('idcardFieldStatus') }}</span>
            <b><i class="sid-dot" :class="{ off: graduated }"></i>{{ graduated ? $t('idcardGraduated') : $t('idcardActive') }}</b>
          </div>
        </fieldset>

        <fieldset class="sid-panel">
          <legend>{{ $t('idcardNotesTitle') }}</legend>
          <ol class="sid-note-list">
            <li>{{ $t('idcardNote1') }}</li>
            <li>{{ $t('idcardNote2') }}</li>
            <li>{{ $t('idcardNote3') }}</li>
            <li>{{ $t('idcardNote4') }}</li>
          </ol>
        </fieldset>

        <p class="sid-disclaimer">{{ $t('idcardDisclaimer') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'

const { t } = useI18n()
const userStore = useUserStore()
const settingStore = useSettingStore()

defineOptions({
  name: 'idcard'
})

const school = computed(() => settingStore.settings.title || t('idcardSchool'))
const name = computed(() => userStore.user.name || '—')
const email = computed(() => userStore.user.email || '—')
/* 院系为固定展示文案，不读取用户角色 */
const dept = computed(() => t('idcardDeptValue'))

/* 校名横带：长名称自动缩小字号与字距，避免省略号 */
const bandStyle = computed(() => {
  const len = (school.value || '').length
  if (len > 16) return { fontSize: '14px', letterSpacing: '1px' }
  if (len > 11) return { fontSize: '16px', letterSpacing: '2px' }
  return {}
})

/* 钢印弧线文字：按名称长度自适应字号（中文按 1 字宽、拉丁按 0.58 估算，弧长约 167） */
const sealFont = computed(() => {
  const text = school.value || ''
  let units = 0
  for (const ch of text) {
    units += /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 1 : 0.58
  }
  if (!units) return 12.5
  return Math.max(6.5, Math.min(12.5, (158 - 1.2 * text.length) / units))
})

/* 学号：用户 ID 补齐 8 位，仅作展示 */
const no = computed(() => String(userStore.user.userId ?? '').padStart(8, '0'))

const enroll = computed(() => {
  const raw = userStore.user.account?.createTime || ''
  return raw ? raw.slice(0, 10).replace(/-/g, '.') : ''
})

/* 学制四年，到期即「毕业」彩蛋 */
const expiry = computed(() => {
  if (!enroll.value) return ''
  return (Number(enroll.value.slice(0, 4)) + 4) + enroll.value.slice(4)
})

const graduated = computed(() => {
  if (!expiry.value) return false
  const end = new Date(expiry.value.replace(/\./g, '-'))
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now()
})

/* 注册记录：按入学年数盖章（最多四学年） */
const stamped = computed(() => {
  if (!enroll.value) return 0
  const start = new Date(enroll.value.replace(/\./g, '-')).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.min(4, Math.floor((Date.now() - start) / (365 * 86400000))))
})

const stampYears = computed(() => {
  const y0 = enroll.value ? Number(enroll.value.slice(0, 4)) : new Date().getFullYear()
  return [0, 1, 2, 3].map(i => {
    const p = n => String(((n % 100) + 100) % 100).padStart(2, '0')
    return `${p(y0 + i)}-${p(y0 + i + 1)}`
  })
})

/* 条码：由学号数字确定性生成，仅装饰 */
const bars = computed(() => {
  const s = no.value + '0000000000'
  const list = []
  let x = 0
  for (let i = 0; i < 40; i++) {
    const d = s.charCodeAt(i % s.length) - 48
    const w = 1 + ((d * 7 + i * 5) % 3)
    const g = 1 + ((d * 3 + i * 11) % 2)
    list.push({ x, w })
    x += w + g
  }
  return { list, w: x }
})

/* ---- 证件照：按姓名确定性生成像素头像（同名同脸，仅装饰） ---- */
const AVATAR_SKINS = [['#f6d7b8', '#e0ac7e'], ['#eec39a', '#c68955'], ['#e0ac7e', '#a86b3c'], ['#c68955', '#8d5524'], ['#a86b3c', '#6e4226'], ['#8d5524', '#5a341a']]
const AVATAR_HAIRS = ['#1f1f1f', '#3a2a1a', '#5a3a1a', '#8a5a2a', '#b8860b', '#2c2c54', '#4a4a4a', '#7a3b2a']
const AVATAR_SHIRTS = ['#33538f', '#3a6ea5', '#6b4f9e', '#2e6e4e', '#8f2b23', '#4a4a55', '#b23a2a', '#1f6f6f']
const AVATAR_BGS = [['#5a83c8', '#33538f'], ['#4a74b8', '#2c4f8a'], ['#7ba7dd', '#4a6fa8']]

function avatarSeed(str) {
  let h = 2166136261
  for (const ch of str) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function avatarRandom(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* 18×24 像素画布：肤色/发型/发色/上衣/背景/眼镜由姓名哈希决定 */
function buildAvatar(name) {
  const rng = avatarRandom(avatarSeed(name))
  const pick = (list) => list[Math.floor(rng() * list.length)]
  const [skin, skinDark] = pick(AVATAR_SKINS)
  const hair = pick(AVATAR_HAIRS)
  const shirt = pick(AVATAR_SHIRTS)
  const bg = pick(AVATAR_BGS)
  const hairStyle = Math.floor(rng() * 7)
  const glasses = rng() < 0.22
  const cells = []
  const put = (x, y, w, h, fill) => cells.push({ x, y, w, h, fill })

  /* 衣服与领口 */
  put(3, 19, 12, 1, shirt)
  put(1, 20, 16, 4, shirt)
  put(7, 19, 4, 1, skinDark)

  /* 脖子（含下巴投影）与头部 */
  put(7, 16, 4, 1, skinDark)
  put(7, 17, 4, 2, skin)
  put(6, 6, 6, 1, skin)
  put(5, 7, 8, 8, skin)
  put(6, 15, 6, 1, skinDark)
  put(4, 10, 1, 2, skin)
  put(13, 10, 1, 2, skin)

  /* 五官 */
  put(7, 10, 1, 2, '#262626')
  put(10, 10, 1, 2, '#262626')
  put(8, 13, 2, 1, skinDark)
  if (glasses) {
    const f = '#1a1a1a'
    put(6, 9, 3, 1, f)
    put(6, 11, 3, 1, f)
    put(6, 10, 1, 1, f)
    put(8, 10, 1, 1, f)
    put(9, 9, 3, 1, f)
    put(9, 11, 3, 1, f)
    put(11, 10, 1, 1, f)
  }

  /* 发型：寸头/短发/侧分/刺猬/齐刘海/卷发/长发 */
  if (hairStyle === 0) {
    put(6, 6, 6, 2, hair)
    put(5, 8, 1, 1, hair)
    put(12, 8, 1, 1, hair)
  } else if (hairStyle === 1) {
    put(6, 4, 6, 2, hair)
    put(5, 6, 8, 2, hair)
    put(5, 8, 1, 2, hair)
    put(12, 8, 1, 2, hair)
  } else if (hairStyle === 2) {
    put(6, 4, 7, 2, hair)
    put(5, 6, 7, 1, hair)
    put(12, 7, 1, 3, hair)
    put(5, 8, 1, 2, hair)
  } else if (hairStyle === 3) {
    put(6, 3, 1, 1, hair)
    put(9, 3, 1, 1, hair)
    put(11, 3, 1, 1, hair)
    put(5, 4, 8, 2, hair)
    put(5, 6, 8, 1, hair)
    put(5, 7, 1, 2, hair)
    put(12, 7, 1, 2, hair)
  } else if (hairStyle === 4) {
    put(6, 4, 6, 2, hair)
    put(5, 6, 8, 2, hair)
    put(5, 8, 4, 1, hair)
  } else if (hairStyle === 5) {
    put(5, 3, 8, 3, hair)
    put(4, 6, 10, 3, hair)
  } else {
    put(6, 4, 6, 2, hair)
    put(5, 6, 8, 2, hair)
    put(4, 8, 2, 7, hair)
    put(12, 8, 2, 7, hair)
  }

  return { cells, bg }
}

const avatar = computed(() => buildAvatar(name.value === '—' ? '' : name.value))

/* 翻面 + 鼠标微倾斜 */
const flipped = ref(false)
const tilt = reactive({ x: 0, y: 0 })

const tiltStyle = computed(() => ({
  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
}))

function onTiltMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  tilt.x = Number((-py * 5).toFixed(2))
  tilt.y = Number((px * 7).toFixed(2))
}

function onTiltLeave() {
  tilt.x = 0
  tilt.y = 0
}

/* 证件按 540×340 固定版式绘制，随容器宽度等比缩放 */
const CARD_W = 540
const CARD_H = 340
const stageRef = ref(null)
const scale = ref(1)
let resizeObserver = null

const scaleStyle = computed(() => ({ transform: `scale(${scale.value})` }))
const fitStyle = computed(() => ({ height: Math.round(CARD_H * scale.value) + 'px' }))

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width || CARD_W
    scale.value = Math.min(1, w / CARD_W)
  })
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

function copyText(text, tipKey) {
  navigator.clipboard.writeText(String(text)).then(() => {
    ElMessage({ message: t(tipKey), type: 'success', plain: true })
  })
}

function printCard() {
  window.print()
}
</script>

<style scoped lang="scss">
.sid-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 36px 40px 48px;

  @media (max-width: 767px) {
    padding: 24px 20px 36px;
  }
}

/* ---- 页头 ---- */
.sid-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 28px;

  h2 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 6px;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: var(--secondary-text-color, #6b7280);
  }
}

.sid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ---- 布局（容器查询：窗口内容区窄时切单列） ---- */
/* 页面根是 grid item + auto margin，需显式宽度，否则 inline-size 容器会塌陷 */
.sid-page {
  container-type: inline-size;
  width: 100%;
  box-sizing: border-box;
}

.sid-body {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr);
  gap: 34px;
  align-items: start;

  @container (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
}

@supports not (container-type: inline-size) {
  .sid-body {
    grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr);
  }
}

/* ---- 证件舞台 ---- */
.sid-stage {
  animation: sidIn 0.5s ease-out;
  min-width: 0;
}

@keyframes sidIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
}

/* fit 撑起缩放后的布局高度；scaler 承载固定版式并缩放 */
.sid-fit {
  display: flex;
  justify-content: center;
  overflow: visible;
}

.sid-scaler {
  flex: none;
  width: 540px;
  height: 340px;
  transform-origin: top center;
}

.sid-tilt {
  perspective: 1200px;
  width: 540px;
  height: 340px;
}

.sid-flip {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.3, 0.7, 0.25, 1);
  cursor: pointer;
  outline: none;

  &.on {
    transform: rotateY(180deg);
  }
}

.sid-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18);
  background:
    radial-gradient(300px 220px at 88% 14%, rgba(166, 59, 44, 0.05), transparent 60%),
    repeating-linear-gradient(48deg, rgba(70, 58, 32, 0.026) 0 1px, transparent 1px 7px),
    linear-gradient(160deg, #fdfbf3 0%, #f5efdc 58%, #eee5cb 100%);
  color: #2b2a26;
  /* Georgia 在前：拉丁与数字用旧式数字（与小写等高和谐），中文回落宋体，避免数字偏大 */
  font-family: Georgia, 'STZhongsong', 'SimSun', 'FangSong', serif;

  &.sid-back {
    transform: rotateY(180deg);
  }
}

/* 校徽水印 */
.sid-mark {
  position: absolute;
  right: 14px;
  top: 66px;
  width: 132px;
  height: 132px;
  opacity: 0.05;
  pointer-events: none;
}

/* ---- 正面：校名横带 ---- */
.sid-band {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px 10px;
  background: linear-gradient(180deg, #8f2b23, #a63b2c);
  border-bottom: 2px solid #d9b46a;
  box-shadow: inset 0 -5px 0 -3px rgba(0, 0, 0, 0.22);
}

.sid-crest {
  width: 34px;
  height: 34px;
  flex: none;
}

.sid-band-school {
  flex: 1;
  min-width: 0;
  color: #fdf6e3;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sid-band-en {
  flex: none;
  color: rgba(253, 246, 227, 0.75);
  font-size: 9px;
  letter-spacing: 1.5px;
  font-family: Georgia, 'Times New Roman', serif;
}

/* 居中题名 */
.sid-ribbon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 7px 0 2px;

  span {
    color: #8f2b23;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 14px;
    text-indent: 14px;
  }

  i {
    flex: 1;
    max-width: 120px;
    border-top: 1px solid rgba(143, 43, 35, 0.45);
    position: relative;

    &::after {
      content: '◆';
      position: absolute;
      top: -7px;
      font-size: 8px;
      font-style: normal;
      color: rgba(143, 43, 35, 0.55);
    }

    &:first-child::after { right: -4px; }
    &:last-child::after { left: -4px; }
  }
}

/* ---- 正面：照片 + 信息 ---- */
.sid-main {
  flex: 1;
  display: flex;
  gap: 18px;
  padding: 8px 20px 0;
  min-height: 0;
}

.sid-photo {
  flex: none;
  width: 17.5%;
  max-width: 104px;
  aspect-ratio: 3 / 4;
  border: 1px solid #b9ac8d;
  border-radius: 4px;
  background: #fff;
  padding: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);

  svg {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 2px;
  }
}

.sid-rows {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
}

.sid-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.sid-row-k {
  flex: none;
  min-width: 4em;
  white-space: nowrap;
  font-size: 13px;
  color: #7a6f56;
  letter-spacing: 2px;
}

.sid-row-v {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 600;
  border-bottom: 1px dotted rgba(122, 111, 86, 0.55);
  padding-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sid-row-v.sid-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 2px;
}

.sid-row-v.sid-email {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 600;
}

/* ---- 正面：底部 ---- */
.sid-foot {
  flex: 0 0 auto;
  margin: 10px 20px 12px;
  padding-top: 9px;
  border-top: 1.5px dashed rgba(122, 111, 86, 0.5);
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 14px;
  row-gap: 3px;
  align-items: center;
}

.sid-no {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #4a4436;
}

.sid-foot .sid-bars {
  grid-column: 2;
  height: 20px;
  width: 62%;
  justify-self: end;
}

.sid-motto {
  grid-column: 1 / 3;
  justify-self: center;
  font-size: 11px;
  color: #8a7f65;
  letter-spacing: 2px;
}

/* ---- 正面：钢印 ---- */
.sid-seal {
  position: absolute;
  right: 22px;
  bottom: 58px;
  width: 118px;
  height: 118px;
  transform: rotate(-12deg);
  opacity: 0.85;
  mix-blend-mode: multiply;
  pointer-events: none;
}

/* 毕业纪念章 */
.sid-grad {
  position: absolute;
  left: 50%;
  top: 96px;
  transform: translateX(-50%) rotate(-14deg);
  padding: 3px 10px;
  border: 2.5px solid rgba(192, 57, 43, 0.8);
  border-radius: 6px;
  color: rgba(192, 57, 43, 0.85);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 4px;
  text-indent: 4px;
  pointer-events: none;
}

/* ---- 背面 ---- */
.sid-stripe {
  flex: 0 0 auto;
  height: 13.5%;
  background: linear-gradient(180deg, #333a4d, #22283a 60%, #2e3547);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;

  span {
    color: rgba(255, 255, 255, 0.22);
    font-size: 9px;
    letter-spacing: 3px;
    font-family: Georgia, serif;
  }
}

.sid-back-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
  padding: 12px 20px 0;
  min-height: 0;
}

.sid-notes-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #8f2b23;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.sid-notes p {
  margin: 0 0 4px;
  font-size: 11.5px;
  line-height: 1.45;
  color: #4a4436;

  i {
    font-style: normal;
    font-family: Georgia, serif;
    color: #8f2b23;
    margin-right: 5px;
  }
}

.sid-stamps {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.sid-stamp {
  position: relative;
  aspect-ratio: 8 / 5;
  border: 1.5px dashed rgba(122, 111, 86, 0.6);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    font-size: 11px;
    color: #8a7f65;
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
  }

  svg {
    position: absolute;
    right: 4px;
    bottom: 3px;
    width: 16px;
    height: 16px;
    opacity: 0.9;
  }

  &.ok {
    border: 1.5px solid rgba(192, 57, 43, 0.65);

    span {
      color: rgba(143, 43, 35, 0.8);
    }
  }
}

.sid-back-foot {
  flex: 0 0 auto;
  margin: 8px 20px 0;
  padding-top: 8px;
  border-top: 1.5px dashed rgba(122, 111, 86, 0.5);
  display: flex;
  align-items: center;
  gap: 12px;
}

.sid-back-foot .sid-bars {
  height: 24px;
  width: 42%;
  flex: none;
}

.sid-back-no {
  font-family: 'Courier New', monospace;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #4a4436;
}

.sid-lost-line {
  flex: 0 0 auto;
  margin: 4px 20px 10px;
  font-size: 11px;
  color: #8a7f65;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sid-hint {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--secondary-text-color, #6b7280);
}

/* ---- 侧栏面板 ---- */
.sid-aside {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.sid-panel {
  margin: 0;
  padding: 6px 16px 14px;
  border: 1px solid var(--base-border-color, #d7dce6);
  border-radius: 8px;
  background: var(--el-bg-color, #fff);

  legend {
    padding: 0 8px;
    font-size: 13.5px;
    font-weight: 700;
  }
}

.sid-item {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 14px;
  padding: 7px 0;
  font-size: 13.5px;
  border-bottom: 1px dashed var(--base-border-color, #e5e8ee);

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  > span {
    color: var(--secondary-text-color, #6b7280);
  }

  b {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sid-copy {
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary, #4dabff);
      text-decoration: underline dotted;
    }
  }
}

.sid-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34a853;

  &.off {
    background: #9aa3af;
  }
}

.sid-note-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--secondary-text-color, #4b5563);
}

.sid-disclaimer {
  margin: 0;
  font-size: 12px;
  color: var(--secondary-text-color, #9aa3af);
  text-align: center;
}

/* ---- 动效偏好 ---- */
@media (prefers-reduced-motion: reduce) {
  .sid-stage {
    animation: none;
  }

  .sid-flip {
    transition: none;
  }
}
</style>

<style lang="scss">
/* ---- 打印：仅输出证件正反面（原尺寸，不受缩放影响） ---- */
@media print {
  body * {
    visibility: hidden !important;
    box-shadow: none !important;
  }

  .sid-stage,
  .sid-stage * {
    visibility: visible !important;
  }

  .sid-stage {
    position: absolute !important;
    left: 0;
    top: 0;
    width: 100%;
  }

  .sid-fit {
    height: auto !important;
  }

  .sid-scaler {
    transform: none !important;
  }

  .sid-tilt,
  .sid-flip {
    transform: none !important;
    width: 540px !important;
    margin: 0 auto !important;
  }

  .sid-face {
    position: static !important;
    transform: none !important;
    backface-visibility: visible !important;
    -webkit-backface-visibility: visible !important;
    width: 540px !important;
    height: 340px !important;
    margin: 0 auto 20px !important;
    break-inside: avoid;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .sid-hint {
    display: none !important;
  }
}
</style>
