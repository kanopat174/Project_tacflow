import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import MascotGuide from '../components/MascotGuide.vue'
import { HOVER_LINES, MASCOT_SOUND, REACTIONS } from '../data/mascotLines'
import { MASCOTS } from '../data/mascot'
import { burst, floatText } from '../services/fx'
import { useMascotFxStore } from '../stores/mascotFx'

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
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] })
  const wrapper = mount(MascotGuide, { props: { typingDelay: 0 }, global: { plugins: [pinia, router] } })
  return { wrapper }
}

describe('คำพูดของตัวการ์ตูน', () => {
  it('ทุกตัวมีเสียงประจำตัว และทุกท่าตอบสนองมีคำพูด', () => {
    for (const m of MASCOTS) expect(MASCOT_SOUND[m.key], m.key).toBeTruthy()
    for (const [kind, r] of Object.entries(REACTIONS)) expect(r.lines.length, kind).toBeGreaterThan(0)
  })

  it('สั่งให้ตัวการ์ตูนตอบสนองแล้วได้คำพูดจากรายการของท่านั้น', () => {
    setActivePinia(createPinia())
    const fx = useMascotFxStore()
    fx.react('save-income')
    expect(REACTIONS['save-income'].lines).toContain(fx.last!.line)
    expect(fx.last!.move).toBe('jump')
    const first = fx.last!.id
    fx.react('delete', 'ข้อความเฉพาะ')
    expect(fx.last!.line).toBe('ข้อความเฉพาะ')
    expect(fx.last!.id).toBeGreaterThan(first)
  })
})

describe('ลูกเล่นของตัวการ์ตูนมุมขวาล่าง', () => {
  it('เอาเมาส์ไปชี้แล้วพูด พร้อมเสียงประจำตัว', async () => {
    const { wrapper } = setup()
    await wrapper.find('.guide-fab').trigger('pointerenter')
    const say = wrapper.find('.guide-say')
    expect(say.exists()).toBe(true)
    expect(say.text().startsWith(MASCOT_SOUND.piggy)).toBe(true)
    expect(HOVER_LINES.some((l) => say.text().endsWith(l))).toBe(true)
    wrapper.unmount()
  })

  it('ตอบสนองเมื่อผู้ใช้บันทึกรายการ', async () => {
    const { wrapper } = setup()
    useMascotFxStore().react('save-expense', 'จดแล้ว เก่งมาก!')
    await flushPromises()
    expect(wrapper.find('.guide-say').text()).toContain('จดแล้ว เก่งมาก!')
    wrapper.unmount()
  })

  it('เปิดแชทแล้วกล่องคำพูดหายไป ไม่ซ้อนกับหน้าต่างแชท', async () => {
    const { wrapper } = setup()
    await wrapper.find('.guide-fab').trigger('pointerenter')
    await wrapper.find('.guide-fab').trigger('click')
    await flushPromises()
    expect(wrapper.find('.guide-panel').exists()).toBe(true)
    expect(wrapper.find('.guide-say').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('เอฟเฟกต์บนจอ', () => {
  it('เหรียญและตัวเลขลอยถูกลบทิ้งเองเมื่อแอนิเมชันจบ ไม่ค้างในหน้า', () => {
    burst({ x: 100, y: 100 }, { count: 4 })
    floatText({ x: 100, y: 100 }, '+฿65', 'ok')
    const layer = document.getElementById('fx-layer')!
    expect(layer.children.length).toBe(5)
    for (const el of [...layer.children]) el.dispatchEvent(new Event('animationend'))
    expect(layer.children.length).toBe(0)
  })

  it('ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวไม่เห็นเอฟเฟกต์', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    burst({ x: 0, y: 0 }, { count: 6 })
    expect(document.getElementById('fx-layer')?.children.length ?? 0).toBe(0)
    window.matchMedia = original
  })
})
