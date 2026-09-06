<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               :empty-message="params.search ? 'ux.emptySearch' : undefined"
               :empty-hint="params.search ? 'ux.emptySearchHint' : undefined"
               actionLeft="4px"
               @jump="jumpContent"
  >
    <template #filters>
      <form class="inbox-search" role="search" @submit.prevent="submitSearch">
        <label class="sr-only" for="inbox-search-input">{{ t('ux.searchInbox') }}</label>
        <div class="search-input-row">
          <input id="inbox-search-input" type="search" v-model="searchInput" :placeholder="t('ux.searchPlaceholder')" :title="t('ux.searchHint')" maxlength="200" autocomplete="off" />
          <button class="search-submit" type="submit">{{ t('ux.searchMail') }}</button>
          <IconButton v-if="params.search || searchInput" class="search-clear" data-test="clear-search" action="clear" :label="t('ux.clearSearch')" @click="clearSearch" />
        </div>
        <span v-if="params.search" class="search-scope" role="status">{{ t(Number(accountStore.currentAccount.allReceive) === 1 ? 'ux.searchAllMailboxes' : 'ux.searchCurrentInbox') }} · {{ scroll.loading || scroll.refreshing ? t('ux.searchingMail') : scroll.listError ? t('mailLoadFailed') : t('ux.searchResults', { count: scroll.total || 0 }) }}</span>
      </form>
    </template>
    <template #empty-action v-if="params.search"><button type="button" @click="clearSearch">{{ t('ux.clearSearch') }}</button></template>
    <template #first>
      <IconButton @click="changeTimeSort" :action="params.timeSort === 0 ? 'sortAsc' : 'sortDesc'" :label="t(params.timeSort === 0 ? 'ux.oldestFirst' : 'ux.newestFirst')" />
    </template>

  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {onMounted, reactive, ref, watch} from "vue";
import {useMailPolling} from '@/utils/mail-polling.js';
import router from "@/router/index.js";
import IconButton from '@/components/icon-button/index.vue'
import { useUiStore } from '@/store/ui.js'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const { t } = useI18n()
const searchInput = ref('')
const params = reactive({
  timeSort: 0,
  search: '',
})

function submitSearch() {
  params.search = searchInput.value.trim()
  if (emailStore.contentData.source === 'email') emailStore.contentData.email = null
  if (route.query?.message) {
    const query = { ...route.query }; delete query.message
    router.replace({ query })
  }
  scroll.value.refreshList(true)
}
function clearSearch() { searchInput.value = ''; submitSearch() }

onMounted(() => {
  emailStore.emailScroll = scroll.value;
})


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList(true);
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList(true);
}

function jumpContent(email) {
  if (useUiStore().splitReader && emailStore.contentData.source === 'email' && emailStore.contentData.email?.emailId === email.emailId) return
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.admin = false
  emailStore.contentData.showUnread = true
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  emailStore.contentData.source = 'email'
  if (useUiStore().splitReader) router.replace({ query: { ...router.currentRoute.value.query, message: email.emailId } })
  else router.push({ path: '/mail', query: { message: email.emailId, source: 'email' } })
}

useMailPolling(async (signal, valid) => {
  if (route.name !== 'email' || params.search || settingStore.settings.autoRefresh < 2 || scroll.value.firstLoad) return
  const accountId = accountStore.currentAccountId
  const latest = scroll.value.latestEmail
  if (!latest || latest.reqAccountId !== accountId) return
  try {
    const list = await emailLatest(latest.emailId, accountId, latest.allReceive, { signal })
    if (!valid()) return
    for (const email of list) scroll.value.addItem({ ...email, reqAccountId: accountId, allReceive: latest.allReceive })
  } catch (error) {
    if (valid() && [401, 403].includes(error?.code)) settingStore.settings.autoRefresh = 0
  }
}, () => Math.max(3, settingStore.settings.autoRefresh || 0) * 1000,
() => JSON.stringify([route.name, emailStore.generation, accountStore.currentAccountId, accountStore.currentAccount.allReceive, params.timeSort, params.search, settingStore.settings.autoRefresh]))

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
    emailList(accountId, allReceive, emailId, params.timeSort, size, 0, full, { ...options, search: params.search })
  ).then(data => {
    data.latestEmail ||= { emailId: 0 }
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>
<style scoped>
.inbox-search { padding: 10px 12px 6px; display: grid; gap: 4px; font-size: 14px; }
.inbox-search label { font-weight: 600; }
.search-input-row { display: flex; align-items: center; gap: 8px; }
.search-input-row input { flex: 1; min-width: 0; padding: 6px 10px; border: 1px solid var(--el-border-color); background: var(--el-fill-color-blank); color: var(--el-text-color-primary); font: inherit; min-height: 36px; }
.search-input-row button { font: inherit; min-height: 36px; cursor: pointer; }
.search-submit, .search-clear { flex: 0 0 auto; border: 1px solid var(--el-border-color); border-radius: 4px; padding: 6px 12px; color: var(--el-text-color-primary); background: var(--el-fill-color-blank); }
.search-clear { padding-inline: 7px; }
.search-submit:hover, .search-clear:hover { border-color: var(--el-color-primary); }
:global(html.win95) .search-submit, :global(html.win95) .search-clear { border-radius: 0; background: #c0c0c0; border-color: #808080; box-shadow: inset 1px 1px #fff, inset -1px -1px #404040; }
:global(html.win95) .search-submit:active, :global(html.win95) .search-clear:active { box-shadow: inset 1px 1px #404040, inset -1px -1px #fff; }
.search-scope { color: var(--secondary-text-color); font-size: 12px; }
</style>
