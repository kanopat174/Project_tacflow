/**
 * ตรวจหารายการที่จ่าย/รับซ้ำทุกเดือน (ค่าเช่า ค่าสมาชิก เบี้ยประกัน) จากประวัติ — ฟังก์ชันบริสุทธิ์
 * แล้วเสนอให้ตั้งเป็นรายการประจำ เดือนต่อไประบบจะจดให้เอง
 *
 * เกณฑ์: ต้นทางเดียวกัน (คู่โอนบนสลิป หรือรายละเอียด) ยอดเท่ากันโดยประมาณ (ต่างไม่เกิน 5%)
 * พบใน MIN_MONTHS เดือนที่ติดกัน และเดือนล่าสุดไม่เก่ากว่าเดือนที่แล้ว (ยังจ่ายอยู่)
 * ไม่เสนอซ้ำกับรายการประจำที่ตั้งไว้แล้ว รายการที่สร้างจากรายการประจำ และที่ผู้ใช้กด "ไม่ใช่"
 */

import { memoryKey } from './entryMemory'
import type { EntryType } from '@/data/workspaceModes'
import type { RecurringTemplate, SlipMeta } from './ledgerEngine'
import { roundMoney } from './taxEngine'

export const MIN_MONTHS = 3
const AMOUNT_TOLERANCE = 0.05

export interface RecurringCandidateEntry {
  date: string
  type: EntryType
  categoryKey: string
  amount: number
  note: string
  slip?: SlipMeta
  recurringId?: string
}

export interface RecurringSuggestion {
  /** กุญแจคงที่ของข้อเสนอ ใช้จำว่าผู้ใช้ปฏิเสธแล้ว */
  key: string
  type: EntryType
  categoryKey: string
  note: string
  amount: number
  dayOfMonth: number
  /** เดือนที่พบ YYYY-MM เรียงจากเก่าไปใหม่ */
  months: string[]
  /** เดือนแรกที่ควรเริ่มจดให้ = เดือนถัดจากเดือนล่าสุดที่พบ */
  startMonth: string
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * AMOUNT_TOLERANCE

function sourceOf(entry: RecurringCandidateEntry): string {
  const party = entry.type === 'expense' ? entry.slip?.recipient : entry.slip?.sender
  return party || entry.note
}

export function detectRecurring(
  entries: RecurringCandidateEntry[],
  templates: Pick<RecurringTemplate, 'type' | 'amount' | 'note' | 'categoryKey'>[],
  today: string,
  dismissed: string[] = [],
): RecurringSuggestion[] {
  const thisMonth = today.slice(0, 7)
  const lastMonth = (() => {
    const [y, m] = thisMonth.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
  })()

  // จัดกลุ่มตามต้นทาง แล้วแยกกลุ่มย่อยตามยอดที่ใกล้กัน
  const groups = new Map<string, RecurringCandidateEntry[][]>()
  for (const entry of entries) {
    if (entry.recurringId || !(entry.amount > 0)) continue
    const key = memoryKey(sourceOf(entry))
    if (!key) continue
    const id = `${entry.type}|${key}`
    const clusters = groups.get(id) ?? []
    const cluster = clusters.find((c) => near(median(c.map((e) => e.amount)), entry.amount))
    if (cluster) cluster.push(entry)
    else clusters.push([entry])
    groups.set(id, clusters)
  }

  const suggestions: RecurringSuggestion[] = []
  for (const [id, clusters] of groups) {
    for (const cluster of clusters) {
      const months = [...new Set(cluster.map((e) => e.date.slice(0, 7)))].sort()
      const latest = months[months.length - 1]!
      if (latest < lastMonth) continue
      // ต้องติดกันอย่างน้อย MIN_MONTHS เดือน นับย้อนจากเดือนล่าสุด
      let run = 1
      for (let i = months.length - 1; i > 0 && nextMonth(months[i - 1]!) === months[i]; i--) run++
      if (run < MIN_MONTHS) continue

      const amount = roundMoney(median(cluster.map((e) => e.amount)))
      const key = `${id}|${Math.round(amount)}`
      if (dismissed.includes(key)) continue

      const latestEntry = [...cluster].sort((a, b) => b.date.localeCompare(a.date))[0]!
      const sameTemplate = templates.some(
        (t) =>
          t.type === latestEntry.type &&
          near(t.amount, amount) &&
          (t.categoryKey === latestEntry.categoryKey || memoryKey(t.note) === memoryKey(latestEntry.note)),
      )
      if (sameTemplate) continue

      suggestions.push({
        key,
        type: latestEntry.type,
        categoryKey: latestEntry.categoryKey,
        note: latestEntry.note,
        amount,
        dayOfMonth: Math.round(median(cluster.map((e) => Number(e.date.slice(8, 10))))),
        months: months.slice(-run),
        startMonth: nextMonth(latest),
      })
    }
  }
  return suggestions.sort((a, b) => b.amount - a.amount)
}

/* ---------- จำข้อเสนอที่ผู้ใช้ปฏิเสธ (แยกต่อสมุด) ---------- */

const dismissedKey = (workspaceId: string) => `taxflow_recurring_dismissed_${workspaceId}`

export function loadDismissed(workspaceId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(dismissedKey(workspaceId)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function saveDismissed(workspaceId: string, keys: string[]): void {
  try {
    localStorage.setItem(dismissedKey(workspaceId), JSON.stringify(keys.slice(-200)))
  } catch {
    /* จำไม่ได้ก็แค่เสนอซ้ำ */
  }
}
