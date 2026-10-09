/**
 * บันทึกด่วน: ประโยคเดียวหลายรายการ วางแจ้งเตือนธนาคาร และหารบิล — ตั้งแต่พิมพ์จนลงฐานข้อมูล
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QuickAdd from '../components/QuickAdd.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useUiStore } from '../stores/ui'

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

let wrapper: VueWrapper
let workspaceId = ''

async function settle() {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 400)) // api จำลองหน่วงเวลาเหมือนเรียกเครือข่าย
  await flushPromises()
}

async function open() {
  useUiStore().openQuickAdd()
  await settle()
  await wrapper.find('#q-ws').setValue(workspaceId)
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T05:00:00Z'))
  setActivePinia(createPinia())
  await useAuthStore().login({ username: 'somchai', password: 'somchai123' })
  await api.createWorkspace({ name: 'สมุดอื่น', mode: 'personal', capital: 0 })
  workspaceId = (await api.createWorkspace({ name: 'สมุดทดสอบจดด่วน', mode: 'personal', capital: 0 })).id
  await useGameStore().refresh()
  wrapper = mount(QuickAdd, { global: { stubs: { RouterLink: true } }, attachTo: document.body })
})

afterAll(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

describe('บันทึกด่วนหลายรายการ', () => {
  it('ประโยคเดียวหลายรายการ แสดงรายการให้ตรวจแล้วบันทึกทีเดียว', async () => {
    await open()
    await wrapper.find('#q-sentence').setValue('ข้าว 60 กาแฟ 45 แม่ให้ 500')
    const list = wrapper.find('[data-test="multi-list"]')
    expect(list.findAll('li')).toHaveLength(3)
    expect(wrapper.find('button[type="submit"]').text()).toBe('บันทึก 3 รายการ')

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(async () => expect(await api.entries(workspaceId)).toHaveLength(3), { timeout: 5_000 })
    await vi.waitFor(() => expect(useUiStore().quickAddOpen).toBe(false))
    const saved = await api.entries(workspaceId)
    expect(saved.map((e) => [e.note, e.amount, e.type]).sort()).toEqual(
      [
        ['ข้าว', 60, 'expense'],
        ['กาแฟ', 45, 'expense'],
        ['แม่ให้', 500, 'income'],
      ].sort(),
    )
  })

  it('วางข้อความแจ้งเตือนธนาคารหลายบรรทัด', async () => {
    await open()
    const input = wrapper.find('#q-sentence')
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
    event.clipboardData = { getData: () => 'เงินออก 120.00 บ. บช x1234 09/10\nเงินเข้า 3,000.00 บ. บช x1234 09/10' }
    input.element.dispatchEvent(event)
    await flushPromises()
    expect(wrapper.findAll('[data-test="multi-list"] li')).toHaveLength(2)
    useUiStore().quickAddOpen = false
    await flushPromises()
  })
})

describe('หารบิล', () => {
  it('ส่วนของเราเป็นรายจ่าย ส่วนของเพื่อนเป็นให้ยืม รวมกันเท่ายอดที่จ่าย', async () => {
    await open()
    await wrapper.find('#q-sentence').setValue('หมูกระทะ 1000')
    await flushPromises()
    await wrapper.find('[data-test="split-with"]').setValue('เอ, บี')
    expect(wrapper.find('[data-test="split-hint"]').text()).toContain('333.33')

    const before = (await api.entries(workspaceId)).length
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(async () => expect(await api.entries(workspaceId)).toHaveLength(before + 3), { timeout: 5_000 })
    const added = (await api.entries(workspaceId)).filter((e) => /หมูกระทะ/.test(e.note))
    const mine = added.find((e) => !e.loan)!
    const friends = added.filter((e) => e.loan)
    expect(mine.amount).toBe(333.34)
    expect(friends.map((e) => [e.loan!.party, e.loan!.role, e.amount]).sort()).toEqual([
      ['บี', 'lend', 333.33],
      ['เอ', 'lend', 333.33],
    ])
    expect(added.reduce((s, e) => s + e.amount, 0)).toBeCloseTo(1000, 2)
  })
})
