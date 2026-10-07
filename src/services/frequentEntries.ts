/**
 * รายการที่จดซ้ำบ่อย ใช้ทำปุ่มกดเลือกในบันทึกด่วน — ฟังก์ชันบริสุทธิ์
 * เช่น ค่าข้าว 60 ทุกวัน หรือค่า BTS 47 จดแล้วไม่ต้องพิมพ์ใหม่
 */

import type { EntryType } from '@/data/workspaceModes'
import { daysBetween } from './latePayment'

export interface FrequentEntry {
  type: EntryType
  categoryKey: string
  amount: number
  note: string
  count: number
}

interface EntryLike {
  date: string
  type: EntryType
  categoryKey: string
  amount: number
  note: string
}

/**
 * นับรายการที่ประเภท หมวด และยอดตรงกัน ภายใน windowDays วันล่าสุด
 * ต้องเกิดอย่างน้อย minCount ครั้งจึงนับว่า "บ่อย" เรียงจากบ่อยสุด เท่ากันเอาที่จดล่าสุดก่อน
 */
export function frequentEntries(
  entries: EntryLike[],
  today: string,
  { windowDays = 90, minCount = 2, limit = 6 } = {},
): FrequentEntry[] {
  const groups = new Map<string, FrequentEntry & { last: string; notes: Map<string, number> }>()
  for (const e of entries) {
    const age = daysBetween(e.date, today)
    if (age < 0 || age > windowDays) continue
    const key = `${e.type}|${e.categoryKey}|${e.amount}`
    const note = (e.note ?? '').trim()
    const group = groups.get(key)
    if (group) {
      group.count += 1
      if (e.date > group.last) group.last = e.date
      if (note) group.notes.set(note, (group.notes.get(note) ?? 0) + 1)
    } else {
      groups.set(key, {
        type: e.type,
        categoryKey: e.categoryKey,
        amount: e.amount,
        note: '',
        count: 1,
        last: e.date,
        notes: new Map(note ? [[note, 1]] : []),
      })
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= minCount)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ type, categoryKey, amount, count, notes }) => ({
      type,
      categoryKey,
      amount,
      count,
      // ใช้หมายเหตุที่พิมพ์บ่อยที่สุดของกลุ่มนั้น
      note: [...notes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    }))
}
