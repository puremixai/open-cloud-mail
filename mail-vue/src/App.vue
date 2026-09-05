<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <Bootstrap :initialize="initialize"><router-view /></Bootstrap>
  </el-config-provider>
</template>
<script setup>
import { RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import Bootstrap from "@/components/bootstrap/index.vue"
defineProps({ initialize: { type: Function, required: true } })
import { useI18n } from "vue-i18n";
import { watch } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
const { locale } = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)
</script>
