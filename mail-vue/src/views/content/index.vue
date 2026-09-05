<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div v-if="!email.emailId" role="status">{{ t('mailSelectionRequired') }}</div>
    <div v-if="detailLoading || attachmentLoading" role="status">{{ t('mailDetailLoading') }}</div>
    <div v-if="detailError" role="alert">{{ t('mailLoadFailed') }} <button data-test="detail-retry" @click="retryDetail">{{ t('retry') }}</button></div>
    <el-scrollbar v-if="detailReady" class="scrollbar">
      <el-backtop target=".scrollbar .el-scrollbar__wrap" :visibility-height="300" :right="30" :bottom="40"/>
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!email.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml :mail-id="email.emailId" class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att)"/>
                  <a :href="att.url" :download="att.filename" @click.prevent="downloadAttachment(att)">
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {isCanceled, useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  if (localStorage.getItem('token')) handleBack()
})

const detailLoading = ref(false), detailError = ref(false), detailReady = ref(false)
const attachmentLoading = ref(false)
let active = true, loadId = 0, composeId = 0
let pendingCompose = null
let attachmentId = 0, pendingAttachment = null
const readRequests = new Set()
const starRequests = new Set()
function selected(id, admin, epoch) {
  return active && epoch === emailStore.syncSession() && email.value.emailId === id && emailStore.contentData.admin === admin
}
async function loadDetail(force = false) {
  const id = email.value.emailId, admin = emailStore.contentData.admin
  if (!id) { detailReady.value = false; return }
  const epoch = emailStore.syncSession(), operation = ++loadId
  detailLoading.value = true
  detailError.value = false
  detailReady.value = false
  try {
    const detail = await emailStore.ensureDetail(id, { admin, force })
    if (operation !== loadId || !selected(id, admin, epoch)) return
    emailStore.contentData.email = detail
    detailReady.value = true
    markRead(detail, admin, epoch)
    return detail
  } catch (error) {
    if (operation === loadId && selected(id, admin, epoch) && !isCanceled(error)) detailError.value = true
  } finally {
    if (operation === loadId) detailLoading.value = false
  }
}
async function markRead(detail, admin, epoch) {
  const id = detail.emailId
  if (admin || !emailStore.contentData.showUnread || detail.unread !== EmailUnreadEnum.UNREAD || readRequests.has(id)) return
  readRequests.add(id)
  try {
    await emailRead([id])
    if (active && epoch === emailStore.syncSession()) emailStore.markListRead(id)
  } catch (error) {
    if (selected(id, admin, epoch) && !isCanceled(error)) detailError.value = true
  } finally { readRequests.delete(id) }
}
watch([() => email.value.emailId, () => emailStore.contentData.admin], () => {
  composeId++
  attachmentId++
  pendingAttachment = null
  attachmentLoading.value = false
  pendingCompose = null
  showPreview.value = false
  srcList.length = 0
  loadDetail()
}, { immediate: true })
onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => {
  active = false
  loadId++
  composeId++
  attachmentId++
  window.removeEventListener('keydown', handleKeyDown)
})
function handleKeyDown(event) {
  if (event.key !== 'Escape' || showPreview.value || document.querySelector('.el-message-box')) return
  const writeBox = document.querySelector('.write-box')
  if (writeBox && writeBox.offsetParent !== null) return
  handleBack()
}
async function compose(method) {
  const id = email.value.emailId, admin = emailStore.contentData.admin
  const epoch = emailStore.syncSession(), operation = ++composeId
  pendingCompose = method
  detailLoading.value = true
  detailError.value = false
  try {
    const detail = await emailStore.ensureDetail(id, { admin })
    if (operation !== composeId || !selected(id, admin, epoch)) return
    emailStore.contentData.email = detail
    detailReady.value = true
    await uiStore.writerRef[method](detail)
    pendingCompose = null
  } catch (error) {
    if (operation === composeId && selected(id, admin, epoch) && !isCanceled(error)) detailError.value = true
  } finally { if (operation === composeId) detailLoading.value = false }
}
function openReply() { return compose('openReply') }
function openForward() { return compose('openForward') }
function retryDetail() {
  if (pendingAttachment) return pendingAttachment()
  return pendingCompose ? compose(pendingCompose) : loadDetail(true)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

async function useAttachment(att, download, force = false) {
  const id = email.value.emailId, admin = emailStore.contentData.admin
  const epoch = emailStore.syncSession(), operation = ++attachmentId
  const key = att.key, attId = att.attId
  if (!id || (attId == null && !key)) return
  const current = () => operation === attachmentId && selected(id, admin, epoch)
  attachmentLoading.value = true
  detailError.value = false
  pendingAttachment = () => useAttachment(att, download, true)
  try {
    // A long-open page may retain expired capabilities after the detail cache TTL.
    const detail = await emailStore.ensureDetail(id, { admin, force })
    if (!current()) return
    const fresh = detail.attList.find(item =>
      (attId == null || String(item.attId) === String(attId)) && (!key || item.key === key))
    if (!fresh?.url) throw new Error('Attachment is no longer available')
    emailStore.contentData.email = detail
    if (download) {
      const anchor = document.createElement('a')
      anchor.href = fresh.url
      anchor.download = fresh.filename || ''
      document.body.appendChild(anchor)
      try { anchor.click() } finally { anchor.remove() }
    } else {
      srcList.splice(0, srcList.length, fresh.url)
      showPreview.value = true
    }
    pendingAttachment = null
  } catch (error) {
    if (current() && !isCanceled(error)) detailError.value = true
  } finally {
    if (operation === attachmentId) attachmentLoading.value = false
  }
}
function downloadAttachment(att) { return useAttachment(att, true) }
function showImage(att) { if (isImage(att.filename)) return useAttachment(att, false) }

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

async function changeStar() {
  const current = email.value, id = current.emailId
  if (!id || starRequests.has(id)) return
  const mutation = emailStore.beginStarMutation(id)
  const before = current.isStar || 0, after = before ? 0 : 1
  starRequests.add(id)
  emailStore.updateEmail(id, { isStar: after })
  try {
    await (after ? starAdd(id) : starCancel(id))
    if (!emailStore.isCurrentStarMutation(mutation)) return
    emailStore.updateEmail(id, { isStar: after })
    if (after) {
      emailStore.addStarEmailId = id
      emailStore.starScroll?.addItem({ ...current, isStar: after })
    } else {
      emailStore.cancelStarEmailId = id
      emailStore.starScroll?.deleteEmail([id])
    }
  } catch (error) {
    if (emailStore.isCurrentStarMutation(mutation)) emailStore.updateEmail(id, { isStar: before })
  } finally {
    starRequests.delete(id)
    emailStore.finishStarMutation(mutation)
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = async () => {
  const id = email.value.emailId, admin = emailStore.contentData.admin
  const epoch = emailStore.syncSession()
  if (!id) return
  try {
    await ElMessageBox.confirm(t('delEmailConfirm'), {
      confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning'
    })
    if (!selected(id, admin, epoch)) return
    await (admin ? allEmailDelete(id) : emailDelete(id))
    if (epoch !== emailStore.syncSession()) return
    emailStore.invalidateDetail([id])
    emailStore.deleteIds = [id]
    ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
    if (selected(id, admin, epoch)) router.back()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close' && selected(id, admin, epoch) && !isCanceled(error)) detailError.value = true
  }
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
