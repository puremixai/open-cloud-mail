<template>
  <div class="editor-box" :aria-busy="showLoading">
    <div v-if="showLoading" class="editor-status" role="status">
      <loading class="loading" />
      <span>{{ $t('ux.editorLoading') }}</span>
    </div>
    <div v-else-if="loadError" class="editor-status" role="alert">
      <span>{{ $t('ux.editorLoadFailed') }}</span>
      <button type="button" class="editor-retry" @click="initialize">{{ $t('ux.retryEditor') }}</button>
    </div>
    <textarea :id="editorId" ref="editorRef" :aria-label="$t('ux.editorLoading')" :aria-hidden="!isInitialized" tabindex="-1"></textarea>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, watch, shallowRef, computed} from 'vue';
import { loadTinyMCE } from './load-runtime.js';
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'

defineExpose({
  clearEditor,
  focus,
  getContent
})

const props = defineProps({
  defValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: () => `editor-${Date.now()}`
  }
});


const {locale} = useI18n()
const emit = defineEmits(['change','focus']);
const editor = shallowRef(null);
const isInitialized = ref(false);
const editorRef = ref(null);
const showLoading = ref(true);
const loadError = ref(false);
const uiStore = useUiStore();
const settingStore = useSettingStore();
let mounted = false;
let generation = 0;
let pendingContent = props.defValue;
let pendingFocus = false;
let initQueue = Promise.resolve();
let cancelInitialization;

onMounted(() => { mounted = true; initialize(); });
onBeforeUnmount(() => { mounted = false; generation++; cancelInitialization?.(); destroyEditor(); });

watch(() => props.defValue, (newValue) => {
  pendingContent = newValue;
  if (isInitialized.value && editor.value && editor.value.getContent() !== newValue) editor.value.setContent(newValue);
});
watch(() => [uiStore.dark, settingStore.lang, locale.value], () => initialize());

const language = computed(() => {
  if (locale.value === 'zh') {
    return 'zh_CN'
  }

  return 'en'
})

function clearEditor() {
  pendingContent = '';
  if (isInitialized.value) editor.value?.setContent('');
}

function initialize() {
  if (!mounted) return;
  if (isInitialized.value && editor.value) {
    pendingContent = editor.value.getContent();
    pendingFocus = pendingFocus || !!editor.value.hasFocus?.();
  }
  const current = ++generation;
  destroyEditor();
  showLoading.value = true;
  loadError.value = false;
  // Reinitializations are serialized so theme changes cannot race over the same textarea.
  initQueue = initQueue.catch(() => {}).then(() => initEditor(current));
}

async function initEditor(current) {
  let timer;
  let active = true;
  let cancel;
  const valid = () => mounted && generation === current && active;
  try {
    const runtime = await loadTinyMCE();
    if (!valid()) return;
    const result = runtime.init({
    target: editorRef.value,
    statusbar: false,
    height: "100%",
    //relative_urls: false,  //阻止 img标签域名和网站域名相同 自动把链接转换相对路径
    //remove_script_host: false, // 阻止删除 URL 中的域名
    forced_root_block: 'div',
    skin: `${uiStore.dark ? 'oxide-dark' : 'oxide'}`,
    content_css: `/tinymce/css/index.css,${uiStore.dark ? 'dark' : 'default'}`,
    content_style: `:root {
         --scrollbar-track-color: ${uiStore.dark ? '#141414' : '#FFFFFF'};
         --scrollbar-thumb-color: ${uiStore.dark ? '#8D9095' : '#A8ABB2'};
    }`,
    plugins: 'link image advlist lists  emoticons fullscreen  table preview code',
    toolbar: 'bold emoticons forecolor backcolor italic fontsize | alignleft aligncenter alignright alignjustify | outdent indent |  bullist numlist | link image  | table code preview fullscreen',
    toolbar_mode: 'scrolling',
    font_size_formats: '8px 10px 12px 14px 16px 18px 24px 36px',
    emoticons_search: false,
    language: language.value,
    language_load: true,
    menubar: false,
    license_key: 'gpl',
    noneditable_class: 'mceNonEditable',
    setup: (ed) => {
      if (!valid()) { ed.remove?.(); return; }
      editor.value = ed;
      ed.on('init', () => {
        if (!valid()) { ed.remove?.(); return; }
        ed.setContent(pendingContent);
        isInitialized.value = true;
        showLoading.value = false;
        if (pendingFocus) { ed.focus(); pendingFocus = false; }
      });
      ed.on('input change', () => {
        if (!valid() || !isInitialized.value) return;
        pendingContent = ed.getContent();
        emit('change', pendingContent, ed.getContent({format: 'text'}));
      });
      ed.on('focus', () => { if (valid()) emit('focus', focus); });
    },
    branding: false,
    file_picker_types: 'image',
    image_dimensions: false,
    image_description: false,
    link_title: false,
    dialog_type: 'none',
    file_picker_callback: (callback, value, meta) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');

      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !valid()) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (!valid() || !editor.value) return;
          // IndexedDB recovery must survive a new browser process. The send API
          // already converts data:image sources to CID attachments.
          callback(reader.result, {title: file.name});
        }
        reader.readAsDataURL(file);
      });

      input.click();
    }
    });
    const cancelled = new Promise(resolve => { cancel = resolve; cancelInitialization = resolve; });
    await Promise.race([
      cancelled,
      Promise.resolve(result),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Editor initialization timed out')), 30000); }),
    ]);
    if (valid() && !isInitialized.value) throw new Error('Editor did not initialize');
  } catch {
    if (valid()) {
      active = false;
      destroyEditor();
      showLoading.value = false;
      loadError.value = true;
    }
  } finally {
    clearTimeout(timer);
    if (cancelInitialization === cancel) cancelInitialization = undefined;
  }
}

function focus() {
  if (mounted && isInitialized.value && editor.value) editor.value.focus();
  else pendingFocus = true;
}

function getContent() {
  return isInitialized.value && editor.value ? editor.value.getContent() : pendingContent;
}

function destroyEditor() {
  isInitialized.value = false;
  if (editor.value) {
    try { editor.value.remove ? editor.value.remove() : editor.value.destroy(); } catch { /* Already removed by TinyMCE. */ }
    editor.value = null;
  }
}
</script>

<style lang="scss" scoped>
.editor-box {
  position: relative;
  height: 100%;
  width: 100%;
}

.loading {
  margin: auto;
}

.editor-box > textarea { visibility: hidden; position: absolute; width: 1px; height: 1px; }
.editor-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; text-align: center; }
.editor-status .loading { margin: 0; }
.editor-retry { color: var(--el-color-primary); cursor: pointer; min-height: 44px; padding: 8px 16px; border: 1px solid currentColor; }

:deep(.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke) {
  width: 80px !important;
}

:deep(.tox.tox-tinymce.tox-fullscreen) {
  padding-right: 15px;
  padding-left: 15px;
  padding-bottom: 15px;
  background: var(--el-bg-color);
  @media (max-width: 767px) {
    padding-right: 10px;
    padding-left: 10px;
    padding-bottom: 10px;
  }
}

:deep(.tox-tinymce) {
  border: none;
  border-radius: 0;
}

:deep(.tox-toolbar__group) {
  padding-left: 0 !important;
  margin: 0 !important;
}

:deep(.tox-tbtn) {
  margin: 0 !important;
}

:deep(.tox .tox-edit-area::before) {
  display: none;
}

</style>
