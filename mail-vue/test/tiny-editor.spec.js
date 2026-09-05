import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { loadTinyMCE } from '@/components/tiny-editor/load-runtime.js'
import TinyEditor from '@/components/tiny-editor/index.vue'

vi.mock('@/components/tiny-editor/load-runtime.js', () => ({ loadTinyMCE: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: ref('en') }) }))
let wrapper, runtime, instances
beforeEach(() => {
  setActivePinia(createPinia())
  instances = []
  runtime = { init: vi.fn(options => {
    const events = {}
    let content = ''
    let resolve
    const promise = new Promise(r => { resolve = r })
    const instance = {
      on: (name, fn) => { events[name] = fn },
      setContent: vi.fn(value => { content = value }), getContent: vi.fn(() => content),
      focus: vi.fn(), remove: vi.fn(),
      ready() { events.init(); resolve([instance]) },
      type(value) { content = value; events['input change']() },
      options,
    }
    options.setup(instance)
    instances.push(instance)
    return promise
  }) }
  loadTinyMCE.mockReset().mockResolvedValue(runtime)
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals() })
const render = () => mount(TinyEditor, { props: { defValue: '<p>saved</p>' }, global: { mocks: { $t: key => key }, stubs: { loading: true } } })

it('keeps the target mounted and content readable until initialization, then honors requested focus', async () => {
  wrapper = render()
  expect(wrapper.find('textarea').exists()).toBe(true)
  expect(wrapper.get('[role="status"]').text()).toContain('ux.editorLoading')
  expect(wrapper.vm.getContent()).toBe('<p>saved</p>')
  wrapper.vm.focus()
  await flushPromises()
  expect(instances[0].options.target).toBe(wrapper.get('textarea').element)
  expect(instances[0].focus).not.toHaveBeenCalled()
  instances[0].ready(); await flushPromises()
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
  expect(instances[0].focus).toHaveBeenCalledOnce()
})

it('offers a real retry after script failure and retains content cleared before readiness', async () => {
  loadTinyMCE.mockRejectedValueOnce(new Error('offline'))
  wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('ux.editorLoadFailed')
  wrapper.vm.clearEditor()
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(loadTinyMCE).toHaveBeenCalledTimes(2)
  instances[0].ready(); await flushPromises()
  expect(wrapper.vm.getContent()).toBe('')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('preserves edited content while theme reinitialization replaces the editor', async () => {
  wrapper = render(); await flushPromises()
  instances[0].ready(); await flushPromises()
  instances[0].type('<p>unsaved words</p>')
  useUiStore().dark = !useUiStore().dark
  await flushPromises()
  expect(instances[0].remove).toHaveBeenCalledOnce()
  expect(wrapper.vm.getContent()).toBe('<p>unsaved words</p>')
  instances[1].ready(); await flushPromises()
  expect(instances[1].getContent()).toBe('<p>unsaved words</p>')
})

it('does not initialize an editor after its component unmounts during script loading', async () => {
  let resolve
  loadTinyMCE.mockReturnValue(new Promise(r => { resolve = r }))
  wrapper = render(); await flushPromises()
  wrapper.unmount(); wrapper = null
  resolve(runtime); await flushPromises()
  expect(runtime.init).not.toHaveBeenCalled()
})

it('serializes theme changes during initialization and ignores stale initialization callbacks', async () => {
  wrapper = render(); await flushPromises()
  useUiStore().dark = !useUiStore().dark; await flushPromises()
  expect(runtime.init).toHaveBeenCalledOnce()
  instances[0].ready(); await flushPromises()
  expect(runtime.init).toHaveBeenCalledTimes(2)
  expect(wrapper.find('[role="status"]').exists()).toBe(true)
  instances[1].ready(); await flushPromises()
  expect(wrapper.vm.getContent()).toBe('<p>saved</p>')
})

it('offers retry after TinyMCE itself rejects initialization', async () => {
  runtime.init.mockRejectedValueOnce(new Error('skin unavailable'))
  wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('ux.editorLoadFailed')
  await wrapper.get('button').trigger('click'); await flushPromises()
  instances[0].ready(); await flushPromises()
  expect(wrapper.vm.getContent()).toBe('<p>saved</p>')
})

it('ignores delayed init and content callbacks after unmount', async () => {
  wrapper = render(); await flushPromises()
  const instance = instances[0]
  const original = wrapper
  wrapper.unmount(); wrapper = null
  instance.ready(); instance.type('<p>late</p>'); await flushPromises()
  expect(instance.focus).not.toHaveBeenCalled()
  expect(original.emitted('change')).toBeUndefined()
  expect(instance.remove).toHaveBeenCalled()
})

it('inserts durable local image bytes that survive serialized recovery and a new editor', async () => {
  const dataUrl = 'data:image/png;base64,aGVsbG8='
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { this.result = dataUrl; this.onload() }
  })
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
    Object.defineProperty(this, 'files', { value: [new File(['hello'], 'local.png', { type: 'image/png' })] })
    this.dispatchEvent(new Event('change'))
  })
  wrapper = render(); await flushPromises()
  instances[0].ready(); await flushPromises()
  instances[0].options.file_picker_callback((src, metadata) => {
    expect(src).toBe(dataUrl)
    expect(metadata.title).toBe('local.png')
    instances[0].type(`<p>Inline image</p><img src="${src}">`)
  })
  const recovered = JSON.parse(JSON.stringify({ content: wrapper.vm.getContent() }))
  wrapper.unmount()
  wrapper = mount(TinyEditor, { props: { defValue: recovered.content }, global: { mocks: { $t: key => key }, stubs: { loading: true } } })
  await flushPromises(); instances[1].ready(); await flushPromises()
  expect(wrapper.vm.getContent()).toContain(`src="${dataUrl}"`)
  expect(wrapper.vm.getContent()).not.toContain('blob:')
})
