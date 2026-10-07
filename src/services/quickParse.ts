/**
 * แปลงประโยคสั้น ๆ เป็นรายการรายรับรายจ่าย — ฟังก์ชันบริสุทธิ์
 *
 *   "กาแฟ 65"                    → รายจ่าย 65 บาท วันนี้ หมวดอาหาร
 *   "เงินเดือน 30,000 เมื่อวาน"    → รายรับ 30,000 เมื่อวาน หมวดเงินเดือน
 *   "+500 ขายของ"                 → รายรับ (เครื่องหมาย + บอกว่าเป็นเงินเข้า)
 *   "ค่าไฟ 1.2k 3/10"             → รายจ่าย 1,200 วันที่ 3 ต.ค.
 *
 * ประเภทเดาจากเครื่องหมายหรือคำ ถ้าไม่รู้ถือเป็นรายจ่าย เพราะคนจดรายจ่ายบ่อยกว่ามาก
 */

import type { EntryType, WorkspaceMode } from '@/data/workspaceModes'
import { guessCategory, parseDate } from './ledgerCsv'

export interface ParsedEntry {
  type: EntryType
  amount: number
  /** YYYY-MM-DD */
  date: string
  note: string
  categoryKey: string
}

const INCOME_WORDS = /เงินเดือน|รายรับ|รายได้|ได้รับ|ได้เงิน|รับเงิน|ขาย|โบนัส|ปันผล|ดอกเบี้ยรับ|ค่าจ้าง|ลูกค้าโอน|ค่าคอม|เงินคืน|ถูกหวย|salary|income|bonus|sold/i
const EXPENSE_WORDS = /^-|จ่าย|ซื้อ|ค่า(?!จ้าง)|เติม|โอนให้/

function shiftDays(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const RELATIVE_DAYS: [RegExp, number][] = [
  [/เมื่อวานซืน/, -2],
  [/เมื่อวาน|yesterday/i, -1],
  [/วันนี้|today/i, 0],
]

/** "1.2k" "2หมื่น" "3 พัน" "1,250.50" */
const AMOUNT = /([+-]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน|ล้าน|บาท|฿)?/i
const MULTIPLIER: Record<string, number> = { k: 1_000, พัน: 1_000, หมื่น: 10_000, แสน: 100_000, ล้าน: 1_000_000 }

/** วันที่แบบตัวเลขในประโยค: 3/10, 3/10/69, 2026-10-03 */
const DATE_TOKEN = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/

export function parseQuickEntry(text: string, mode: WorkspaceMode, today: string): ParsedEntry | null {
  let rest = ` ${text.trim()} `
  if (!rest.trim()) return null

  // วันที่ก่อน จะได้ไม่เอาเลขวันที่ไปเป็นจำนวนเงิน
  let date = today
  for (const [pattern, days] of RELATIVE_DAYS) {
    if (pattern.test(rest)) {
      date = shiftDays(today, days)
      rest = rest.replace(pattern, ' ')
      break
    }
  }
  const dateMatch = rest.match(DATE_TOKEN)
  if (dateMatch) {
    const token = dateMatch[1]!
    // ไม่ระบุปีให้ใช้ปีปัจจุบัน ถ้าได้วันในอนาคตแปลว่าหมายถึงปีที่แล้ว
    let parsed = token.split('/').length === 2 ? parseDate(`${token}/${today.slice(0, 4)}`) : parseDate(token)
    if (parsed && parsed > today && token.split('/').length === 2) {
      parsed = parseDate(`${token}/${Number(today.slice(0, 4)) - 1}`)
    }
    if (parsed) {
      date = parsed
      rest = rest.replace(token, ' ')
    }
  }

  // มีหลายตัวเลข (เช่น "ข้าว 7-11 60") เลือกตัวที่มีเครื่องหมาย +/− นำหน้า หรือมีหน่วยกำกับ ไม่งั้นเอาตัวท้ายสุด
  const candidates = [...rest.matchAll(new RegExp(AMOUNT.source, 'gi'))].map((m) => ({
    m,
    signed: Boolean(m[1]) && /\s/.test(rest[m.index! - 1] ?? ' '),
    unit: Boolean(m[3]),
  }))
  if (!candidates.length) return null
  const chosen = candidates.find((c) => c.signed) ?? candidates.find((c) => c.unit) ?? candidates[candidates.length - 1]!
  const [whole, rawSign, digits, unit] = chosen.m
  const sign = chosen.signed ? rawSign : ''
  const amount = Number(digits!.replace(/,/g, '')) * (MULTIPLIER[(unit ?? '').toLowerCase()] ?? 1)
  if (!(amount > 0) || !Number.isFinite(amount)) return null
  rest = rest.replace(whole!, ' ')

  const note = rest.replace(/\s+/g, ' ').trim()
  const type: EntryType =
    sign === '+' ? 'income' : sign === '-' ? 'expense' : INCOME_WORDS.test(note) && !EXPENSE_WORDS.test(note) ? 'income' : 'expense'

  return {
    type,
    amount: Math.round(amount * 100) / 100,
    date,
    note,
    categoryKey: guessCategory(note, type, mode),
  }
}
