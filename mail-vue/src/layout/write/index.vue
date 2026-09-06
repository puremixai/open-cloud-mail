<template>
  <aside v-if="!show && (recoveries.length || recoveryReadError)" class="compose-recovery" role="status">
    <span>{{ recoveryReadError ? t('ux.recoveryReadFailed') : t('ux.recoveredMail', { count: recoveries.length }) }}</span>
    <el-button v-if="recoveryReadError" @click="loadRecoveries">{{ t('ux.restoreRetry') }}</el-button>
    <el-button v-else @click="restoreLatest">{{ t('ux.restoreLatest') }}</el-button>
  </aside>
  <div class="send" v-show="show" role="dialog" aria-modal="true" :aria-label="t('ux.composeTitle')" :aria-busy="sending" ref="composerPanel">
    <div class="write-box">
      <div class="title">
        <div class="title-left">
          <span class="title-text">
            <Icon icon="hugeicons:quill-write-01" width="28" height="28"/>
          </span>
          <span class="sender">{{ $t('sender') }}:</span>
          <span class="sender-name">{{ form.name }}</span>
          <span class="send-email"><{{ form.sendEmail }}></span>
        </div>
        <IconButton action="close" :label="t('ux.closeCompose')" :disabled="sending || draftBusy" @click="close" />
      </div>
      <div class="container" :inert="sending || draftBusy || undefined">
        <div class="compose-field recipient-field" @paste="pasteRecipients">
        <el-input-tag :aria-label="t('recipient')" :aria-invalid="!!recipientError" :aria-describedby="recipientError ? 'recipient-error' : 'recipient-help'" @add-tag="addTagChange" tag-type="primary" @input="inputChange" size="default" v-model="form.receiveEmail" >
          <template #prefix>
            <div class="item-title" >{{ $t('recipient') }}</div>
            <el-select
                ref="mySelect"
                class="write-select"
                popper-class="write-select"
                :show-arrow="false"
                :no-match-text="' '"
                :no-data-text="' '"
                @visible-change="selectStatusChange"
                @change="selectChange"
            >
              <el-option
                  v-for="item in selectRecipientList"
                  :key="item"
                  :label="item"
                  :value="item"
                  style="color: #999896;"
              />
            </el-select>
          </template>
          <template #suffix>
            <div style="display: flex;margin-right: 3px;">
              <IconButton action="contacts" :label="t('recentContacts')" class="add-contact" @click.stop="openContacts" />
            </div>
          </template>
        </el-input-tag>
        <p v-if="recipientError" id="recipient-error" class="field-error" role="alert">{{ recipientError }}</p>
        <p v-else id="recipient-help" class="recipient-hint">{{ t('ux.recipientHelp') }}</p>
        </div>
        <div class="compose-field subject-field">
          <el-input v-model="form.subject" :aria-label="t('subject')" :aria-invalid="!!subjectError" :aria-describedby="subjectError ? 'subject-error' : undefined" :placeholder="t('subject')" @input="subjectError = ''" />
          <p v-if="subjectError" id="subject-error" class="field-error" role="alert">{{ subjectError }}</p>
        </div>
        <tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange" />
        <div class="button-item">
          <IconButton action="attachment" class="att-add" :label="t('ux.attachFiles')" @click="chooseFile" />
          <IconButton action="clear" class="att-clear" :label="t('ux.clearCompose')" @click="clearContent" />
          <div class="att-list">
            <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
              <Icon v-bind="getIconByName(item.filename)"/>
              <span class="att-filename">{{ item.filename }}</span>
              <span class="att-size">{{ formatBytes(item.size) }}</span>
              <IconButton action="close" :label="t('ux.removeAttachment', { name: item.filename })" @click="delAtt(index)" />
            </div>
          </div>
          <div>
            <el-button type="primary" :loading="sending" :disabled="attachmentReads > 0" @click="sendEmail">{{ form.sendType === 'reply' ? t('reply') : form.sendType === 'forward' ? t('forward') : t('send') }}</el-button>
          </div>
        </div>
      </div>
      <div class="compose-status" :class="{ 'is-error': saveState === 'error' }" role="status" aria-live="polite">
        <span v-if="sending">{{ percent > 0 && percent < 98 ? t('ux.sendingUpload', { percent }) : t('ux.sendingSubmit') }} {{ t('ux.sendPendingHelp') }}</span>
        <template v-else>
          <span>{{ t(attachmentReads ? 'ux.readingAttachments' : saveState === 'saved' ? 'ux.draftSaved' : saveState === 'saving' ? 'ux.draftSaving' : saveState === 'error' ? 'ux.draftSaveFailed' : 'ux.draftUnsaved') }}</span>
          <el-button v-if="saveState === 'error'" text @click="saveRecovery">{{ t('ux.retrySave') }}</el-button>
        </template>
        <span v-if="uncertainSend && !sending">{{ t('ux.uncertainSend') }}</span>
      </div>
    </div>
    <el-dialog v-model="closePrompt" :title="t('ux.closeComposeTitle')" width="min(440px, calc(100vw - 32px))" append-to-body :close-on-click-modal="!draftBusy" :close-on-press-escape="!draftBusy" :show-close="!draftBusy" @closed="focusEditor">
      <p>{{ t('ux.closeComposeBody') }}</p>
      <p v-if="saveState === 'error'" role="alert">{{ t('ux.draftSaveFailed') }}</p>
      <template #footer>
        <div class="compose-close-actions">
          <el-button :disabled="draftBusy" @click="continueEditing">{{ t('ux.continueEditing') }}</el-button>
          <el-button type="danger" plain :disabled="draftBusy" @click="discardAndClose">{{ t('ux.discardChanges') }}</el-button>
          <el-button type="primary" :loading="draftBusy" :disabled="attachmentReads > 0" @click="saveAndClose">{{ t('ux.saveDraft') }}</el-button>
        </div>
      </template>
    </el-dialog>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')">
      <el-table ref="contactsTabRef" row-key="email" :data="contacts" style="height: 445px">
        <el-table-column type="selection" width="32" />
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column width="55" label="" >
          <template #default>
            <div style="display: flex;">
              <Icon icon="mage:user" style="color: var(--el-text-color-primary)" width="22" height="22" color="#606266" />
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="contacts-bottom">
        <el-button type="default" @click="deleteContact">{{t('clear')}}</el-button>
        <el-button type="primary" @click="chooseContact">{{t('selectContacts')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {createSendAttempt} from '@/utils/send-attempt.js'
import { parseRecipients } from '@/utils/recipients.js'
import {createComposeRecovery, persistDraft, draftVersion} from '@/utils/compose-recovery.js'
import IconButton from '@/components/icon-button/index.vue'
import {endSession} from '@/utils/session.js'
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, nextTick, onMounted, onUnmounted, watch, reactive, ref, toRaw, computed} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend} from "@/request/email.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {toOssDomain} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {userDraftStore} from "@/store/draft.js";
import {useWriterStore} from "@/store/writer.js";
import db from "@/db/db.js";
import dayjs from "dayjs";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";
import {ElMessageBox} from "element-plus";

