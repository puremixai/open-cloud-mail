// Development-only preview: every API request is handled locally, including send and delete.
// Vite's production input is index.html; this entry is not part of the deployed build.
if (!import.meta.env.DEV) throw new Error('Design preview is only available in development')
const { default: http } = await import('@/axios/index.js')
const query = new URLSearchParams(location.search)
const savedUi = JSON.parse(localStorage.getItem('ui') || '{}')
const theme = query.get('theme') || (savedUi.win95 === false ? savedUi.dark ? 'dark' : 'light' : 'win95')
localStorage.setItem('token', 'design-preview-only')
localStorage.setItem('setting', JSON.stringify({ lang: query.get('lang') || 'zh' }))
localStorage.setItem('ui', JSON.stringify({ readingPane: true, mailListWidth: 380, ...savedUi, win95: theme === 'win95', dark: theme === 'dark', prevDark: false, accountShow: false }))
document.documentElement.className = theme === 'win95' ? 'win95' : theme === 'dark' ? 'dark' : ''
const account = { accountId: 1, email: 'lin@puremail.example', name: '林', allReceive: 0 }
const user = { userId: 2048, email: account.email, name: '林', account, sendCount: 24,
  permKeys: ['email:send', 'email:delete', 'account:query', 'my:delete'],
  role: { name: '个人邮箱', accountCount: 5, sendCount: 100, sendType: 'day' } }
