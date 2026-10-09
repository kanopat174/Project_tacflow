/**
 * ทดสอบทั้งเส้นทางของสลิปในหน้าจอบันทึกด่วน: เลือกรูป → (OCR จำลอง) → แยกข้อมูล → แสดงให้ตรวจ
 * → ตรวจก่อนบันทึก → บันทึกผ่าน api → ข้อมูลในฐานข้อมูล
 * จำลองเฉพาะขั้น OCR เพราะต้องโหลดข้อมูลภาษาจากอินเทอร์เน็ตและใช้ canvas ซึ่ง jsdom ไม่มี
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QuickAdd from '../components/QuickAdd.vue'
import { api } from '../services/api'
import type { SlipOcrResult } from '../services/slipReader'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useToastStore } from '../stores/toast'
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

const ocrResult = vi.hoisted(() => ({ current: null as SlipOcrResult | null }))
vi.mock('../services/slipReader', () => ({
  readSlipImage: vi.fn(async () => ocrResult.current),
}))

function ocr(text: string, hash: string): SlipOcrResult {
  return {
    text,
    lines: text.split('\n').map((line) => ({ text: line, confidence: 90 })),
    confidence: 90,
    rotation: 0,
    imageHash: hash.repeat(64),
    enhanced: true,
  }
}

// สลิปสมมุติ: หลายวันที่ (วันพิมพ์ / ครบกำหนด / วันทำรายการ) ผู้รับเป็นบริษัท
const SLIP = `พิมพ์เมื่อ 09/10/2569 10:00
ครบกำหนดชำระ 31/10/2569
วันที่ทำรายการ
06/10/2569 16:45
จาก นาย สมชาย ใจดี
ไปยัง บริษัท ตัวอย่างการค้า จำกัด
ธนาคารกรุงเทพ
จำนวนเงิน 2,400.00 บาท
เลขที่อ้างอิง: 0098 7654 3210`

// สลิปที่ไม่มีวันที่และเลขอ้างอิง
const PARTIAL = `โอนเงินสำเร็จ
จาก นาย สมชาย ใจดี
ไปยัง นาง สมศรี มีสุข
จำนวนเงิน 75.00 บาท`

let wrapper: VueWrapper
let workspaceId = ''

async function scan(text: string, hash: string, lastModified = Date.now()) {
  ocrResult.current = ocr(text, hash)
  const inputs = wrapper.findAll('input[type="file"]')
  const slipInput = inputs.find((i) => i.attributes('capture') === undefined)!
  const file = new File(['fake-image'], 'slip.png', { type: 'image/png', lastModified })
  Object.defineProperty(slipInput.element, 'files', { value: [file], configurable: true })
  await slipInput.trigger('change')
  await flushPromises()
}

async function submit() {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await new Promise((r) => setTimeout(r, 400)) // api จำลองหน่วงเวลาเหมือนเรียกเครือข่าย
  await flushPromises()
}

const value = (selector: string) => (wrapper.find(selector).element as HTMLInputElement).value

beforeAll(async () => {
  // วันที่ 9 ต.ค. 2569 เวลาไทย — ปลอมเฉพาะ Date ตัวจับเวลายังทำงานจริง
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T05:00:00Z'))
  setActivePinia(createPinia())
  await useAuthStore().login({ username: 'somchai', password: 'somchai123' })
  const ws = await api.createWorkspace({ name: 'สมุดทดสอบสลิป', mode: 'personal', capital: 0 })
  workspaceId = ws.id
  await useGameStore().refresh()
  wrapper = mount(QuickAdd, { global: { stubs: { RouterLink: true } }, attachTo: document.body })
  useUiStore().openQuickAdd()
  await flushPromises()
  await new Promise((r) => setTimeout(r, 400)) // รอโหลดรายชื่อสมุด
  await flushPromises()
  await wrapper.find('#q-ws').setValue(workspaceId)
})

afterAll(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

describe('สแกนสลิปจนบันทึกลงฐานข้อมูล', () => {
  it('ไม่มีวันที่บนสลิป: ใช้วันที่ของไฟล์รูปแทน (ไม่ใช่วันนี้) และต้องยืนยันก่อนบันทึก', async () => {
    await scan(PARTIAL, 'c', Date.parse('2026-10-01T03:00:00Z'))
    expect(value('#q-date')).toBe('2026-10-01')
    expect(value('#s-ref')).toBe('')
    const review = wrapper.find('[data-test="slip-review"]').text()
    expect(review).toContain('ใช้วันที่ของไฟล์รูป')

    const before = (await api.entries(workspaceId)).length
    await submit()
    expect((await api.entries(workspaceId)).length).toBe(before)
    const toasts = useToastStore().items
    expect(toasts[toasts.length - 1]?.message).toMatch(/ติ๊กยืนยัน/)

    await wrapper.find('[data-test="review-confirm"]').setValue(true)
    await submit()
    const saved = (await api.entries(workspaceId)).find((e) => e.amount === 75)
    expect(saved).toMatchObject({ date: '2026-10-01', type: 'expense' })
    expect(saved?.slip).toMatchObject({ reference: null, recipient: 'นาง สมศรี มีสุข', recipientType: 'person' })
  })

  it('สลิปหลายวันที่ + ผู้รับเป็นบริษัท: แสดงและบันทึกวันที่ตามสลิปตรงกัน', async () => {
    await scan(SLIP, 'd')
    expect(value('#q-date')).toBe('2026-10-06')
    expect(value('#s-time')).toBe('16:45')
    expect(value('#s-recipient')).toBe('บริษัท ตัวอย่างการค้า จำกัด')
    expect(value('#s-rtype')).toBe('company')
    expect(value('#s-ref')).toBe('009876543210')
    expect(wrapper.find('[data-test="slip-review"]').text()).toContain('6 ต.ค. 2569')

    await submit()
    const saved = (await api.entries(workspaceId)).find((e) => e.amount === 2400)!
    expect(saved.date).toBe('2026-10-06')
    expect(saved.type).toBe('expense')
    expect(saved.note).toBe('โอนให้ บริษัท ตัวอย่างการค้า จำกัด · 16:45 น. · อ้างอิง 009876543210')
    expect(saved.slip).toEqual({
      time: '16:45',
      sender: 'นาย สมชาย ใจดี',
      recipient: 'บริษัท ตัวอย่างการค้า จำกัด',
      recipientType: 'company',
      recipientBank: 'กรุงเทพ',
      banks: ['กรุงเทพ'],
      reference: '009876543210',
      imageHash: 'd'.repeat(64),
    })
    // ในฐานข้อมูลเก็บวันที่เป็นข้อความตามปฏิทิน ไม่มีเวลาหรือโซนเวลาที่จะทำให้วันเลื่อน
    const db = JSON.parse(store.get('taxflow_db_v1')!) as { entries: { id: string; date: string }[] }
    expect(db.entries.find((e) => e.id === saved.id)?.date).toBe('2026-10-06')
  })

  it('สแกนสลิปเดิมซ้ำ: เตือนและไม่บันทึกจนกว่าจะยืนยัน', async () => {
    await useGameStore().refresh()
    await scan(SLIP, 'e') // คนละไฟล์ แต่เลขอ้างอิงเดียวกัน
    expect(wrapper.find('[data-test="slip-review"]').text()).toContain('เลขอ้างอิงเดียวกัน')
    const count = (await api.entries(workspaceId)).filter((e) => e.amount === 2400).length
    await submit()
    expect((await api.entries(workspaceId)).filter((e) => e.amount === 2400).length).toBe(count)
    await wrapper.find('[data-test="duplicate-confirm"]').setValue(true)
    await submit()
    expect((await api.entries(workspaceId)).filter((e) => e.amount === 2400).length).toBe(count + 1)
  })
})

describe('api ตรวจข้อมูลก่อนบันทึก', () => {
  it('ไม่รับวันที่ที่ไม่มีจริง และกรองข้อมูลสลิปที่รูปแบบผิด', async () => {
    const base = { type: 'expense' as const, categoryKey: 'food', amount: 10, note: '' }
    await expect(api.addEntry(workspaceId, { ...base, date: '2026-02-31' })).rejects.toThrow(/วันที่/)
    await expect(api.addEntry(workspaceId, { ...base, date: '9/10/2569' })).rejects.toThrow(/วันที่/)
    const saved = await api.addEntry(workspaceId, {
      ...base,
      date: '2026-10-01',
      slip: { time: 'xx', sender: null, recipient: null, recipientType: null, recipientBank: null, banks: [], reference: '1,000.00', imageHash: null },
    })
    expect(saved.slip).toMatchObject({ time: null, reference: null })
  })

  it('แก้รายการภายหลังแล้วข้อมูลสลิปยังอยู่ (รายการเก่าที่ไม่มีสลิปก็แก้ได้ตามเดิม)', async () => {
    const saved = (await api.entries(workspaceId)).find((e) => e.slip?.reference === '009876543210')!
    const updated = await api.updateEntry(saved.id, { date: '2026-10-06', type: 'expense', categoryKey: 'food', amount: 2400, note: 'แก้แล้ว' })
    expect(updated.slip?.reference).toBe('009876543210')
  })
})