defineExpose({
  open,
  openReply,
  openForward,
  openDraft,
  clearSession
})

const {t} = useI18n()
const writerStore = useWriterStore();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const percent = ref(0)
const sending = ref(false)
const attachmentReads = ref(0)
const composerPanel = ref(null)
const closePrompt = ref(false)
const draftBusy = ref(false)
const saveState = ref('idle')
const recoveries = ref([])
const recoveryReadError = ref(false)
const uncertainSend = ref(false)
let recoveryId = crypto.randomUUID()
let baseDraftVersion = null
let saveTimer, saveRevision = 0, savedRevision = -1, returnFocus = null
const defValue = ref('')
const contactsTabRef = ref({})
const showContacts = ref(false)
const mySelect = ref()
let selectStatus = false
const backReply = reactive({
  receiveEmail: [],
  subject: '',
  content: '',
  sendType: ''
})
const sendAttempt = createSendAttempt()
let composeGeneration = 0
watch(() => emailStore.generation, () => clearSession(), { flush: 'sync' })
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  text: '',
  emailId: 0,
  attachments: [],
  draftId: null,
})

let activeDatabase = db.value
let resetting = false
const hasContent = () => !!(form.subject || form.content || form.receiveEmail.length || form.attachments.length)
const snapshotForm = () => JSON.parse(JSON.stringify(toRaw(form)))

