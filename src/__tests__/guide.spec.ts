import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import MascotGuide from '../components/MascotGuide.vue'
import ModeIcon from '../components/ModeIcon.vue'
import { GUIDE_FLOW, type GuideContext } from '../data/guideFlow'
import { MODE_ART } from '../data/modeArt'
import { WORKSPACE_MODES } from '../data/workspaceModes'
import { useFilingStore } from '../stores/filing'

// jsdom ในชุดนี้ไม่ให้ localStorage มา — ใส่ตัวจำลองให้ก่อน
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  },
})

function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }],
  })
  const wrapper = mount(MascotGuide, {
    props: { typingDelay: 0 },
    global: { plugins: [pinia, router] },
  })
  return { wrapper, router }
}

const chip = (wrapper: ReturnType<typeof setup>['wrapper'], label: string) =>
  wrapper.findAll('.guide-options .chip').find((c) => c.text() === label)!

describe('ตัวการ์ตูนผู้ช่วย', () => {
  it('เปิดแล้วถามว่าวันนี้จะทำเรื่องอะไร และมีตัวเลือกจัดการเงิน ภาษี', async () => {
    const { wrapper } = setup()
    expect(wrapper.find('.guide-panel').exists()).toBe(false)
    await wrapper.find('.guide-fab').trigger('click')
    await flushPromises()

    expect(wrapper.find('.guide-msg.bot').text()).toBe('วันนี้จะทำเรื่องอะไรเอ่ย?')
    const labels = wrapper.findAll('.guide-options .chip').map((c) => c.text())
    expect(labels).toContain('จัดการเงิน')
    expect(labels).toContain('เรื่องภาษี')
    wrapper.unmount()
  })

  it('เลือกภาษี → ลดหย่อน แล้วแนะนำจากตัวเลขจริงในแบบภาษี', async () => {
    const { wrapper } = setup()
    useFilingStore().income.salary = 1_500_000
    await wrapper.find('.guide-fab').trigger('click')
    await flushPromises()

    await chip(wrapper, 'เรื่องภาษี').trigger('click')
    await chip(wrapper, 'ลดหย่อนยังไงให้คุ้ม').trigger('click')
    await flushPromises()

    const bots = wrapper.findAll('.guide-msg.bot')
    const last = bots[bots.length - 1]!
    expect(last.text()).toMatch(/ประหยัดภาษีได้ ฿/)
    expect(wrapper.findAll('.guide-msg.user').map((m) => m.text())).toEqual([
      'เรื่องภาษี',
      'ลดหย่อนยังไงให้คุ้ม',
    ])
    wrapper.unmount()
  })

  it('กดปุ่มในคำแนะนำแล้วพาไปหน้านั้นและปิดผู้ช่วย', async () => {
    const { wrapper, router } = setup()
    await wrapper.find('.guide-fab').trigger('click')
    await flushPromises()
    await chip(wrapper, 'เรื่องภาษี').trigger('click')
    await chip(wrapper, 'ลองถ้าขึ้นเงินเดือน').trigger('click')
    await flushPromises()

    const action = wrapper.findAll('.guide-actions button').find((b) => b.text().includes('จำลอง'))!
    await action.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/calculator/what-if')
    expect(wrapper.find('.guide-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ทุกตัวเลือกพาไปโหนดที่มีอยู่จริง และทุกคำตอบมีทางไปต่อ', () => {
    const ctx: GuideContext = {
      loggedIn: true,
      workspaceId: 'w1',
      workspaceName: 'สมุดทดสอบ',
      advice: { suggestions: [], currentTax: 0, taxIfAll: 0, amountIfAll: 0, reason: 'no-income' },
      daysToYearEnd: 86,
      nearest: null,
      app: { installed: false, canPrompt: false, hint: 'วิธีติดตั้ง' },
    }
    for (const [id, build] of Object.entries(GUIDE_FLOW)) {
      const node = build(ctx)
      expect(node.text.length, id).toBeGreaterThan(0)
      expect(node.options.length + node.actions.length, id).toBeGreaterThan(0)
      for (const option of node.options) expect(GUIDE_FLOW[option.next], `${id} → ${option.next}`).toBeTruthy()
      for (const action of node.actions) expect(action.to ?? action.run, `${id} → ${action.label}`).toBeTruthy()
    }
  })

  it('ถามเรื่องติดตั้งแอป: ไม่มีหน้าต่างติดตั้ง (เช่น iPhone) ก็บอกวิธีติดตั้งเอง', async () => {
    const { wrapper } = setup()
    await wrapper.find('.guide-fab').trigger('click')
    await flushPromises()
    await chip(wrapper, 'ติดตั้งเป็นแอปบนมือถือ').trigger('click')
    await flushPromises()

    const bots = wrapper.findAll('.guide-msg.bot')
    expect(bots[bots.length - 1]!.text()).toContain('หน้าจอ')
    wrapper.unmount()
  })

  it('ติดตั้งแล้วไม่ต้องชวนติดตั้งซ้ำ และเบราว์เซอร์ที่ติดตั้งได้มีปุ่มติดตั้งเลย', () => {
    const base: Omit<GuideContext, 'app'> = {
      loggedIn: false,
      workspaceId: null,
      workspaceName: '',
      advice: { suggestions: [], currentTax: 0, taxIfAll: 0, amountIfAll: 0, reason: 'no-income' },
      daysToYearEnd: 1,
      nearest: null,
    }
    const installed: GuideContext = { ...base, app: { installed: true, canPrompt: false, hint: '' } }
    expect(GUIDE_FLOW.root!(installed).options.map((o) => o.next)).not.toContain('install')

    const chrome: GuideContext = { ...base, app: { installed: false, canPrompt: true, hint: '' } }
    expect(GUIDE_FLOW.install!(chrome).actions).toEqual([{ label: 'ติดตั้งเลย', run: 'install' }])
  })
})

describe('ไอคอนโหมดสมุดเปลี่ยนตามรูปแบบเว็บ', () => {
  it('ทุกโหมดมีภาพการ์ตูน และธีมน่ารักแสดงภาพแทนไอคอนเส้น', async () => {
    for (const mode of WORKSPACE_MODES) {
      const doc = new DOMParser().parseFromString(MODE_ART[mode.key], 'image/svg+xml')
      expect(doc.querySelector('parsererror'), mode.key).toBeNull()
    }

    setActivePinia(createPinia())
    document.documentElement.setAttribute('data-style', 'normal')
    localStorage.setItem('taxflow_style', 'normal')
    const plain = mount(ModeIcon, { props: { mode: 'sme' } })
    await flushPromises()
    expect(plain.find('.mode-art').exists()).toBe(false)
    plain.unmount()

    localStorage.setItem('taxflow_style', 'cute')
    const cute = mount(ModeIcon, { props: { mode: 'sme' } })
    await flushPromises()
    expect(cute.find('.mode-art svg').exists()).toBe(true)
    cute.unmount()
  })
})