const samples = [
  ['林知夏', '周末去山里走走？', '路线已经选好了，沿着溪流走两公里，山顶有一家很好喝的咖啡店。', 'zhixia@example.com'],
  ['产品设计组', '收件箱的下一步，一起看这份设计', '把阅读空间留给内容。附件是本周整理的交互清单，期待你的反馈。', 'design@example.com'],
  ['GitHub', 'Your sign-in code is 483921', 'Use this verification code to finish signing in. The code expires in 10 minutes.', 'noreply@github.example'],
  ['慢邮局', '第 028 封 · 关于留白与日常', '每周一封信，记录值得慢下来看的事物。这周，聊聊桌边的一束光。', 'letters@example.com'],
  ['陈雨', 'Re: 九月的阅读清单', '你推荐的那本书已经读完了，最后一章让我想起我们上次的讨论。', 'chenyu@example.com'],
  ['Studio North', 'September notes — a few things worth sharing', 'A small collection of ideas, references, and work in progress from our studio.', 'hello@north.example'],
  ['行程助手', '你的杭州周末行程已整理好', '周六 09:20 出发，入住信息和步行路线都在这封邮件里。', 'trips@example.com'],
  ['许一舟', '设计评审记录：键盘、长文本与移动端边界', '三个主题都过了一遍，还有几个细节我们可以继续调整。', 'yizhou@example.com'],
]
const wideBody = '<table style="width:980px;background:#f3f1eb"><tr><td style="padding:40px"><h1>慢邮局 · September</h1><p>给忙碌生活留一点空白。</p><p>这是一封使用固定宽度排版的示例邮件。切换“原始大小”后，可以横向浏览，保持文字可读。</p></td></tr></table>'
let messages = Array.from({ length: query.get('state') === 'empty' ? 0 : 84 }, (_, index) => {
  const [name, subject, text, sendEmail] = samples[index % samples.length]
  return { emailId: 1000 - index, name, subject, text, sendEmail, toEmail: account.email, accountId: 1,
    type: index < 70 ? 0 : 1, status: 2, isDel: 0, isStar: index % 6 === 1 ? 1 : 0, unread: index < 4 ? 0 : 1,
    createTime: new Date(Date.now() - (index * 78 + 8) * 60000).toISOString(),
    recipient: JSON.stringify([{ address: account.email, name: '林' }]), cc: '[]',
    code: index % 8 === 2 ? '483921' : '',
    content: index % 8 === 3 ? wideBody : `<p>林，你好：</p><p>${text}</p><p>我们希望每一个小细节，都能让日常使用更舒服。你可以直接回复这封邮件，把想法写下来。</p><p>不用着急，等你有空时再看。</p><p>${name}</p>`,
    attList: index % 8 === 1 ? [{ attId: 1, key: 'sample/design-notes.txt', filename: '九月交互设计清单.txt', size: 4280, url: 'data:text/plain;charset=utf-8,Cloud%20Mail%20design%20notes' }] : [],
  }
})
let failed = false
http.defaults.adapter = async config => {
  await new Promise(resolve => setTimeout(resolve, query.get('state') === 'slow' ? 1600 : 180))
  if (config.signal?.aborted) throw new DOMException('Canceled', 'AbortError')
  const url = new URL(config.url, location.origin), path = url.pathname, p = config.params || {}
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {}
  let data = null
  if (path === '/setting/websiteConfig') data = { title: 'PureMail', domainList: ['@puremail.example'], manyEmail: 0, send: 0, addEmail: 1, notice: 1, autoRefresh: 0, r2Domain: '', background: '', loginOpacity: 1, minEmailPrefix: 3 }
  else if (path === '/my/loginUserInfo') data = user
  else if (path === '/account/list') data = p.accountId ? [] : [account]
  else if (path === '/email/list' || path === '/star/list') {
    if (query.get('state') === 'error' && !failed) { failed = true; throw new Error('Network Error') }
    let result = messages.filter(m => path === '/star/list' ? m.isStar : m.type === Number(p.type || 0))
    if (p.search) result = result.filter(m => `${m.name} ${m.sendEmail} ${m.subject}`.toLowerCase().includes(p.search.toLowerCase()))
    if (Number(p.timeSort) === 1) result = [...result].reverse()
    const total = result.length
    if (p.emailId) result = result.slice(result.findIndex(m => m.emailId === Number(p.emailId)) + 1)
    data = { list: result.slice(0, p.size || 50).map(m => ({ ...m, text: m.text, content: '', attList: [] })), total, latestEmail: messages[0] || { emailId: 0 } }
  } else if (path === '/email/detail') data = messages.find(m => m.emailId === Number(p.emailId))
  else if (path === '/email/latest') data = []
  else if (path === '/star/add' || path === '/star/cancel') {
    const m = messages.find(m => m.emailId === Number(body.emailId || p.emailId)); if (m) m.isStar = path.endsWith('/add') ? 1 : 0
  } else if (path === '/email/read') {
    const ids = String(body.emailIds).split(',').map(Number); messages.forEach(m => { if (ids.includes(m.emailId)) m.unread = 1 })
  } else if (path === '/email/delete') {
    const ids = String(url.searchParams.get('emailIds')).split(',').map(Number); messages = messages.filter(m => !ids.includes(m.emailId))
  } else if (path === '/email/send') {
    config.onUploadProgress?.({ loaded: 100, total: 100, progress: 1 })
    const sent = { ...body, emailId: Math.max(2000, ...messages.map(m => m.emailId)) + 1, type: 1, status: 1,
      name: user.name, text: body.subject, createTime: new Date().toISOString(), isStar: 0, unread: 1,
      recipient: JSON.stringify(body.receiveEmail.map(address => ({ address }))), attList: [] }
    messages.unshift(sent)
    data = [sent]
  } else if (path === '/account/setName') { user.name = body.name || user.name; account.name = user.name }
  else if (!['/my/resetPassword', '/my/delete'].includes(path)) throw new Error(`Preview has no handler for ${path}`)
  return { data: { code: 200, data: structuredClone(data) }, config, status: 200, statusText: 'OK', headers: {} }
}
if (query.get('view') === 'components') {
  const { createApp } = await import('vue')
  const { default: ComponentGallery } = await import('./components.vue')
  const { default: i18n } = await import('@/i18n/index.js')
  await import('@/style.css'); await import('@/style-win95.css'); await import('@/mail-design.css')
  await import('element-plus/theme-chalk/dark/css-vars.css')
  i18n.global.locale.value = 'zh'
  createApp(ComponentGallery).use(i18n).mount('#app')
} else await import('@/main.js')