watch(form, () => {
  if (resetting || !show.value || draftBusy.value) return
  saveRevision++
  saveState.value = 'dirty'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveRecovery(), 700)
}, { deep: true, flush: 'sync' })
watch(show, visible => {
  if (visible) {
    returnFocus = document.activeElement
    activeDatabase = db.value
    if (hasContent()) { saveRevision++; saveTimer = setTimeout(() => void saveRecovery(), 700) }
    nextTick(focusEditor)
  }
})

async function saveRecovery() {
  clearTimeout(saveTimer)
  if (!userStore.user.email) return false
  if (form.requestId) form.requestId = sendAttempt.prepare(form).requestId
  const revision = saveRevision, operation = composeGeneration
  const record = { id: recoveryId, accountId: form.accountId, updatedAt: Date.now(), form: snapshotForm(), backReply: JSON.parse(JSON.stringify(backReply)), uncertainSend: uncertainSend.value, draftVersion: baseDraftVersion }
  saveState.value = 'saving'
  try {
    const recovery = createComposeRecovery(activeDatabase)
    if (hasContent()) await recovery.save(record)
    else await recovery.remove(record.id)
    if (operation === composeGeneration && revision === saveRevision) {
      savedRevision = revision
      saveState.value = 'saved'
    }
    return true
  } catch {
    if (operation === composeGeneration) saveState.value = 'error'
    return false
  }
}

async function loadRecoveries() {
  if (!userStore.user.email || !db.value.recovery) return
  const database = db.value, epoch = emailStore.generation
  const accountId = accountStore.currentAccount.accountId ?? userStore.user.account?.accountId
  try {
    const records = await createComposeRecovery(database).list(accountId)
    if (database !== db.value || epoch !== emailStore.generation) return
    recoveries.value = records
    recoveryReadError.value = false
  } catch {
    if (database === db.value && epoch === emailStore.generation) recoveryReadError.value = true
  }
}

function restoreLatest() {
  const record = recoveries.value[0]
  if (!record || show.value) return
  resetForm()
  Object.assign(form, record.form)
  Object.assign(backReply, record.backReply || {})
  recoveryId = record.id
  baseDraftVersion = record.draftVersion || null
  uncertainSend.value = !!record.uncertainSend
  sendAttempt.restore(form)
  defValue.value = form.content
  show.value = true
  nextTick(() => { savedRevision = saveRevision; saveState.value = 'saved' })
}

function focusEditor() {
  if (show.value && !closePrompt.value && !sending.value) editor.value?.focus?.()
}

function beforeUnload(event) {
  if (!show.value || (!sending.value && !attachmentReads.value && (!saveRevision || savedRevision === saveRevision))) return
  event.preventDefault()
  event.returnValue = ''
}

function finishClose() {
  closePrompt.value = false
  show.value = false
  resetForm()
  nextTick(() => { returnFocus?.isConnected && returnFocus.focus?.(); void loadRecoveries() })
}

function continueEditing() { closePrompt.value = false; nextTick(focusEditor) }

async function saveAndClose() {
  if (draftBusy.value || sending.value || attachmentReads.value) return
  draftBusy.value = true
  clearTimeout(saveTimer)
  const database = activeDatabase, id = recoveryId, operation = composeGeneration
  try {
    if (form.requestId) form.requestId = sendAttempt.prepare(form).requestId
    const draftId = await persistDraft(database, form)
    if (operation === composeGeneration) {
      form.draftId = draftId
      baseDraftVersion = await createComposeRecovery(database).readDraftVersion(draftId)
    }
    await createComposeRecovery(database).remove(id)
    if (operation !== composeGeneration) return
    draftStore.refreshList++
    finishClose()
  } catch {
    if (operation === composeGeneration) saveState.value = 'error'
  } finally { if (operation === composeGeneration || !show.value) draftBusy.value = false }
}

