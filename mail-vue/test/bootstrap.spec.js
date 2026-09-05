import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Bootstrap from '@/components/bootstrap/index.vue'

it('mounts loading immediately and recovers from init failure through retry', async () => {
  let reject
  const initialize = vi.fn().mockImplementationOnce(() => new Promise((_, r) => { reject = r })).mockResolvedValueOnce()
  const wrapper = mount(Bootstrap, { props: { initialize }, slots: { default: '<p>mail shell</p>' } })
  expect(wrapper.find('[role="status"]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('mail shell')
  reject(new Error('offline')); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('mail shell')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})
