<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               show-status
               actionLeft="4px"
               :star-cancel="starCancel"
               @jump="jumpContent"
               :time-sort="params.timeSort"
               :type="'send'"
  >
    <template #first>
      <IconButton :action="params.timeSort === 0 ? 'sortAsc' : 'sortDesc'" :label="$t(params.timeSort === 0 ? 'ux.oldestFirst' : 'ux.newestFirst')" @click="changeTimeSort" />
    </template>
  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import router from "@/router/index.js";
import IconButton from '@/components/icon-button/index.vue'
import { useUiStore } from '@/store/ui.js'

defineOptions({
  name: 'send'
})

const emailStore = useEmailStore();
const accountStore = useAccountStore();
const sendScroll = ref({})
const params = reactive({
  timeSort: 0,
})

onMounted(() => {
  emailStore.sendScroll = sendScroll.value;
})

watch(() => accountStore.currentAccountId, () => {
  sendScroll.value.refreshList();
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  sendScroll.value.refreshList();
}

function jumpContent(email) {
  if (useUiStore().splitReader && emailStore.contentData.source === 'send' && emailStore.contentData.email?.emailId === email.emailId) return
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.admin = false
  emailStore.contentData.showUnread = false
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  emailStore.contentData.source = 'send'
  if (useUiStore().splitReader) router.replace({ query: { ...router.currentRoute.value.query, message: email.emailId } })
  else router.push({ path: '/mail', query: { message: email.emailId, source: 'send' } })
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size, options) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, params.timeSort, size, 1, full, options)
  ).then(data => {
    data.latestEmail ||= { emailId: 0 }
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>

<style scoped>
.icon {
  cursor: pointer;
}
</style>
