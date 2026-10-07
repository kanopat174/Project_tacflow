import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import FeatureIntro from '../components/FeatureIntro.vue'
import {
  FEATURE_INTROS,
  introForRoute,
  introStorageKey,
  parseIntroProgress,
  shouldShowIntro,
} from '../data/featureIntros'
import routerInstance from '../router'
import { useIntroStore } from '../stores/intro'
import { useUiStore } from '../stores/ui'

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

describe('ข้อมูลคำแนะนำ', () => {
  it('ทุกชุดผูกกับหน้าที่มีอยู่จริง และทุกขั้นมีหัวเรื่องกับคำอธิบาย', () => {
    const names = new Set(routerInstance.getRoutes().map((r) => r.name))
    for (const [key, intro] of Object.entries(FEATURE_INTROS)) {
      for (const name of intro.routes) expect(names.has(name), `${key} → ${name}`).toBe(true)
      expect(intro.steps.length, key).toBeGreaterThan(0)
      expect(intro.steps.length, `${key} ยาวเกินไป`).toBeLessThanOrEqual(4)
      for (const s of intro.steps) {
        expect(s.title.trim()).not.toBe('')
        expect(s.text.length, `${key}: ${s.title}`).toBeLessThanOrEqual(110)
      }
    }
  })

  it('หน้าหนึ่งมีคำแนะนำได้ชุดเดียว', () => {
    const owners = new Map<string, string>()
    for (const [key, intro] of Object.entries(FEATURE_INTROS)) {
      for (const name of intro.routes) {
        expect(owners.has(name), `${name} ซ้ำใน ${owners.get(name)} กับ ${key}`).toBe(false)
        owners.set(name, key)
      }
    }
  })

  it('หาคำแนะนำตามชื่อหน้า และหน้าที่ไม่มีคืน null', () => {
    expect(introForRoute('calculator-vat')?.key).toBe('calculator-tools')
    expect(introForRoute('login')).toBeNull()
    expect(introForRoute(undefined)).toBeNull()
  })

  it('อ่านความคืบหน้าที่เสียหายได้โดยไม่พัง', () => {
    expect(parseIntroProgress('not json')).toEqual({ seen: [], off: false })
    expect(parseIntroProgress('{"seen":["dashboard",3],"off":true}')).toEqual({ seen: ['dashboard'], off: true })
    expect(introStorageKey(null)).toBe('taxflow_intro_guest')
  })

  it('ไม่แสดงซ้ำ และไม่แสดงเมื่อปิดไว้', () => {
    expect(shouldShowIntro({ seen: [], off: false }, 'quiz')).toBe(true)
    expect(shouldShowIntro({ seen: ['quiz'], off: false }, 'quiz')).toBe(false)
    expect(shouldShowIntro({ seen: [], off: true }, 'quiz')).toBe(false)
  })
})

describe('ตัวการ์ตูนแนะนำฟีเจอร์', () => {
  afterEach(() => {
    store.clear()
    document.body.innerHTML = ''
  })

  async function setup(path = '/quiz') {
    const pinia = createPinia()
    setActivePinia(pinia)
    const page = { template: '<div />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/quiz', name: 'quiz', component: page },
        { path: '/filing', name: 'filing', component: page },
        { path: '/login', name: 'login', component: page },
      ],
    })
    router.push(path)
    await router.isReady()
    const wrapper = mount(FeatureIntro, { props: { startDelay: 0 }, global: { plugins: [pinia, router] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 5))
    await flushPromises()
    return { wrapper, router }
  }

  const bubble = () => document.querySelector('.intro-bubble')
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.intro-bubble button')].find((b) => b.textContent?.trim() === label)

  it('เข้าครั้งแรกแนะนำ กดเข้าใจแล้วจำว่าดูแล้ว เข้าอีกครั้งไม่แนะนำซ้ำ', async () => {
    const first = await setup('/quiz')
    expect(bubble()?.textContent).toContain('ควิซภาษี 1 นาที')
    button('เข้าใจแล้ว')!.click()
    await flushPromises()
    expect(bubble()).toBeNull()
    expect(useIntroStore().progress.seen).toContain('quiz')
    first.wrapper.unmount()

    await setup('/quiz')
    expect(bubble()).toBeNull()
  })

  it('หลายขั้นเดินหน้าและย้อนกลับได้ ขั้นที่หาจุดไม่เจอถูกข้าม', async () => {
    await setup('/filing')
    // หน้าเปล่าในเทสต์ไม่มี .stepper-bar หรือ .summary-card จึงเหลือเฉพาะขั้นที่ไม่ต้องชี้จุด
    expect(bubble()?.textContent).toContain('1/2')
    button('ถัดไป')!.click()
    await flushPromises()
    expect(bubble()?.textContent).toContain('สุดท้ายยื่นที่ e-Filing')
    button('ย้อนกลับ')!.click()
    await flushPromises()
    expect(bubble()?.textContent).toContain('เตรียมแบบภาษี 4 ขั้นตอน')
  })

  it('กดข้ามแล้วนับว่าดูแล้ว · ไม่ต้องแนะนำอีกปิดทุกหน้า', async () => {
    await setup('/quiz')
    button('ข้าม')!.click()
    await flushPromises()
    expect(useIntroStore().shouldShow('quiz')).toBe(false)

    const { router } = await setup('/filing')
    ;[...document.querySelectorAll<HTMLButtonElement>('.intro-link')][0]!.click()
    await flushPromises()
    expect(useIntroStore().progress.off).toBe(true)
    await router.push('/quiz')
    await new Promise((r) => setTimeout(r, 5))
    expect(bubble()).toBeNull()
  })

  it('หน้าที่ไม่มีคำแนะนำไม่แสดงอะไร และขอดูซ้ำได้แม้เคยดูแล้ว', async () => {
    await setup('/login')
    expect(bubble()).toBeNull()

    store.set('taxflow_intro_guest', JSON.stringify({ seen: ['quiz'], off: false }))
    await setup('/quiz')
    expect(bubble()).toBeNull()
    useIntroStore().replay()
    await new Promise((r) => setTimeout(r, 5))
    await flushPromises()
    expect(bubble()?.textContent).toContain('ควิซภาษี')
  })

  it('รอให้หน้าต่างอื่นปิดก่อนค่อยโผล่', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUiStore().quickAddOpen = true
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/quiz', name: 'quiz', component: { template: '<div />' } }] })
    router.push('/quiz')
    await router.isReady()
    mount(FeatureIntro, { props: { startDelay: 0 }, global: { plugins: [pinia, router] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 5))
    expect(bubble()).toBeNull()
    useUiStore().quickAddOpen = false
    await new Promise((r) => setTimeout(r, 900))
    await flushPromises()
    expect(bubble()?.textContent).toContain('ควิซภาษี')
  })
})