async function discardAndClose() {
  if (draftBusy.value || sending.value) return
  draftBusy.value = true
  clearTimeout(saveTimer)
  const operation = composeGeneration
  try {
    await createComposeRecovery(activeDatabase).remove(recoveryId)
    if (operation === composeGeneration) finishClose()
  } catch {
    if (operation === composeGeneration) saveState.value = 'error'
  } finally { if (operation === composeGeneration || !show.value) draftBusy.value = false }
}

const selectRecipientList = ref([])

const contacts = computed(() => writerStore.sendRecipientRecord.map(item => ({email: item})))

function openContacts() {
  showContacts.value = true
  nextTick(() => {
    form.receiveEmail.forEach(item => {
      if (writerStore.sendRecipientRecord.includes(item)) {
        contactsTabRef.value.toggleRowSelection({email: item});
      }
    })
  })
}

function deleteContact() {
  ElMessageBox.confirm(t('confirmDeletionOfContacts'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
    form.receiveEmail = form.receiveEmail.filter(item => !contactList.includes(item));
    writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(item => !contactList.includes(item));
  })
}

function chooseContact() {

  const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
  contactList.forEach(item => {
    if (!form.receiveEmail.includes(item)) {
      form.receiveEmail.push(item);
    }
  })

  form.receiveEmail = form.receiveEmail.filter(item => {
    return contactList.includes(item) || !writerStore.sendRecipientRecord.includes(item);
  });

  showContacts.value = false
}

function clearSelectContact() {
  contactsTabRef.value.clearSelection();
}

function selectChange(value) {
  form.receiveEmail.push(value)
}

