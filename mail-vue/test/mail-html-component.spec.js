// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ShadowHtml from '../src/components/shadow-html/index.vue'

let wrapper
let observers
beforeEach(() => {
  observers = []
  // jsdom has no layout/ResizeObserver; expose deliveries only to observed elements.
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this) }
    observe(target) { this.targets.add(target) }
    disconnect() { this.targets.clear() }
    unobserve(target) { this.targets.delete(target) }
    deliver(target) { if (this.targets.has(target)) this.callback([{ target }]) }
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals() })
function render(html, locale = 'en', props = {}) {
  const i18n = createI18n({ legacy: false, locale, messages: { en: {}, zh: {} } })
  wrapper = mount(ShadowHtml, { props: { html, ...props }, global: { plugins: [i18n] } })
  return i18n
}
const root = () => wrapper.find('.content-html').element.shadowRoot
const content = () => root().querySelector('.shadow-content')
function dimensions(el, values) {
  for (const [key, value] of Object.entries(values)) Object.defineProperty(el, key, { configurable: true, value })
}
const deliver = target => observers.forEach(observer => observer.deliver(target))

describe('safe shadow email display', () => {
  it('keeps a preheader hidden and clipped inside the shadow root', () => {
    render('<div style="display:none;max-height:0;overflow:hidden">Preview only</div><p>Message</p>')
    const preheader = content().querySelector('div')
    expect(window.getComputedStyle(preheader).display).toBe('none')
    expect(window.getComputedStyle(preheader).overflow).toBe('hidden')
    expect(content().querySelector('p').textContent).toBe('Message')
  })

  it('keeps intended block lines after sanitized nodes enter the shadow root', () => {
    render('<span style="display:block">First line</span><span style="display:block">Second line</span>')
    const lines = [...content().querySelectorAll('span')]
    expect(lines.map(line => window.getComputedStyle(line).display)).toEqual(['block', 'block'])
    expect(lines.map(line => line.textContent)).toEqual(['First line', 'Second line'])
  })

  it('inserts sanitized HTML in the shadow root', () => {
    render('<table><tr><td onclick="alert(1)">Invoice</td></tr></table><iframe srcdoc="evil"></iframe><style>:host{position:fixed}</style>')
    expect(root().querySelector('td').textContent).toBe('Invoice')
    expect(root().querySelector('[onclick], iframe')).toBeNull()
    expect(content().querySelector('style')).toBeNull()
  })

  it('requires a click for remote images and resets consent on changed HTML', async () => {
    render('<img src="https://tracker.test/one">')
    await wrapper.vm.$nextTick()
    expect(root().querySelector('img').hasAttribute('src')).toBe(false)
    expect(wrapper.get('button').text()).toMatch(/load external images/i)
    await wrapper.get('button').trigger('click')
    expect(root().querySelector('img').src).toBe('https://tracker.test/one')
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.setProps({ html: '<img src="https://tracker.test/two">' })
    expect(root().querySelector('img').hasAttribute('src')).toBe(false)
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('resets consent for distinct mail IDs even when the HTML is identical', async () => {
    render('<img src="https://tracker.test/one">', 'zh', { mailId: 'one' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').text()).toMatch(/加载外部图片/)
    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ mailId: 'two' })
    expect(root().querySelector('img').hasAttribute('src')).toBe(false)
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('updates the button when language changes and needs no button for local attachments', async () => {
    const i18n = render('<img src="https://tracker.test/one">')
    i18n.global.locale.value = 'zh-CN'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').text()).toMatch(/加载外部图片/)
    await wrapper.setProps({ html: `<img src="${window.location.origin}/api/oss/attachments/a?signature=abc">` })
    expect(root().querySelector('img').hasAttribute('src')).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('rescales on container resize, reobserves replaced content, and releases observations on unmount', async () => {
    render('<table><tr><td>wide</td></tr></table>')
    const box = wrapper.find('.content-box').element
    const host = wrapper.find('.content-html').element
    dimensions(box, { offsetWidth: 300 })
    dimensions(content(), { scrollWidth: 600, scrollHeight: 400 })
    deliver(content())
    expect(host.style.transform).toBe('scale(0.5)')
    expect(host.style.height).toBe('200px')
    dimensions(box, { offsetWidth: 600 })
    deliver(box)
    expect(host.style.transform).toBe('')
    const oldContent = content()
    await wrapper.setProps({ html: '<p>new content</p>' })
    dimensions(content(), { scrollWidth: 1200, scrollHeight: 600 })
    deliver(content())
    expect(host.style.transform).toBe('scale(0.5)')
    expect(host.style.height).toBe('300px')
    expect(observers.some(observer => observer.targets.has(oldContent))).toBe(false)
    wrapper.unmount(); wrapper = null
    expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
  })

  it('clears stale scaling for empty replacement content and supports missing ResizeObserver', async () => {
    render('<p>wide</p>')
    const host = wrapper.find('.content-html').element
    dimensions(wrapper.find('.content-box').element, { offsetWidth: 300 })
    dimensions(content(), { scrollWidth: 600, scrollHeight: 400 })
    deliver(content())
    await wrapper.setProps({ html: '' })
    expect(host.style.transform).toBe('')
    expect(host.style.height).toBe('')
    wrapper.unmount(); wrapper = null
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => render('<p>hello</p>')).not.toThrow()
  })

  it('resizes when an explicitly loaded image changes overflow and reobserves the new content', async () => {
    render('<img src="https://tracker.test/large">')
    await wrapper.vm.$nextTick()
    const oldContent = content()
    await wrapper.get('button').trigger('click')
    const box = wrapper.find('.content-box').element
    const host = wrapper.find('.content-html').element
    dimensions(box, { offsetWidth: 300 })
    dimensions(content(), { scrollWidth: 900, scrollHeight: 600 })
    root().querySelector('img').dispatchEvent(new Event('load'))
    expect(host.style.height).toBe('200px')
    expect(host.style.transform).toBe(`scale(${1 / 3})`)
    dimensions(content(), { scrollWidth: 600, scrollHeight: 600 })
    deliver(content())
    expect(host.style.height).toBe('300px')
    expect(observers.some(observer => observer.targets.has(oldContent))).toBe(false)
  })
})
