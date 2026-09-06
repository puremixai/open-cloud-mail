<template>
  <main class="specimen">
    <header><p>Cloud Mail / Design system</p><h1>界面的共同语言</h1><p>真实组件、三种主题，以及每个动作的反馈。</p>
      <nav aria-label="预览主题"><button v-for="item in themes" :key="item.value" :aria-pressed="theme === item.value" @click="changeTheme(item.value)">{{ item.label }}</button></nav>
    </header>
    <section><h2>01 / 操作</h2><div class="specimen-row">
      <IconButton action="refresh" label="刷新" @click="feedback = '已刷新'" />
      <IconButton action="star" label="星标邮件" :aria-pressed="star" @click="star = !star" />
      <IconButton action="reply" label="回复" @click="feedback = '回复操作已触发'" />
      <IconButton action="delete" label="删除不可用" disabled />
      <IconButton action="refresh" label="正在刷新" loading />
      <el-button type="primary" @click="feedback = '修改已保存'">保存修改</el-button><el-button disabled>暂不可用</el-button>
    </div><p role="status">{{ feedback || '点击操作，查看原位反馈。' }}</p></section>
    <section><h2>02 / 输入与反馈</h2><label for="specimen-name">显示名称</label><el-input id="specimen-name" v-model="name" placeholder="输入你的名称" />
      <el-alert v-if="!name.trim()" title="名称不能为空，请输入后重试。" type="error" :closable="false" show-icon />
      <p v-else class="muted">你的名字将显示为「{{ name }}」。</p>
    </section>
    <section><h2>03 / 页面状态</h2><div class="specimen-links">
      <a href="/design-preview.html#/inbox">收件箱与阅读区</a><a href="/design-preview.html?state=empty#/inbox">空邮箱</a>
      <a href="/design-preview.html?state=error#/inbox">失败与重试</a><a href="/design-preview.html?state=slow#/inbox">慢网与骨架屏</a>
    </div></section>
    <section><h2>04 / 排版</h2><h3>把注意力留给邮件</h3><p>文字先被看清，层级才有意义。发件人、主题、正文和时间分别承担不同的角色。</p><p class="muted">Secondary text · 次要信息</p><p class="numbers">128 封 · 4.18 KB · 09:41</p></section>
  </main>
</template>
<script setup>
import { ref } from 'vue'
import IconButton from '@/components/icon-button/index.vue'
const theme = ref(document.documentElement.className || 'light'), star = ref(true), name = ref('林'), feedback = ref('')
const themes = [{ value: 'win95', label: 'Win95' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]
function changeTheme(value) { theme.value = value; document.documentElement.className = value === 'light' ? '' : value }
</script>
<style scoped>
.specimen { max-width: 880px; margin: auto; padding: 56px 28px; color: var(--el-text-color-primary); }
header > p:first-child { font-size: 12px; color: var(--mail-muted); letter-spacing: .08em; }
h1 { margin: 12px 0; font-size: 32px; letter-spacing: -.03em; }
header > p { color: var(--mail-muted); }
nav { display: flex; gap: 8px; margin: 24px 0; }
nav button { min-height: 36px; padding: 6px 16px; border: 1px solid var(--mail-border); color: inherit; cursor: pointer; }
nav button[aria-pressed="true"] { background: var(--mail-selected); }
section { padding: 28px 0; border-top: 1px solid var(--mail-border); }
h2 { font-size: 14px; font-weight: 600; color: var(--mail-muted); margin-bottom: 20px; }
h3 { font-size: 24px; margin-bottom: 12px; }
section > p { margin: 12px 0; line-height: 1.8; }
.specimen-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
label { display: block; margin-bottom: 8px; }
.el-input { max-width: 400px; display: flex; margin-bottom: 10px; }
.el-alert { max-width: 400px; }
.muted { color: var(--mail-muted); font-size: 13px; }
.numbers { font-variant-numeric: tabular-nums; }
.specimen-links { display: flex; flex-wrap: wrap; gap: 12px 24px; }
a { color: var(--el-color-primary); text-underline-offset: 4px; }
</style>
