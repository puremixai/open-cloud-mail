<template>
  <div ref="container" class="email-container" :class="{ 'mail-narrow': isMobile, 'mail-wide': !isMobile }" :style="{ '--mail-row-height': itemHeight + 'px' }">
    <div class="mail-tools">
    <slot name="filters" />
    <div class="header-actions" role="group" :aria-label="t('ux.mailActions')">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading || refreshing || !!batchAction"
          :aria-label="t('ux.selectLoaded')"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <IconButton action="refresh" :label="t('ux.refreshMail')" :loading="loading || refreshing" :disabled="!!batchAction || starRequests.size > 0" @click="refresh"/>
        <IconButton v-perm="'email:delete'" action="delete" :label="t('ux.deleteSelected')" :loading="batchAction === 'delete'" :disabled="!!batchAction || refreshing"
              v-if="getSelectedMailsIds().length > 0"
              @click="handleDelete"/>
        <IconButton action="read" :label="t('markAsRead')" :loading="batchAction === 'read'" :disabled="!!batchAction || refreshing"
              v-if="getSelectedMailsIds().length > 0 && showUnread"
              @click="handleRead"/>
        <IconButton data-test="density-toggle" action="density" :label="t(dense ? 'ux.comfortableDensity' : 'ux.compactDensity')" :aria-pressed="dense" @click="toggleDense"/>
      </div>

      <div class="header-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
        <IconButton v-if="showAccountIcon" action="accounts" :label="t('ux.toggleAccounts')" :aria-expanded="uiStore.accountShow"
              @click="changeAccountShow"/>
      </div>
    </div>

    <div v-if="checkedEmailCount" class="selection-status" role="status" data-test="selection-status" :data-count="checkedEmailCount">
      {{ t('ux.selectedMail', { count: checkedEmailCount }) }}
      <span v-if="isSelectMax">{{ t('ux.selectionLimit', { count: MAX_SELECT_COUNT }) }}</span>
      <span>{{ t('ux.loadedSelectionOnly') }}</span>
    </div>
    <!-- Win95 表头：对齐设计稿的灰色凸起列头（仅桌面紧凑模式） -->
    <div class="w95-list-head" v-if="uiStore.win95 && !isMobile">
      <span class="h-cc"></span>
      <span class="h-sender">{{ $t('win95ColSender') }}</span>
      <span class="h-subject">{{ $t('win95ColSubject') }}</span>
      <span class="h-date">{{ $t('win95ColDate') }}</span>
    </div>

    </div>
    <div ref="scroll" class="scroll">
      <div v-if="listError" class="feedback" role="alert">{{ t(listError === 'forbidden' ? 'ux.mailForbidden' : 'mailLoadFailed') }} <button type="button" @click="refreshList(false)">{{ t('retry') }}</button></div>
      <div v-if="refreshing" class="feedback" role="status">{{ t('ux.refreshingMail') }}</div>
      <div v-if="batchError" class="feedback" role="alert">{{ t('ux.mailActionFailed') }} <button type="button" @click="retryBatch?.()">{{ t('retry') }}</button></div>
      <div v-if="starError" class="feedback" role="alert">{{ t('ux.starFailed') }}</div>
      <div v-if="actionLoading" role="status">{{ t('mailDetailLoading') }}</div>
      <div v-if="actionError" role="alert">{{ t('mailLoadFailed') }} <button @click="retryAction?.()">{{ t('retry') }}</button></div>
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div :class="['email-row', props.type, { 'right-checked': item.rightChecked, dense: dense, 'is-current': emailStore.contentData.source === props.type && emailStore.contentData.email?.emailId === item.emailId, 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread }]"
                 :data-mail-id="item.emailId"
                 :data-checked="item.checked"
                 role="group" :aria-label="t('ux.openMail', { sender: item.name || item.sendEmail || '', subject: item.subject || t('ux.noSubject') })"
                 @keydown="handleRowKey($event, item)"
                 @click="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
            >
              <el-checkbox :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                           v-model="item.checked"
                           :disabled="(!item.checked && isSelectMax) || refreshing || !!batchAction"
                           :aria-label="t('ux.selectMail', { subject: item.subject || t('ux.noSubject') })"
                           @click.stop></el-checkbox>
              <IconButton @click.stop="starChange(item)" action="star" class="pc-star" v-if="showStar" :label="t(item.isStar ? 'ux.unstarMail' : 'ux.starMail')" :aria-pressed="!!item.isStar" :loading="starRequests.has(item.emailId)" :disabled="(!item.isStar && !allowStar) || refreshing" />
              <div v-if="!showStar"></div>
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style=" (showStatus ? 'gap: 10px;' : '') + ((item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : '')">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="20" height="20"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>
                      <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <slot name="name" :email="item"> {{ item.name }}</slot>
                    </span>
                  </span>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                      <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <button class="subject-text mail-open" type="button" :aria-label="t('ux.openMail', { sender: item.name || item.sendEmail || '', subject: item.subject || t('ux.noSubject') })" @click.stop="jumpDetails(item)">
                        <slot name="subject" :email="item" >
                          {{ item.subject || t('ux.noSubject') }}
                        </slot>
                      </button>
                      <button type="button" v-if="item.code" class="code-tag" :aria-label="t('copyCode')" @click.stop="copyCode(item.code)">{{ item.code }}</button>
                    </span>
                    <span class="email-content">{{ item.text || '\u200B' }}</span>
                  </div>
                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="20" height="20"/>
                      </span>
                      <span>{{ item.userEmail }}</span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
              </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1" :dense="dense"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :dense="dense"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :dense="dense"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading && !listError">
        <Icon class="empty-icon" icon="mdi:email-open-outline" width="44" height="44"/>
        <div class="empty-text">{{ t(emptyMessage || emptyKey) }}</div>
        <p>{{ t(emptyHint || 'ux.emptyRefreshHint') }}</p>
        <slot name="empty-action"><button type="button" @click="refresh">{{ t('ux.refreshMail') }}</button></slot>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="emailRead(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:mail-read-20-regular" width="20" height="20" />
                <span>{{t('markAsRead')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="la:reply" width="20" height="20"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="solar:star-line-duotone" width="19" height="19"/>
                <span>{{t('star')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {ElMessage, ElMessageBox} from 'element-plus';
import {Icon} from "@iconify/vue";
import IconButton from "@/components/icon-button/index.vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted, onDeactivated } from "vue";
import {isCanceled, useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'

const props = defineProps({
  getEmailList: Function,
  emptyMessage: String,
  emptyHint: String,
  emailDelete: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search'])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const refreshing = ref(false)
const batchAction = ref(''), batchError = ref(false), starError = ref(false)
let retryBatch = null
const container = ref(null)
let resizeObserver = null
let contextTrigger = null
const emptyKey = computed(() => ({ email: 'ux.emptyInbox', star: 'ux.emptyStar', send: 'ux.emptySent', draft: 'ux.emptyDraft' }[props.type] || 'noMessagesFound'))
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
let requestId = 0
let requestController = null
let active = true
let needsRefresh = false
let actionId = 0
let dropdownTimer = null
let restoreFrame = null
const listError = ref(false)
const actionLoading = ref(false)
const actionError = ref(false)
let retryAction = null
const isMobile = ref(true)
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const MAX_SELECT_COUNT = 95;
const checkedEmailCount = computed(() => emailList.filter(item => item.checked).length);
const isSelectMax = computed(() => checkedEmailCount.value >= MAX_SELECT_COUNT);
let timer = null
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  // handleRead 是 const 箭头函数（声明在后），直接暴露会踩 TDZ，用包装函数延迟求值
  handleRead: (...args) => handleRead(...args),
  handleCheckAllChange,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total,
  loading,
  refreshing,
  listError
})

function startEffects() {
  const wasInactive = !active
  active = true
  if (!timer) timer = setInterval(() => {
    emailList.forEach(email => email.formatCreateTime = fromNow(email.createTime))
  }, 60000)
  document.addEventListener('keydown', onEscClose)
  window.addEventListener('wheel', onWheel)
  window.addEventListener('resize', onResize)
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width > 0) isMobile.value = width < 720 })
    if (container.value) resizeObserver.observe(container.value)
  }
  onResize()
  if (wasInactive && needsRefresh) { needsRefresh = false; refreshList() }
}
function stopEffects() {
  active = false
  resizeObserver?.disconnect()
  resizeObserver = null
  refreshing.value = false
  batchAction.value = ''
  batchError.value = false
  actionId++
  actionLoading.value = false
  actionError.value = false
  retryAction = null
  if (reqLock) needsRefresh = true
  requestId++
  requestController?.abort()
  reqLock = false
  loading.value = false
  followLoading.value = false
  clearInterval(timer)
  timer = null
  dropdownRef.value?.handleClose()
  clearTimeout(dropdownTimer)
  dropdownCloseLock.value = false
  dropdownShow.value = false
  cancelAnimationFrame(restoreFrame)
  document.removeEventListener('keydown', onEscClose)
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('resize', onResize)
}
function onEscClose(e) {
  if (e.key === 'Escape' && dropdownShow.value) dropdownRef.value?.handleClose()
}
function onWheel() { if (dropdownShow.value) dropdownRef.value?.handleClose() }
function onResize() { const width = container.value?.getBoundingClientRect().width; if (width > 0) isMobile.value = width < 720 }
onMounted(startEffects)
onActivated(() => {
  startEffects()
  restoreFrame = requestAnimationFrame(() => scrollbarRef.value?.scrollTo(scrollTop / itemHeight.value))
})
onDeactivated(stopEffects)
onUnmounted(stopEffects)
watch(() => emailStore.generation, () => {
  requestId++
  requestController?.abort()
  reqLock = false
  loading.value = false
  refreshing.value = false
  batchAction.value = ''
  batchError.value = false
  starError.value = false
  retryBatch = null
  followLoading.value = false
  emailList.length = 0
  latestEmail.value = null
  total.value = 0
  noLoading.value = false
  actionId++
  actionError.value = false
  actionLoading.value = false
  retryAction = null
  needsRefresh = true
  if (active && localStorage.getItem('token')) refreshList()
}, { flush: 'sync' })
getEmailList()

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: 1200 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

/* Both themes share the stored density preference. */
const dense = ref(localStorage.getItem('email-dense') === '1')

function toggleDense() {
  dense.value = !dense.value
  localStorage.setItem('email-dense', dense.value ? '1' : '0')
}

const itemHeight = computed(() => props.type === 'all-email'
  ? (isMobile.value ? (dense.value ? 120 : 144) : (dense.value ? 64 : 76))
  : (isMobile.value ? (dense.value ? 72 : 88) : (dense.value ? 40 : 52)))

watch(emailList, () => {
  updateHasScrollbar();
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, async (_, before) => {
  const firstVisible = Math.floor(scrollTop / before)
  keyCount.value ++
  await nextTick()
  if (active) scrollbarRef.value?.scrollTo(firstVisible)
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    if (index >= 0) expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    if (index >= 0) expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value && !listError.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      updateCheckStatus();
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

async function compose(email, method) {
  const operation = ++actionId
  const epoch = emailStore.syncSession()
  retryAction = () => compose(email, method)
  actionLoading.value = true
  actionError.value = false
  try {
    const detail = await emailStore.ensureDetail(email.emailId, { admin: props.type === 'all-email' })
    if (active && operation === actionId && epoch === emailStore.syncSession()) {
      await uiStore.writerRef[method](detail)
      retryAction = null
    }
  } catch (error) {
    if (active && operation === actionId && !isCanceled(error)) actionError.value = true
  } finally {
    if (operation === actionId) actionLoading.value = false
  }
}
function openReply(email) { return compose(email, 'openReply') }
function openForward(email) { return compose(email, 'openForward') }

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  clearTimeout(dropdownTimer)
  dropdownTimer = setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e) contextTrigger?.focus?.()
  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  contextTrigger = event.currentTarget
  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

const starRequests = reactive(new Set())
async function starChange(email) {
  const id = email.emailId, before = email.isStar || 0, after = before ? 0 : 1
  if (refreshing.value || starRequests.has(id) || (after && !props.allowStar)) return
  const mutation = emailStore.beginStarMutation(id)
  starError.value = false
  starRequests.add(id)
  email.isStar = after
  emailStore.updateEmail(id, { isStar: after })
  try {
    await (after ? props.starAdd(id) : props.starCancel(id))
    if (!emailStore.isCurrentStarMutation(mutation)) return
    emailStore.updateEmail(id, { isStar: after })
    if (after) props.starSuccess?.(email)
    else props.cancelSuccess?.(email)
  } catch (error) {
    if (emailStore.isCurrentStarMutation(mutation)) {
      starError.value = true
      email.isStar = before
      emailStore.updateEmail(id, { isStar: before })
    }
  } finally {
    starRequests.delete(id)
    emailStore.finishStarMutation(mutation)
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}

const handleRead = () => markRead(getSelectedMailsIds())
function emailRead(emailId) { return markRead([emailId]) }
async function markRead(ids) {
  if (refreshing.value || batchAction.value || !ids.length) return
  const epoch = emailStore.syncSession()
  batchAction.value = 'read'
  batchError.value = false
  retryBatch = () => markRead(ids)
  try {
    await props.emailRead(ids)
    if (epoch !== emailStore.syncSession()) return
    localRead(ids)
    ids.forEach(id => emailStore.markListRead(id))
    retryBatch = null
  } catch (error) {
    if (active && epoch === emailStore.syncSession() && !isCanceled(error)) batchError.value = true
  } finally { if (epoch === emailStore.syncSession()) batchAction.value = '' }
}

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      emailList[index].unread = EmailUnreadEnum.READ;
      emailList[index].checked = false;
    }
  })
}

