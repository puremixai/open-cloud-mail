import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
vi.mock('@/layout/aside/index.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/layout/header/index.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/layout/main/index.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/layout/write/index.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/layout/win95/frame.vue', () => ({ default: { template: '<div><slot /></div>' } }))
let wrapper
beforeEach(() => { vi.stubGlobal('innerWidth', 1440); setActivePinia(createPinia()); useUserStore().user.email = 'test@example.com' })
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
it('preserves manual sidebar choices across resize and restores the choice for each breakpoint', async () => {
  const Layout = (await import('@/layout/index.vue')).default
  wrapper = mount(Layout, { global: { stubs: { 'el-container': { template: '<div><slot /></div>' }, 'el-main': { template: '<div><slot /></div>' }, 'el-aside': true, 'el-header': true } } })
  const ui = useUiStore()
  ui.asideShow = false; await nextTick()
  vi.stubGlobal('innerWidth', 1500); window.dispatchEvent(new Event('resize')); await nextTick()
  expect(ui.asideShow).toBe(false)
  ui.asideShow = true; await nextTick()
  vi.stubGlobal('innerWidth', 700); window.dispatchEvent(new Event('resize')); await nextTick()
  expect(ui.asideShow).toBe(false)
  vi.stubGlobal('innerWidth', 1440); window.dispatchEvent(new Event('resize')); await nextTick()
  expect(ui.asideShow).toBe(true)
})
