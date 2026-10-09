import { describe, expect, it } from 'vitest'
import { comparePlans, minimumTotal, monthAfter, simulate, type Debt } from '../debtPlan'
import { changeSincePrevious, withSnapshot, worthTotals, type WorthBook } from '../netWorth'
import { detectSubscriptions, summarize, upcomingCharges, type SubEntry } from '../subscriptions'

describe('แผนปลดหนี้', () => {
  const debts: Debt[] = [
    { id: 'card', name: 'บัตรเครดิต', balance: 30_000, rate: 16, minPayment: 1_500 },
    { id: 'friend', name: 'ยืมเพื่อน', balance: 5_000, rate: 0, minPayment: 500 },
    { id: 'loan', name: 'สินเชื่อ', balance: 60_000, rate: 25, minPayment: 2_500 },
  ]

  it('ขั้นต่ำรวม และจ่ายขั้นต่ำอย่างเดียวช้ากว่าโปะ', () => {
    expect(minimumTotal(debts)).toBe(4_500)
    const plan = comparePlans(debts, 8_000)
    expect(plan.shortfall).toBe(0)
    expect(plan.avalanche.months).not.toBeNull()
    expect(plan.minimumOnly.months ?? Infinity).toBeGreaterThan(plan.avalanche.months!)
    expect(plan.minimumOnly.totalInterest).toBeGreaterThan(plan.avalanche.totalInterest)
  })

  it('Snowball ปิดก้อนเล็กก่อน · Avalanche ปิดก้อนดอกสูงก่อนและเสียดอกเบี้ยน้อยกว่า', () => {
    const plan = comparePlans(debts, 8_000)
    expect(plan.snowball.order[0]).toBe('friend')
    expect(plan.avalanche.debts.find((d) => d.id === 'loan')!.payoffMonth!).toBeLessThan(
      plan.snowball.debts.find((d) => d.id === 'loan')!.payoffMonth!,
    )
    expect(plan.avalancheSaves).toBeGreaterThan(0)
  })

  it('ยอดที่จ่ายทั้งหมด = เงินต้น + ดอกเบี้ย', () => {
    const r = simulate(debts, 8_000, 'avalanche')
    expect(r.totalPaid).toBeCloseTo(95_000 + r.totalInterest, 0)
    expect(r.remaining[r.remaining.length - 1]).toBe(0)
  })

  it('งบไม่พอจ่ายดอกเบี้ย = ไม่มีวันหมด', () => {
    const r = simulate([{ id: 'x', name: 'x', balance: 100_000, rate: 30, minPayment: 1_000 }], 1_000, 'avalanche')
    expect(r.months).toBeNull()
    expect(comparePlans(debts, 3_000).shortfall).toBe(1_500)
  })

  it('เดือนที่หนี้หมด', () => {
    expect(monthAfter('2026-10-10', 3)).toBe('2027-01')
  })
})

describe('มูลค่าสุทธิ', () => {
  const book: WorthBook = {
    assets: [{ id: 'a', name: 'ออมทรัพย์', kind: 'bank', amount: 50_000 }],
    liabilities: [{ id: 'l', name: 'บัตร', kind: 'credit', amount: 8_000 }],
    snapshots: [{ month: '2026-09', assets: 40_000, liabilities: 10_000 }],
  }
  it('รวมรายการที่กรอกและรายการอัตโนมัติ', () => {
    const t = worthTotals(book, [{ name: 'กองทุน', amount: 20_000, to: '/funds' }], [{ name: 'ยืมพี่', amount: 2_000, to: '/x' }])
    expect(t).toEqual({ assets: 70_000, liabilities: 10_000, net: 60_000 })
    expect(changeSincePrevious(book, '2026-10', t.net)).toBe(30_000)
  })
  it('จดเดือนละจุด เดือนเดิมเขียนทับ', () => {
    let b = withSnapshot(book, '2026-10', { assets: 1, liabilities: 0, net: 1 })
    b = withSnapshot(b, '2026-10', { assets: 2, liabilities: 0, net: 2 })
    expect(b.snapshots.map((s) => [s.month, s.assets])).toEqual([
      ['2026-09', 40_000],
      ['2026-10', 2],
    ])
  })
})

describe('ค่าบริการรายเดือน', () => {
  const e = (date: string, amount: number, note: string, recipient?: string): SubEntry => ({
    date,
    type: 'expense',
    amount,
    note,
    slip: recipient ? { recipient } : null,
  })
  const entries: SubEntry[] = [
    e('2026-07-05', 419, 'Netflix'),
    e('2026-08-05', 419, 'Netflix'),
    e('2026-09-05', 419, 'Netflix'),
    e('2026-10-05', 499, 'Netflix'),
    e('2026-09-20', 129, 'Spotify'),
    e('2025-11-01', 1_200, 'โดเมนเว็บ'),
    e('2026-10-30', 1_200, 'โดเมนเว็บ'),
    e('2026-10-01', 65, 'กาแฟ'),
    e('2026-10-02', 65, 'กาแฟ'),
    e('2026-10-03', 65, 'กาแฟ'),
    // จ่ายล่าสุด ส.ค. ไม่พบรอบ ก.ย. — อาจเลิกไปแล้ว
    e('2026-07-12', 990, 'ค่าโอน', 'บริษัท ฟิตเนส จำกัด'),
    e('2026-08-12', 990, 'ค่าโอน', 'บริษัท ฟิตเนส จำกัด'),
  ]
  const subs = detectSubscriptions(entries, '2026-10-10')
  const byName = (name: string) => subs.find((s) => s.name.includes(name))

  it('รายเดือนจากรอบจ่าย และบริการที่รู้จักแม้จ่ายครั้งเดียว', () => {
    expect(byName('Netflix')).toMatchObject({ cycle: 'monthly', amount: 499, nextDate: '2026-11-05', priceChange: { from: 419, to: 499 } })
    expect(byName('Spotify')).toMatchObject({ cycle: 'monthly', known: true, nextDate: '2026-10-20' })
    expect(byName('ฟิตเนส')).toMatchObject({ cycle: 'monthly', stale: true })
  })
  it('รายปี และไม่นับของที่ซื้อบ่อย', () => {
    expect(byName('โดเมน')).toMatchObject({ cycle: 'yearly', yearlyCost: 1_200 })
    expect(byName('กาแฟ')).toBeUndefined()
  })
  it('สรุปค่าใช้จ่าย ยกเลิกแล้วไม่นับ และเตือนรอบตัดเงิน', () => {
    const statuses = { [byName('Spotify')!.key]: 'unused' as const, [byName('โดเมน')!.key]: 'cancelled' as const }
    const sum = summarize(subs, statuses)
    expect(sum.yearly).toBe(499 * 12 + 129 * 12)
    expect(sum.unusedYearly).toBe(129 * 12)
    expect(sum.cancelledYearly).toBe(1_200)
    expect(upcomingCharges(subs, statuses, 10).map((s) => s.name)).toEqual(['Spotify'])
  })
})