async function removeEmails(ids, confirm = false) {
  if (refreshing.value || batchAction.value || !ids.length) return
  const epoch = emailStore.syncSession()
  batchAction.value = 'delete'
  batchError.value = false
  retryBatch = () => removeEmails(ids, confirm)
  try {
    if (confirm) await ElMessageBox.confirm(t('delEmailsConfirm'), {
      confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning'
    })
    if (epoch !== emailStore.syncSession()) return
    await props.emailDelete(ids)
    if (epoch !== emailStore.syncSession()) return
    emailStore.invalidateDetail(ids)
    emailStore.deleteIds = ids
    retryBatch = null
    ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
  } catch (error) {
    if (active && epoch === emailStore.syncSession() && error !== 'cancel' && error !== 'close' && !isCanceled(error)) batchError.value = true
  } finally { if (epoch === emailStore.syncSession()) batchAction.value = '' }
}
function rightDelete(emailId) { return removeEmails([emailId], props.type === 'all-email') }

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

async function handleDelete() {
  if (props.type !== 'draft') return removeEmails(getSelectedMailsIds(), true)
  const ids = getSelectedDraftsIds(), epoch = emailStore.syncSession()
  try {
    await ElMessageBox.confirm(t('delEmailsConfirm'), {
      confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning'
    })
    if (epoch === emailStore.syncSession()) emit('delete-draft', ids)
  } catch {}
}

