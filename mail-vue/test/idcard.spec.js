import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import IdentityCard from '@/layout/win95/idcard.vue'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, meta: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/router', () => ({ default: { push: vi.fn(), addRoute: vi.fn(), replace: vi.fn() } }))
vi.mock('@/utils/session.js', () => ({ logoutSession: vi.fn(), endSession: vi.fn() }))
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

let wrapper, desktop, writeText
let width, height, cardWidth, cardHeight
const global = { mocks: { $t: key => key } }
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  useUserStore().user = { name: 'Example', userId: 42, email: 'a.very.long.email@example.com', account: { createTime: '2026-09-06' }, role: {} }
  useSettingStore().settings = { title: 'PureMail' }
  writeText = vi.fn().mockResolvedValue()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  width = 1440; height = 870; cardWidth = 340; cardHeight = 214
  desktop = document.createElement('div')
  document.body.append(desktop)
  Object.defineProperties(desktop, { clientWidth: { get: () => width }, clientHeight: { get: () => height } })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('w95-idcard') ? cardWidth : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('w95-idcard') ? cardHeight : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function () { return parseFloat(this.style.left) || 8 })
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () { return parseFloat(this.style.top) || 56 })
})
afterEach(() => {
  wrapper?.unmount(); desktop.remove()
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers()
})
const render = () => {
  wrapper = mount(IdentityCard, { attachTo: desktop, global })
  const el = wrapper.element
  el.setPointerCapture = vi.fn()
  el.hasPointerCapture = vi.fn(() => true)
  el.releasePointerCapture = vi.fn()
  return wrapper
}
const pointer = (target, type, values = {}) => {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 80, pointerType: 'touch', ...values })
  target.dispatchEvent(event)
}

it('copies the complete email once and resets the inline success feedback', async () => {
  vi.useFakeTimers()
  render()
  let resolve
  writeText.mockReturnValue(new Promise(r => { resolve = r }))
  const button = wrapper.get('.w95-idcard-front .w95-email-copy')
  await button.trigger('click')
  await button.trigger('click')
  expect(writeText).toHaveBeenCalledExactlyOnceWith('a.very.long.email@example.com')
  resolve(); await flushPromises()
  expect(button.text()).toContain('win95IdcardCopyEmailTip')
  await vi.advanceTimersByTimeAsync(1500)
  expect(button.text()).toContain('a.very.long.email@example.com')
})

it('offers a selectable complete address on clipboard failure and restores focus on Escape', async () => {
  writeText.mockRejectedValue(new Error('denied'))
  render()
  await wrapper.get('.w95-idcard-front .w95-email-copy').trigger('click')
  await flushPromises()
  const field = wrapper.get('textarea')
  expect(field.element.value).toBe(useUserStore().user.email)
  expect(document.activeElement).toBe(field.element)
  expect(field.element.selectionEnd).toBe(useUserStore().user.email.length)
  expect(wrapper.get('.w95-email-details').text()).toContain('win95IdcardCopyFailed')
  await field.trigger('keydown', { key: 'Escape' }); await nextTick()
  expect(wrapper.find('.w95-email-details').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.w95-idcard-front .w95-email-more').element)
})

it('ignores a previous account clipboard completion after the email changes', async () => {
  let resolve
  writeText.mockReturnValue(new Promise(r => { resolve = r }))
  render()
  await wrapper.get('.w95-email-copy').trigger('click')
  useUserStore().user.email = 'new@example.net'
  await nextTick(); resolve(); await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe('')
  expect(wrapper.get('.w95-email-copy').text()).toContain('new@example.net')
})

it('persists the selected face and makes the hidden side inert', async () => {
  render()
  await wrapper.get('.w95-idcard-style').trigger('click')
  expect(localStorage.getItem('w95-idcard-style')).toBe('bank')
  expect(wrapper.get('.w95-idcard-front').attributes('inert')).toBeDefined()
  expect(wrapper.get('.w95-idcard-back').attributes('inert')).toBeUndefined()
  expect(wrapper.get('.w95-idcard-style').attributes('aria-label')).toBe('win95IdcardShowFront')
  wrapper.unmount(); render()
  expect(wrapper.classes()).toContain('bank')
})

it('clamps saved positions and the entire card again when the desktop shrinks', async () => {
  localStorage.setItem('w95-idcard-pos', JSON.stringify({ x: 2000, y: 1000 }))
  render(); await nextTick()
  expect(wrapper.element.style.left).toBe('1092px')
  expect(wrapper.element.style.top).toBe('648px')
  width = 320; height = 432; cardWidth = 304; cardHeight = 240
  window.dispatchEvent(new Event('resize')); await nextTick()
  expect(wrapper.element.style.left).toBe('8px')
  expect(wrapper.element.style.top).toBe('184px')
  expect(JSON.parse(localStorage.getItem('w95-idcard-pos'))).toEqual({ x: 8, y: 184 })
})

it('supports captured touch dragging, ignores buttons and secondary pointers, and cleans up cancellation', async () => {
  render(); await nextTick()
  pointer(wrapper.get('.w95-email-copy').element, 'pointerdown')
  expect(wrapper.element.setPointerCapture).not.toHaveBeenCalled()
  pointer(wrapper.element, 'pointerdown', { isPrimary: false })
  expect(wrapper.element.setPointerCapture).not.toHaveBeenCalled()
  pointer(wrapper.element, 'pointerdown')
  pointer(wrapper.element, 'pointermove', { clientX: 51 }); await nextTick()
  expect(wrapper.classes()).not.toContain('dragging')
  pointer(wrapper.element, 'pointermove', { clientX: 250, clientY: 180 }); await nextTick()
  expect(wrapper.classes()).toContain('dragging')
  expect(wrapper.element.style.left).toBe('208px')
  expect(wrapper.element.style.top).toBe('156px')
  pointer(wrapper.element, 'pointercancel'); await nextTick()
  expect(wrapper.classes()).not.toContain('dragging')
  expect(wrapper.element.releasePointerCapture).toHaveBeenCalledWith(1)
  expect(JSON.parse(localStorage.getItem('w95-idcard-pos'))).toEqual({ x: 208, y: 156 })
  expect(writeText).not.toHaveBeenCalled()
})

it('clears the closed preference when reopening from the desktop and survives a remount', async () => {
  localStorage.setItem('w95-idcard-closed', '1')
  useUiStore().win95 = true
  const Frame = (await import('@/layout/win95/frame.vue')).default
  wrapper = mount(Frame, { global })
  expect(wrapper.find('.w95-idcard').exists()).toBe(false)
  await wrapper.findAll('.w95-dicon')[2].trigger('click')
  expect(localStorage.getItem('w95-idcard-closed')).toBeNull()
  expect(wrapper.find('.w95-idcard').exists()).toBe(true)
  wrapper.unmount(); wrapper = mount(Frame, { global })
  expect(wrapper.find('.w95-idcard').exists()).toBe(true)
  await wrapper.get('.w95-idcard-close').trigger('click')
  expect(localStorage.getItem('w95-idcard-closed')).toBe('1')
})
