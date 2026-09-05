<template>
  <emailScroll ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
               :show-first-loading="false"
               :showStar="false"
               @delete-draft="deleteDraft"
               :type="'draft'"
  >
    <template #name="props">
      <span class="send-email">{{ props.email.receiveEmail?.join(',') || '(' + $t('noRecipient') + ')' }}</span>
    </template>
    <template #subject="props">
      {{ props.email.subject || '(' + $t('noSubject') + ')' }}
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, ref, watch} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";
import db from "@/db/db.js"
import { useEmailStore } from "@/store/email.js"
import { ElMessage } from "element-plus"
import { useI18n } from "vue-i18n"

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const scroll = ref({})
const emailStore = useEmailStore()
const { t } = useI18n()

watch(() => draftStore.refreshList, () => { scroll.value.refreshList?.() })

async function getEmailList() {
  const database = db.value
  const list = await database.draft.orderBy('createTime').reverse().toArray()
  return { list, total: list.length }
}

async function deleteDraft(draftIds) {
  const database = db.value, epoch = emailStore.generation
  try {
    await database.transaction('rw', database.draft, database.att, async () => {
      await database.draft.bulkDelete(draftIds)
      await database.att.bulkDelete(draftIds)
    })
    if (epoch === emailStore.generation) draftStore.refreshList++
  } catch {
    if (epoch === emailStore.generation) ElMessage({ message: t('reqFailErrorMsg'), type: 'error' })
  }
}

async function jumpContent(email) {
  const database = db.value, epoch = emailStore.generation
  try {
    const att = await database.att.get(email.draftId)
    if (epoch !== emailStore.generation || database !== db.value) return
    uiStore.writerRef.openDraft({ ...email, attachments: att?.attachments || [] })
  } catch {
    if (epoch === emailStore.generation) ElMessage({ message: t('mailLoadFailed'), type: 'error' })
  }
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