function deleteEmail(emailIds) {
  emailStore.invalidateDetail(emailIds)
  const deleted = new Set(emailIds)
  const removed = new Set()
  for (let index = emailList.length - 1; index >= 0; index--) {
    const id = emailList[index].emailId
    if (deleted.has(id)) {
      removed.add(id)
      emailList.splice(index, 1)
    }
  }
  // Other lists share deletion events. Only decrement for known matches here;
  // repeated events and unloaded ids do not establish another removed result.
  total.value = Math.max(0, total.value - removed.size)
  if (removed.size && emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatCreateTime = fromNow(email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  if (val) {
    let count = 0;
    emailList.forEach(item => {
      if (count < MAX_SELECT_COUNT) {
        item.checked = true;
        count++;
      } else {
        item.checked = false;
      }
    });
  } else {
    emailList.forEach(item => item.checked = false);
  }
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;

  const atMax = checkedCount >= MAX_SELECT_COUNT;
  checkAll.value = emailList.length > 0 && (checkedCount === emailList.length || atMax);
  isIndeterminate.value = checkedCount > 0 && !checkAll.value;
}

function handleRowKey(event, email) {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    const index = emailList.findIndex(item => item.emailId === email.emailId)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? emailList.length - 1 : Math.max(0, Math.min(emailList.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
    const id = emailList[next]?.emailId
    if (id == null) return
    const focus = () => [...(container.value?.querySelectorAll('[data-mail-id]') || [])].find(row => String(row.dataset.mailId) === String(id))?.querySelector('.mail-open')?.focus({ preventScroll: true })
    const top = next * itemHeight.value, viewport = scrollbarRef.value?.$el
    if (viewport && (top < viewport.scrollTop || top + itemHeight.value > viewport.scrollTop + viewport.clientHeight)) scrollbarRef.value?.scrollTo(next)
    nextTick(focus)
    return
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    const rect = event.currentTarget.getBoundingClientRect()
    handleContextmenu({ currentTarget: event.target, clientX: rect.left, clientY: rect.bottom, preventDefault: () => event.preventDefault() }, email)
  }
}

function jumpDetails(email) {

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }
  actionId++
  actionError.value = false
  actionLoading.value = false
  retryAction = null
  emit('jump', email)
}


async function getEmailList(refresh = false, clear = false) {
  if (!active) { needsRefresh = true; return }
  if (!refresh && (reqLock || noLoading.value)) return
  if (refresh) requestController?.abort()
  const current = ++requestId
  const controller = new AbortController()
  requestController = controller
  const epoch = emailStore.syncSession()
  const valid = () => active && current === requestId && !controller.signal.aborted && epoch === emailStore.syncSession()
  const emailId = refresh ? 0 : (emailList.at(-1)?.emailId || 0)
  reqLock = true
  listError.value = false
  getSkeletonRows()
  if (refresh) {
    if (clear) { emailList.length = 0; total.value = 0; latestEmail.value = null }
    noLoading.value = false
    scrollTop = 0
  }
  loading.value = !emailList.length
  refreshing.value = refresh && !!emailList.length
  followLoading.value = !loading.value && !refresh
  try {
    const data = await props.getEmailList(emailId, queryParam.size, { signal: controller.signal })
    if (!valid()) return
    const items = data.list.map(item => ({ ...item, checked: false }))
    handleList(items)
    if (refresh) emailList.splice(0, emailList.length, ...items)
    else emailList.push(...items)
    latestEmail.value = data.latestEmail
    noLoading.value = items.length < queryParam.size
    if (data.total != null) total.value = data.total
    firstLoad.value = false
  } catch (error) {
    if (valid() && !isCanceled(error)) { listError.value = [401, 403].includes(error?.code) ? 'forbidden' : 'network'; firstLoad.value = false }
  } finally {
    if (valid()) { loading.value = false; refreshing.value = false; followLoading.value = false; reqLock = false }
  }
}

function handleList(list) {
  list.forEach(email => {
    email.formatCreateTime = fromNow(email.createTime);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status];
  })
}

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  refreshList(props.type === 'all-email')
}

