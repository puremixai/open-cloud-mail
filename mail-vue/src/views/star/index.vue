<template>
  <emailScroll type="star" ref="scroll"
               :allow-star="false"
               :cancel-success="cancelStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel, starList} from "@/request/star.js";
import {useEmailStore} from "@/store/email.js";
import {defineOptions, onMounted, ref} from "vue";
import router from "@/router/index.js";
import { useUiStore } from '@/store/ui.js'

defineOptions({
  name: 'star'
})

const scroll = ref({})
const emailStore = useEmailStore();

function jumpContent(email) {
  if (useUiStore().splitReader && emailStore.contentData.source === 'star' && emailStore.contentData.email?.emailId === email.emailId) return
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.admin = false
  emailStore.contentData.showUnread = false
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  emailStore.contentData.source = 'star'
  if (useUiStore().splitReader) router.replace({ query: { ...router.currentRoute.value.query, message: email.emailId } })
  else router.push({ path: '/mail', query: { message: email.emailId, source: 'star' } })
}

function getEmailList(emailId, size, options) {
  return emailStore.fetchList(full => starList(emailId, size, full, options))
}

function cancelStar(email) {
  emailStore.cancelStarEmailId = email.emailId
  scroll.value.deleteEmail([email.emailId])
}

onMounted(() => {
  emailStore.starScroll = scroll.value
})

</script>
