/**
 * แผนปลดหนี้ — เทียบสองวิธีโปะหนี้ด้วยงบต่อเดือนเท่ากัน — ฟังก์ชันบริสุทธิ์
 *
 *  - Snowball: โปะก้อนที่ยอดเหลือน้อยสุดก่อน ปิดได้เร็ว เห็นผลไว มีกำลังใจ
 *  - Avalanche: โปะก้อนที่ดอกเบี้ยสูงสุดก่อน เสียดอกเบี้ยรวมน้อยที่สุด
 *
 * ทุกเดือน: คิดดอกเบี้ยรายเดือน (อัตราต่อปี ÷ 12) → จ่ายขั้นต่ำทุกก้อน → เงินที่เหลือจากงบโปะก้อนเป้าหมาย
 * ก้อนที่ปิดแล้ว ขั้นต่ำของก้อนนั้นกลายเป็นเงินโปะก้อนถัดไป (งบต่อเดือนคงที่)
 */

import { roundMoney } from './taxEngine'

export interface Debt {
  id: string
  name: string
  /** ยอดหนี้คงเหลือ */
  balance: number
  /** ดอกเบี้ยต่อปี (%) */
  rate: number
  /** ค่างวดขั้นต่ำต่อเดือน */
  minPayment: number
}

export type Strategy = 'snowball' | 'avalanche'

export interface DebtOutcome {
  id: string
  name: string
  /** เดือนที่ปิดหนี้ก้อนนี้ได้ (นับจาก 1) — null คือไม่หมดภายในเพดาน */
  payoffMonth: number | null
  interest: number
}

export interface PlanResult {
  strategy: Strategy
  /** จำนวนเดือนจนหนี้หมด — null คือไม่หมดภายใน MAX_MONTHS (งบไม่พอจ่ายดอกเบี้ย) */
  months: number | null
  totalInterest: number
  totalPaid: number
  /** ลำดับที่ปิดหนี้ */
  order: string[]
  debts: DebtOutcome[]
  /** ยอดหนี้รวมคงเหลือปลายแต่ละเดือน ใช้วาดกราฟ */
  remaining: number[]
}

export const MAX_MONTHS = 600

export function minimumTotal(debts: Debt[]): number {
  return roundMoney(debts.filter((d) => d.balance > 0).reduce((s, d) => s + d.minPayment, 0))
}

function target(open: { debt: Debt; balance: number }[], strategy: Strategy) {
  return [...open].sort((a, b) =>
    strategy === 'snowball'
      ? a.balance - b.balance || b.debt.rate - a.debt.rate
      : b.debt.rate - a.debt.rate || a.balance - b.balance,
  )[0]
}

export function simulate(debts: Debt[], monthlyBudget: number, strategy: Strategy): PlanResult {
  const state = debts
    .filter((d) => d.balance > 0)
    .map((debt) => ({ debt, balance: debt.balance, interest: 0, payoffMonth: null as number | null }))
  const order: string[] = []
  const remaining: number[] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  while (state.some((s) => s.balance > 0.005) && month < MAX_MONTHS) {
    month++
    const open = state.filter((s) => s.balance > 0.005)
    for (const s of open) {
      const interest = (s.balance * s.debt.rate) / 1200
      s.balance += interest
      s.interest += interest
      totalInterest += interest
    }
    let budget = monthlyBudget
    for (const s of open) {
      const pay = Math.min(s.debt.minPayment, s.balance, Math.max(0, budget))
      s.balance -= pay
      budget -= pay
      totalPaid += pay
    }
    // เงินที่เหลือจากงบโปะก้อนเป้าหมาย ปิดได้แล้วไหลไปก้อนถัดไปในเดือนเดียวกัน
    let next = target(open.filter((s) => s.balance > 0.005), strategy)
    while (budget > 0.005 && next) {
      const pay = Math.min(budget, next.balance)
      next.balance -= pay
      budget -= pay
      totalPaid += pay
      next = target(open.filter((s) => s.balance > 0.005), strategy)
    }
    for (const s of open) {
      if (s.balance <= 0.005 && s.payoffMonth === null) {
        s.balance = 0
        s.payoffMonth = month
        order.push(s.debt.id)
      }
    }
    remaining.push(roundMoney(state.reduce((sum, s) => sum + s.balance, 0)))
    // ยอดรวมไม่ลดลงเลยในปีแรก = งบไม่พอจ่ายดอกเบี้ย ไม่มีวันหมด
    if (month === 12 && remaining[11]! >= remaining[0]! && remaining[0]! > 0) break
  }

  const done = state.every((s) => s.balance <= 0.005)
  return {
    strategy,
    months: done ? month : null,
    totalInterest: roundMoney(totalInterest),
    totalPaid: roundMoney(totalPaid),
    order,
    debts: state.map((s) => ({ id: s.debt.id, name: s.debt.name, payoffMonth: s.payoffMonth, interest: roundMoney(s.interest) })),
    remaining,
  }
}

export interface PlanComparison {
  snowball: PlanResult
  avalanche: PlanResult
  /** จ่ายขั้นต่ำอย่างเดียว */
  minimumOnly: PlanResult
  /** Avalanche ประหยัดดอกเบี้ยกว่า Snowball เท่าไร */
  avalancheSaves: number
  /** ไม่พอจ่ายขั้นต่ำ */
  shortfall: number
}

export function comparePlans(debts: Debt[], monthlyBudget: number): PlanComparison {
  const minimum = minimumTotal(debts)
  const budget = Math.max(monthlyBudget, 0)
  const snowball = simulate(debts, budget, 'snowball')
  const avalanche = simulate(debts, budget, 'avalanche')
  return {
    snowball,
    avalanche,
    minimumOnly: simulate(debts, minimum, 'avalanche'),
    avalancheSaves: roundMoney(snowball.totalInterest - avalanche.totalInterest),
    shortfall: roundMoney(Math.max(0, minimum - budget)),
  }
}

/** เดือนที่ n นับจากเดือนนี้ เป็น YYYY-MM */
export function monthAfter(today: string, months: number): string {
  const [y, m] = today.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7)
}

/* ---------- เก็บในเครื่อง แยกต่อผู้ใช้ ---------- */

export interface DebtBook {
  debts: Debt[]
  budget: number
}

const key = (userId: string) => `taxflow_debts_${userId}`

export function loadDebts(userId: string): DebtBook {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<DebtBook> | null
    const debts = Array.isArray(raw?.debts)
      ? raw.debts.filter(
          (d): d is Debt =>
            !!d && typeof d.id === 'string' && typeof d.name === 'string' && [d.balance, d.rate, d.minPayment].every(Number.isFinite),
        )
      : []
    return { debts, budget: Number.isFinite(raw?.budget) ? Number(raw!.budget) : 0 }
  } catch {
    return { debts: [], budget: 0 }
  }
}

export function saveDebts(userId: string, book: DebtBook): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify(book))
    return true
  } catch {
    return false
  }
}
