/**
 * สรุปสัปดาห์ที่แล้ว (จันทร์–อาทิตย์) — ฟังก์ชันบริสุทธิ์
 * เทียบกับสัปดาห์ก่อนหน้า บอกหมวดที่ใช้มากสุดและหมวดที่พุ่งขึ้นมากสุด
 */

import { categoryLabel, type WorkspaceMode } from '@/data/workspaceModes'
import { roundMoney } from './taxEngine'

interface EntryLike {
  workspaceId: string
  date: string
  type: 'income' | 'expense'
  categoryKey: string
  amount: number
}

export interface WeeklyRecap {
  /** จันทร์ของสัปดาห์ที่สรุป YYYY-MM-DD */
  from: string
  /** อาทิตย์ของสัปดาห์ที่สรุป */
  to: string
  income: number
  expense: number
  net: number
  previousExpense: number
  /** รายจ่ายเปลี่ยนไปกี่ % เทียบสัปดาห์ก่อน — null เมื่อสัปดาห์ก่อนไม่มีรายจ่าย */
  expenseChange: number | null
  topCategory: { label: string; amount: number } | null
  /** หมวดที่รายจ่ายเพิ่มขึ้นมากที่สุดเทียบสัปดาห์ก่อน */
  biggestRise: { label: string; amount: number } | null
  daysLogged: number
  entryCount: number
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** จันทร์ของสัปดาห์ที่วันนี้อยู่ */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = อาทิตย์
  return shift(date, -((day + 6) % 7))
}

export function weeklyRecap(
  entries: EntryLike[],
  modes: Record<string, WorkspaceMode>,
  today: string,
): WeeklyRecap | null {
  const from = shift(mondayOf(today), -7)
  const to = shift(from, 6)
  const prevFrom = shift(from, -7)

  const labelOf = (e: EntryLike) => (modes[e.workspaceId] ? categoryLabel(modes[e.workspaceId]!, e.categoryKey) : e.categoryKey)
  const week = entries.filter((e) => e.date >= from && e.date <= to)
  if (!week.length) return null
  const previous = entries.filter((e) => e.date >= prevFrom && e.date < from)

  const spend = (list: EntryLike[]) => {
    const map = new Map<string, number>()
    for (const e of list) if (e.type === 'expense') map.set(labelOf(e), (map.get(labelOf(e)) ?? 0) + (Number(e.amount) || 0))
    return map
  }
  const total = (list: EntryLike[], type: 'income' | 'expense') =>
    roundMoney(list.filter((e) => e.type === type).reduce((s, e) => s + (Number(e.amount) || 0), 0))

  const thisSpend = spend(week)
  const prevSpend = spend(previous)
  const top = [...thisSpend.entries()].sort((a, b) => b[1] - a[1])[0]
  const rise = [...thisSpend.entries()]
    .map(([label, amount]) => ({ label, amount: roundMoney(amount - (prevSpend.get(label) ?? 0)) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0]

  const income = total(week, 'income')
  const expense = total(week, 'expense')
  const previousExpense = total(previous, 'expense')

  return {
    from,
    to,
    income,
    expense,
    net: roundMoney(income - expense),
    previousExpense,
    expenseChange: previousExpense > 0 ? (expense - previousExpense) / previousExpense : null,
    topCategory: top ? { label: top[0], amount: roundMoney(top[1]) } : null,
    // พุ่งขึ้นเฉพาะเมื่อสัปดาห์ก่อนมีข้อมูล ไม่งั้นทุกหมวดดู "เพิ่มขึ้น" หมด
    biggestRise: previous.length && rise ? rise : null,
    daysLogged: new Set(week.map((e) => e.date)).size,
    entryCount: week.length,
  }
}
