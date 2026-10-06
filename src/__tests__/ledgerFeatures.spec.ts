import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../services/api'
import { useLedgerStore } from '../stores/ledger'

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

async function freshBook() {
  await api.login({ username: 'nattaya', password: 'nattaya123' })
  return api.createWorkspace({ name: `ทดสอบ ${Math.random()}`, mode: 'personal', capital: 0 })
}

describe('แก้ไขรายการ', () => {
  it('แก้ยอดและหมวดได้ โดยรายการยังเป็นตัวเดิม', async () => {
    const ws = await freshBook()
    const created = await api.addEntry(ws.id, { date: '2026-09-01', type: 'expense', categoryKey: 'food', amount: 120, note: 'ข้าว' })
    const updated = await api.updateEntry(created.id, {
      date: '2026-09-02',
      type: 'expense',
      categoryKey: 'transport',
      amount: 45,
      note: '  BTS ',
    })
    expect(updated).toMatchObject({ id: created.id, date: '2026-09-02', categoryKey: 'transport', amount: 45, note: 'BTS' })
    expect((await api.entries(ws.id)).filter((e) => e.id === created.id)).toHaveLength(1)
    await expect(api.updateEntry(created.id, { ...updated, amount: 0 })).rejects.toThrow(/มากกว่า 0/)
  })

  it('เปลี่ยนรายรับเป็นรายจ่ายแล้วภาษีหัก ณ ที่จ่ายเดิมต้องหายไป', async () => {
    const ws = await freshBook()
    const created = await api.addEntry(ws.id, {
      date: '2026-09-01',
      type: 'income',
      categoryKey: 'sideIncome',
      amount: 1_000,
      note: '',
      withholdingTax: 30,
    })
    const updated = await api.updateEntry(created.id, { date: '2026-09-01', type: 'expense', categoryKey: 'food', amount: 1_000, note: '' })
    expect(updated.withholdingTax).toBeUndefined()
  })
})

describe('รายการประจำ', () => {
  it('เปิดสมุดแล้วสร้างรายการที่ถึงกำหนด และเปิดซ้ำไม่สร้างซ้ำ', async () => {
    const ws = await freshBook()
    await api.addRecurring(ws.id, {
      type: 'expense',
      categoryKey: 'housing',
      amount: 5_500,
      note: 'ค่าเช่า',
      dayOfMonth: 5,
      startMonth: '2026-07',
      lastMonth: '',
    })
    expect(await api.syncRecurring(ws.id, '2026-09-10')).toBe(3)
    expect(await api.syncRecurring(ws.id, '2026-09-10')).toBe(0)
    const entries = await api.entries(ws.id)
    expect(entries.map((e) => e.date).sort()).toEqual(['2026-07-05', '2026-08-05', '2026-09-05'])
    expect(entries.every((e) => e.recurringId)).toBe(true)
  })

  it('หยุดรายการประจำแล้ว รายการที่สร้างไปแล้วยังอยู่', async () => {
    const ws = await freshBook()
    const r = await api.addRecurring(ws.id, {
      type: 'income',
      categoryKey: 'salary',
      amount: 30_000,
      note: '',
      dayOfMonth: 25,
      startMonth: '2026-08',
      lastMonth: '',
    })
    await api.syncRecurring(ws.id, '2026-08-31')
    await api.deleteRecurring(r.id)
    expect(await api.syncRecurring(ws.id, '2026-12-31')).toBe(0)
    expect(await api.entries(ws.id)).toHaveLength(1)
  })
})

describe('บันทึกรายการคืนรายการที่สร้างจริง', () => {
  it('บันทึกย้อนวันที่แล้ว ได้รายการที่เพิ่งสร้าง ไม่ใช่รายการล่าสุดตามวันที่', async () => {
    setActivePinia(createPinia())
    const ws = await freshBook()
    await api.addEntry(ws.id, { date: '2026-09-30', type: 'expense', categoryKey: 'food', amount: 1, note: 'ใหม่กว่า' })
    const ledger = useLedgerStore()
    await ledger.open(ws.id)
    const created = await ledger.addEntry({ date: '2026-09-01', type: 'expense', categoryKey: 'food', amount: 99, note: 'ย้อนหลัง' })
    expect(created?.note).toBe('ย้อนหลัง')
    // รายการแรกของสมุดยังเป็นรายการวันที่ใหม่กว่า — เดิมโค้ดแนบหลักฐานไปที่ตัวนี้ผิด
    expect(ledger.entries[0]?.note).toBe('ใหม่กว่า')
  })
})

describe('ภารกิจออมเงิน', () => {
  it('เริ่มภารกิจ กดออมแล้ว กดซ้ำคือยกเลิก', async () => {
    const ws = await freshBook()
    const c = await api.addChallenge(ws.id, {
      kind: 'daily',
      title: 'ออมวันละ 20',
      startDate: '2026-10-01',
      amount: 20,
      days: 30,
      categoryKey: '',
    })
    expect((await api.toggleCheckin(c.id, '2026-10-01')).checkins).toEqual(['2026-10-01'])
    expect((await api.toggleCheckin(c.id, '2026-10-01')).checkins).toEqual([])
    await expect(
      api.addChallenge(ws.id, { kind: 'nospend', title: '', startDate: '2026-10-01', amount: 0, days: 30, categoryKey: 'salary' }),
    ).rejects.toThrow(/หมวดรายจ่าย/)
  })
})

describe('เหรียญรางวัลและการฉลอง', () => {
  it('เปิดครั้งแรกปลดล็อกของเดิมเงียบ ๆ แล้วฉลองเฉพาะเหรียญที่ได้ใหม่', async () => {
    setActivePinia(createPinia())
    const { useAuthStore } = await import('../stores/auth')
    const { useGameStore } = await import('../stores/game')
    const { useCelebrateStore } = await import('../stores/celebrate')

    const auth = useAuthStore()
    await auth.login({ username: 'somchai', password: 'somchai123' })
    localStorage.removeItem(`taxflow_game_${auth.user!.id}`)
    const game = useGameStore()
    const celebrate = useCelebrateStore()

    await game.refresh()
    expect(game.achievements.find((a) => a.id === 'first-entry')?.unlockedAt).toBeTruthy()
    expect(celebrate.queue).toHaveLength(0)

    // ตอบควิซถูกหมด → ได้เหรียญใหม่และต้องมีการฉลอง
    game.recordQuiz(5)
    await game.refresh()
    expect(game.achievements.find((a) => a.id === 'quiz-perfect')?.unlockedAt).toBeTruthy()
    expect(celebrate.queue.some((c) => c.title.includes('เซียนภาษี'))).toBe(true)
    expect(game.notifications.some((n) => n.id === 'badge:quiz-perfect')).toBe(true)
  })
})