function refreshList(clear = true) {
  if (clear) {
    checkAll.value = false;
    isIndeterminate.value = false;
    actionId++
    actionLoading.value = false
    actionError.value = false
    retryAction = null
    dropdownRef.value?.handleClose()
    rightClickEmail.value = {}
    starError.value = false
    batchError.value = false
    retryBatch = null
  }
  return getEmailList(true, clear);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

.email-container {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  container: mail-list / inline-size;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

.empty-icon {
  color: var(--secondary-text-color);
}

.empty-text {
  margin-top: 10px;
  color: var(--secondary-text-color);
  font-size: 13px;
}

:deep(.email-row) {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;

  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @container mail-list (max-width: 719px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  .checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
    @container mail-list (min-width: 720px) {
      justify-content: start;
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @container mail-list (max-width: 719px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr;
    @container mail-list (max-width: 719px) {
      padding-right: 15px;
    }
    @container mail-list (max-width: 719px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--el-text-color-primary);
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @container mail-list (max-width: 719px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @container mail-list (min-width: 720px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 130px;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @container mail-list (min-width: 720px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @container mail-list (max-width: 719px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @container mail-list (min-width: 720px) {
          display: none;
        }
        @container mail-list (max-width: 719px) {
          width: 100%;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto 1fr;
      @container mail-list (max-width: 719px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @container mail-list (min-width: 720px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--el-text-color-primary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--email-scroll-content-color);
        @container mail-list (max-width: 719px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    @container mail-list (max-width: 719px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @container mail-list (max-width: 719px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--email-hover-background);
    z-index: 0;
  }

  &.right-checked,
  &.right-checked:hover {
    background-color: var(--email-right-click-background);
  }

  /*&[data-checked="true"] {
    background-color: #c2dbff;
  }*/
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@container mail-list (max-width: 719px) {
  .pc-star {
    display: flex;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 3px 12px;
  box-shadow: var(--header-actions-border);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 6px;
    row-gap: 8px;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: start;
    height: 100%;
    color: var(--el-text-color-primary);;

    .email-count {
      white-space: nowrap;
      margin-top: 6px;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread {
  height: 6px;
  width: 6px;
  background: var(--el-color-primary);
  margin-bottom: 2px;
  margin-right: 5px;
  border-radius: 50%;
  display: inline-block;
  justify-content: center;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}


/* One measured row height drives both rendering and virtualization in all themes. */
.email-container :deep(.email-row) {
  height: var(--mail-row-height);
  min-height: var(--mail-row-height);
  box-sizing: border-box;
  padding-block: 4px;
  font-size: 14px;
  .title, .title > div, .email-sender, .name { min-width: 0; }
  .title { grid-template-columns: minmax(130px, 190px) minmax(0, 1fr); }
  .email-text { grid-template-columns: minmax(0, auto) minmax(0, 1fr); }
  .pc-star { width: 32px; flex: 0 0 32px; margin-right: 8px; }
  .code-tag { border: 0; background: transparent; padding: 0; font: inherit; }
  .mail-open { border: 0; background: transparent; color: inherit; padding: 0; text-align: left; font: inherit; cursor: pointer; }
  .name { grid-template-columns: minmax(0, 1fr); }
  .name > span { display: block !important; }
}
.mail-narrow :deep(.email-row) {
  .title { grid-template-columns: minmax(0, 1fr); gap: 2px; padding-right: 12px; }
  .email-text { grid-template-columns: minmax(0, 1fr); }
  .checkbox, .all-email-checkbox { padding: 0 8px 0 12px; }
  .name > span:last-child { display: none; }
}
.scroll { display: flex; flex-direction: column; min-height: 0; }
.scroll .virtual { flex: 1; min-height: 0; height: auto !important; }
.scroll .empty { padding: 20px; box-sizing: border-box; text-align: center; }
.scroll .empty p { color: var(--secondary-text-color); margin: 8px 0; }
.selection-status, .feedback { padding: 8px 12px; font-size: 14px; overflow-wrap: anywhere; }
.selection-status { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.selection-status span { color: var(--secondary-text-color); }
.feedback button, .empty button { font: inherit; cursor: pointer; min-height: 32px; }
.noLoading { height: var(--mail-row-height); box-sizing: border-box; }
.header-actions .header-right { display: flex; align-items: center; flex-wrap: wrap; justify-content: end; gap: 6px; }
.header-actions .header-right .email-count { margin: 0; }
.w95-list-head .h-cc { width: 90px; }
.w95-list-head .h-sender { width: 190px; }
@container mail-list (max-width: 479px) {
  .header-actions .header-right .email-count { display: none; }
  .header-actions { padding-inline: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .email-container :deep(.email-row) { transition: none; }
}
</style>