function selectStatusChange(status) {
  selectStatus = status
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function inputChange(value) {

  selectRecipientList.value = writerStore.sendRecipientRecord.filter(item => value && !form.receiveEmail.includes(item) && item.startsWith(value)).slice(0, 10);

  if (!selectStatus && selectRecipientList.value.length > 0) {
    openSelect()
  }

  if (selectStatus && selectRecipientList.value.length === 0) {
    openSelect()
  }

}

const recipientError = ref(''), subjectError = ref('')
function acceptRecipients(value, existing) {
  const result = parseRecipients(value, existing)
  form.receiveEmail = result.accepted
  recipientError.value = result.rejected.length ? t('ux.invalidRecipients', { addresses: result.rejected.join('、') }) : ''
  if (selectStatus && result.accepted.length) openSelect()
}
function addTagChange(val) { acceptRecipients(val, form.receiveEmail.slice(0, -1)) }
function pasteRecipients(event) {
  const text = event.clipboardData?.getData('text')
  if (!text || !/[,，;；\n\r]/.test(text)) return
  event.preventDefault()
  acceptRecipients(text, form.receiveEmail)
}
watch(show, () => { recipientError.value = ''; subjectError.value = '' })

function clearContent() {
  ElMessageBox.confirm(t('clearContentConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    clearTimeout(saveTimer)
    const operation = composeGeneration
    await createComposeRecovery(activeDatabase).remove(recoveryId)
    if (operation === composeGeneration) resetForm()
  }).catch(error => {
    if (error !== 'cancel' && error !== 'close') saveState.value = 'error'
  })

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  const operation = composeGeneration
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.multiple = true;
  doc.click()
  doc.onchange = async (e) => {
    if (operation !== composeGeneration || !show.value) return

    const fileList = e.target.files;
    attachmentReads.value += fileList.length

    for (const file of fileList) {

      const size = file.size
      const filename = file.name
      const contentType = file.type

      try {
        const content = await fileToBase64(file)
        if (operation !== composeGeneration || !show.value) return
        form.attachments.push({content, filename, size, contentType})
      } catch {
        if (operation === composeGeneration) ElMessage({ message: t('ux.attachmentFailed'), type: 'error' })
      } finally {
        if (operation === composeGeneration) attachmentReads.value--
      }

    }

  }
}

async function sendEmail() {
  if (attachmentReads.value || draftBusy.value) return

  if (recipientError.value) {
    composerPanel.value?.querySelector('.recipient-field input')?.focus()
    return
  }

  if (form.receiveEmail.length === 0) {
    recipientError.value = t('emptyRecipientMsg')
    composerPanel.value?.querySelector('.recipient-field input')?.focus()
    ElMessage({
      message: t('emptyRecipientMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.subject) {
    subjectError.value = t('emptySubjectMsg')
    composerPanel.value?.querySelector('.subject-field input')?.focus()
    ElMessage({
      message: t('emptySubjectMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.content) {
    form.content = editor.value.getContent();
  }

  if (!form.content) {
    ElMessage({
      message: t('emptyContentMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.manyType === 'divide' && form.attachments.length > 0) {
    ElMessage({
      message: t('noSeparateSendMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (sending.value) {
    ElMessage({
      message: t('sendingErrorMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  const percentMessage = ElMessage({
    message: () => h(sendPercent, {value: percent.value, desc: t('sending')}),
    dangerouslyUseHTMLString: true,
    plain: true,
    duration: 0,
    customClass: 'message-bottom'
  })

  sending.value = true

  const epoch = emailStore.syncSession(), operation = composeGeneration
  const payload = sendAttempt.prepare(form)
  form.requestId = payload.requestId
  uncertainSend.value = true
  const saved = await saveRecovery()
  if (operation !== composeGeneration || epoch !== emailStore.syncSession()) { percentMessage?.close(); return }
  if (!saved) {
    percentMessage?.close()
    sending.value = false
    saveState.value = 'error'
    return
  }
  const submittedDatabase = activeDatabase, submittedRecoveryId = recoveryId, submittedDraftId = form.draftId, submittedDraftVersion = baseDraftVersion
  emailSend(payload, (e) => {
    if (operation === composeGeneration && e.total) percent.value = Math.round((e.loaded * 98) / e.total)
  }).then(async emailList => {
    // Clean up the captured submission even after a mailbox switch. The
    // repository compares payloads before deleting any subsequently edited draft.
    let cleanupFailed = false
    try {
      await createComposeRecovery(submittedDatabase).clearSubmitted(submittedRecoveryId, submittedDraftId, payload, submittedDraftVersion)
    } catch { cleanupFailed = true }
    if (epoch !== emailStore.syncSession() || operation !== composeGeneration) return
    sendAttempt.reset()
    emailList.forEach(item => emailStore.sendScroll?.addItem(item))
    ElNotification({ title: t('ux.sendSubmitted'), type: 'success', message: emailList[0]?.subject || form.subject, position: 'bottom-right' })
    if (cleanupFailed) ElMessage({ message: t('ux.sentCleanupFailed'), type: 'warning' })
    userStore.refreshUserInfo()
    addRecipientRecord()
    if (submittedDraftId != null) draftStore.refreshList++
    finishClose()
  }).catch((e) => {
    if (epoch !== emailStore.syncSession() || operation !== composeGeneration) return
    // Only a confirmed not-sent result permits a new attempt for the same payload.
    if (e.code === 424) {
      sendAttempt.reset()
      form.requestId = ''
      uncertainSend.value = false
    }
    ElNotification({
      title: t('sendFailMsg'),
      type: e.code === 403 ? 'warning' : 'error',
      message: e.message || t('reqFailErrorMsg'),
      position: 'bottom-right'
    })
    if (e.code === 401) {
      endSession();
      return;
    }
    show.value = true
    void saveRecovery()
    addRecipientRecord();
  }).finally(() => {
    percentMessage?.close()
    if (operation === composeGeneration) { percent.value = 0; sending.value = false }
  })
}

function addRecipientRecord() {
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(
      email => !form.receiveEmail.includes(email)
  );

  writerStore.sendRecipientRecord.unshift(...form.receiveEmail);
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.slice(0, 500);
}

function clearSession() {
  if (show.value) void saveRecovery()
  recoveries.value = []
  recoveryReadError.value = false
  closePrompt.value = false
  show.value = false
  resetForm()
  nextTick(loadRecoveries)
}

function resetForm() {
  resetting = true
  clearTimeout(saveTimer)
  recoveryId = crypto.randomUUID()
  baseDraftVersion = null
  saveState.value = 'idle'
  saveRevision = 0
  savedRevision = -1
  uncertainSend.value = false
  sending.value = false
  draftBusy.value = false
  percent.value = 0
  attachmentReads.value = 0
  composeGeneration++
  sendAttempt.reset()
  form.requestId = ''
  form.receiveEmail = []
  form.subject = ''
  form.content = ''
  form.text = ''
  defValue.value = ''
  form.manyType = null
  form.attachments = []
  form.sendType = ''
  form.emailId = 0
  form.draftId = null
  backReply.content = ''
  backReply.subject = ''
  backReply.receiveEmail = []
  backReply.sendType = ''
  editor.value?.clearEditor?.()
  resetting = false
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function focusChange() {
  if (selectStatus) openSelect()
}

function openForward(email) {
  if (sending.value || draftBusy.value) return
  if (show.value && hasContent()) void saveRecovery()
  resetForm();

  email.subject = email.subject || ''

  form.subject = email.subject
  form.sendType = 'forward'
  form.emailId = email.emailId

  defValue.value = ''
  const operation = composeGeneration, epoch = emailStore.syncSession()

  setTimeout(() => {
    if (operation !== composeGeneration || epoch !== emailStore.syncSession()) return
    defValue.value = `
      ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
    `
    form.content = defValue.value
    open()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })

  });
}

function openReply(email) {
  if (sending.value || draftBusy.value) return
  if (show.value && hasContent()) void saveRecovery()
  resetForm();

  email.subject = email.subject || ''

  form.receiveEmail.push(email.sendEmail)
  form.subject = (
      email.subject.startsWith('Re:') ||
      email.subject.startsWith('Re：') ||
      email.subject.startsWith('回复：') ||
      email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''
  const operation = composeGeneration, epoch = emailStore.syncSession()

  setTimeout(() => {
    if (operation !== composeGeneration || epoch !== emailStore.syncSession()) return
    defValue.value = `
    <div></div>
    <div>
    <br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <articl>
          ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
      </article>
    </blockquote>`
    form.content = defValue.value
    open()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })
  })

}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function open() {
  if (sending.value || draftBusy.value) return
  activeDatabase = db.value
  if (!accountStore.currentAccount.email) {
    form.sendEmail = userStore.user.email;
    form.accountId = userStore.user.account.accountId;
    form.name = userStore.user.name;
  } else {
    form.sendEmail = accountStore.currentAccount.email;
    form.accountId = accountStore.currentAccount.accountId;
    form.name = accountStore.currentAccount.name;
  }
  show.value = true;
  focusEditor()
}

function openDraft(draft) {
  if (sending.value || draftBusy.value) return
  if (show.value && hasContent()) void saveRecovery()
  resetForm()
  activeDatabase = db.value
  Object.assign(form, {...draft})
  baseDraftVersion = draftVersion(draft)
  sendAttempt.restore(form)
  uncertainSend.value = !!form.requestId
  defValue.value = ''
  const operation = composeGeneration
  setTimeout(() => { if (operation === composeGeneration) defValue.value = form.content })
  show.value = true;
  focusEditor()
}

const handleKeyDown = (event) => {
  if (!show.value || sending.value || closePrompt.value || showContacts.value || document.querySelector('.tox-dialog, .el-message-box')) return
  if (event.key === 'Escape') { event.preventDefault(); close() }
  // Keep keyboard navigation in the custom compose dialog. TinyMCE handles its
  // own iframe toolbar; native Tab reaches the next control through the iframe.
  if (event.key === 'Tab') {
    const controls = [...(composerPanel.value?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, iframe, [tabindex="0"]') || [])]
      .filter(el => el.getClientRects().length && !el.closest('[inert]'))
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('beforeunload', beforeUnload)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  updateViewport()
  void loadRecoveries()
});

onUnmounted(() => {
  if (show.value) void saveRecovery()
  clearTimeout(saveTimer)
  composeGeneration++
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('beforeunload', beforeUnload)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
});

function updateViewport() {
  const viewport = window.visualViewport
  if (!viewport || !composerPanel.value) return
  composerPanel.value.style.setProperty('--compose-viewport-height', `${viewport.height}px`)
  composerPanel.value.style.setProperty('--compose-viewport-top', `${viewport.offsetTop}px`)
}

function close() {
  if (!show.value || sending.value || draftBusy.value) return
  if (selectStatus) openSelect()
  if (!hasContent()) { void discardAndClose(); return }
  closePrompt.value = true
}

</script>
<style>
.write-select .el-select-dropdown__list {
  padding: 4px 4px !important;
}
.write-select .el-select-dropdown__item {
  padding: 0 10px 0 10px;
}

.write-select .el-select-dropdown {
  min-width: 0 !important;
}
</style>
<style scoped lang="scss">
.send {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  background: rgb(0 0 0 / 25%);
  min-height: 0;

  .write-box {
    background: var(--el-bg-color);
    width: min(1367px, calc(100% - 80px));
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
      border: 0;
      padding-top: 10px;
    }

    @media (min-width: 1025px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0;

      .title-left {
        align-items: center;
        display: grid;
        grid-template-columns: auto auto auto 1fr;
      }

      .title-text {
        display: flex;
        align-items: center;
      }

      .sender {
        margin-left: 8px;
      }

      .sender-name {
        margin-left: 8px;
        font-weight: bold;
      }

      .send-email {
        color: var(--el-text-color-secondary);
        margin-left: 5px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }


      div {
        display: flex;
        align-items: center;
      }
    }

    .container {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 15px;

      .item-title {
      }

      .button-item {
        display: grid;
        grid-template-columns: auto auto 1fr auto;

        .att-add {
          cursor: pointer;
        }

        .att-clear {
          cursor: pointer;
          margin-left: 10px;
        }

        .att-list {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          padding-left: 10px;
          padding-right: 10px;
          max-height: 110px;
          overflow-y: auto;
          @media (max-width: 450px) {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }

          .att-item {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 5px;
            height: 32px;
            font-size: 14px;
            padding: 4px 5px;
            background: var(--light-ill);
            border-radius: 4px;
            .att-filename {
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

}

.compose-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding-top: 8px;
}
.compose-status.is-error { color: var(--el-color-danger); }
.compose-close-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.compose-close-actions .el-button { margin: 0; }
.compose-recovery {
  position: fixed;
  inset: auto 16px 44px auto;
  max-width: min(480px, calc(100vw - 32px));
  z-index: 1400;
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  box-shadow: var(--el-box-shadow-light);
}
@media (max-width: 600px) {
  .send .write-box .container { gap: 10px; }
  .send .write-box .container .button-item { grid-template-columns: auto auto minmax(0, 1fr) auto; }
  .send .write-box .container .button-item .att-list { grid-column: 1 / -1; grid-row: 2; padding: 6px 0 0; }
  .send .write-box .container .button-item > div:last-child { grid-column: 4; grid-row: 1; }
  .send .write-box .title .title-left { min-width: 0; }
  .send .write-box .title { min-height: 44px; padding: 8px 12px; margin: 0; }
  .send .write-box .title .title-text svg { width: 22px; height: 22px; }
  .send .write-box .title .sender-name { display: none; }
  .send .write-box { height: 100%; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
}

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-dialog) {
  width: 420px !important;
  @media (max-width: 460px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.contacts-bottom {
  display: flex;
  justify-content: end;
  margin-top: 10px;
}

.add-contact {
  color: var(--regular-text-color)
}

.write-select {
  position: absolute;
  width: 300px;
  left: 60px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-input-tag__suffix) {
  padding-right: 4px;
}

.icon {
  cursor: pointer;
}
</style>
