/**
 * สรุปทั้งปีแบบเล่าเรื่อง (Wrapped) — ฟังก์ชันบริสุทธิ์
 * ใช้รายการจากทุกสมุด และแบบภาษีของปีภาษีเดียวกัน (ปี ค.ศ. + 543)
 */

import { categoryLabel, type WorkspaceMode } from '@/data/workspaceModes'
import { computeStreak } from './gamification'
import { roundMoney } from './taxEngine'

interface WrapEntry {
  workspaceId: string
  date: string
  type: 'income' | 'expense'
  categoryKey: string
  amount: number
  note: string
}

interface WrapWorkspace {
  id: string
  mode: WorkspaceMode
}

interface WrapFiling {
  taxYear: string
  tax: number
  balance: number
}

export interface WrappedSummary {
  year: number
  income: number
  expense: number
  net: number
  savingsRate: number
  entryCount: number
  activeDays: number
  bestStreak: number
  topCategory: { label: string; amount: number; share: number } | null
  biggestExpense: { label: string; note: string; amount: number; date: string } | null
  /** เดือนที่ใช้จ่ายน้อยที่สุด (เฉพาะเดือนที่มีรายจ่าย) */
  frugalMonth: { month: string; expense: number } | null
  /** เดือนที่เหลือเก็บมากที่สุด */
  bestMonth: { month: string; net: number } | null
  filing: { tax: number; balance: number } | null
}

/** ปีที่มีรายการ เรียงใหม่ไปเก่า */
export function wrappedYears(entries: { date: string }[]): number[] {
  return [...new Set(entries.map((e) => Number(e.date.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a)
}

export function buildWrapped(
  entries: WrapEntry[],
  workspaces: WrapWorkspace[],
  filings: WrapFiling[],
  year: number,
): WrappedSummary {
  const modeOf = new Map(workspaces.map((w) => [w.id, w.mode]))
  const own = entries.filter((e) => e.date.startsWith(`${year}-`) && modeOf.has(e.workspaceId))
  const labelOf = (e: WrapEntry) => categoryLabel(modeOf.get(e.workspaceId) ?? 'personal', e.categoryKey)

  let income = 0
  let expense = 0
  const byCategory = new Map<string, number>()
  const byMonth = new Map<string, { income: number; expense: number }>()
  let biggest: WrapEntry | null = null

  for (const e of own) {
    const amount = Number(e.amount) || 0
    const month = e.date.slice(0, 7)
    const m = byMonth.get(month) ?? { income: 0, expense: 0 }
    if (e.type === 'income') {
      income += amount
      m.income += amount
    } else {
      expense += amount
      m.expense += amount
      const label = labelOf(e)
      byCategory.set(label, (byCategory.get(label) ?? 0) + amount)
      if (!biggest || amount > biggest.amount) biggest = e
    }
    byMonth.set(month, m)
  }

  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]
  const months = [...byMonth.entries()]
  const frugal = months.filter(([, m]) => m.expense > 0).sort((a, b) => a[1].expense - b[1].expense)[0]
  const best = months.sort((a, b) => b[1].income - b[1].expense - (a[1].income - a[1].expense))[0]
  const filing = filings.find((f) => Number(f.taxYear) === year + 543)

  return {
    year,
    income: roundMoney(income),
    expense: roundMoney(expense),
    net: roundMoney(income - expense),
    savingsRate: income > 0 ? (income - expense) / income : 0,
    entryCount: own.length,
    activeDays: new Set(own.map((e) => e.date)).size,
    bestStreak: computeStreak(own, `${year}-12-31`).best,
    topCategory: top ? { label: top[0], amount: roundMoney(top[1]), share: expense > 0 ? top[1] / expense : 0 } : null,
    biggestExpense: biggest
      ? { label: labelOf(biggest), note: biggest.note, amount: roundMoney(biggest.amount), date: biggest.date }
      : null,
    frugalMonth: frugal ? { month: frugal[0], expense: roundMoney(frugal[1].expense) } : null,
    bestMonth: best ? { month: best[0], net: roundMoney(best[1].income - best[1].expense) } : null,
    filing: filing ? { tax: filing.tax, balance: filing.balance } : null,
  }
}
