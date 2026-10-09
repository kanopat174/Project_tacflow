/**
 * ข้อความเดียวหลายรายการ — ฟังก์ชันบริสุทธิ์
 *
 *  1. ประโยคสั้นหลายรายการ: "ข้าว 60 กาแฟ 45 ค่ารถ 30" → 3 รายการ
 *     แยกที่ตัวคั่น (, ; | ขึ้นบรรทัด "และ") และหลังยอดเงินที่ตามด้วยคำใหม่
 *     ท่อนที่ไม่มียอดเงิน ("เมื่อวาน") ต่อกลับเข้ารายการก่อนหน้า
 *  2. ข้อความแจ้งเตือนธนาคาร (SMS / แอป / LINE) ที่คัดลอกมาวาง: "เงินออก 500.00 บ. บช X1234 คงเหลือ 9,500.00"
 *     ดูทิศทางเงินจากคำว่าเงินเข้า/ออก ไม่เอายอดคงเหลือมาเป็นยอดรายการ
 */

import type { WorkspaceMode } from '@/data/workspaceModes'
import { guessCategory } from './ledgerCsv'
import { parseQuickEntry, type ParsedEntry } from './quickParse'

/* ---------- 1. ประโยคหลายรายการ ---------- */

/** ตัวคั่นชัดเจน — จุลภาคในตัวเลข (1,200) ไม่นับ */
const SEPARATOR = /\s*[;|\n]\s*|\s*,(?!\d{3}(?:\D|$))\s*|\s+(?:และ|แล้วก็)\s+/
const AMOUNT = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:k|พัน|หมื่น|แสน|ล้าน|บาท|฿))?/gi
/** คำที่ตามหลังยอดเงินแล้วยังเป็นรายการเดิม */
const TRAILING_WORD = /^\s+(?:เมื่อวานซืน|เมื่อวาน|วันนี้|today|yesterday|บาท|฿)/i

/** แยกหลังยอดเงินที่มีคำนำหน้าและตามด้วยคำใหม่: "ข้าว 60 กาแฟ 45" → ["ข้าว 60", "กาแฟ 45"] */
function splitAfterAmounts(segment: string): string[] {
  const parts: string[] = []
  let start = 0
  for (const m of segment.matchAll(AMOUNT)) {
    if (m.index! < start) continue
    let end = m.index! + m[0].length
    const before = segment.slice(start, m.index)
    if (!/[ก-๙a-z]/i.test(before)) continue
    // คำอย่าง "เมื่อวาน" "บาท" ยังเป็นของรายการนี้ ตัดหลังคำนั้นแทน
    let trailing: RegExpMatchArray | null
    while ((trailing = segment.slice(end).match(TRAILING_WORD))) end += trailing[0].length
    if (!/^\s+[ก-๙a-z+]/i.test(segment.slice(end))) continue
    parts.push(segment.slice(start, end))
    start = end
  }
  parts.push(segment.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

export function splitQuickEntries(text: string): string[] {
  const pieces = text.split(SEPARATOR).flatMap(splitAfterAmounts)
  // ท่อนที่ไม่มีตัวเลขเลยเป็นส่วนขยายของรายการก่อนหน้า (หรือรายการถัดไปถ้าอยู่หน้าสุด)
  const merged: string[] = []
  let carry = ''
  for (const piece of pieces) {
    if (/\d/.test(piece)) {
      merged.push(carry ? `${carry} ${piece}` : piece)
      carry = ''
    } else if (merged.length) merged[merged.length - 1] += ` ${piece}`
    else carry = carry ? `${carry} ${piece}` : piece
  }
  if (carry) merged.push(carry)
  return merged
}

export function parseQuickEntries(text: string, mode: WorkspaceMode, today: string): ParsedEntry[] {
  return splitQuickEntries(text)
    .map((part) => parseQuickEntry(part, mode, today))
    .filter((p): p is ParsedEntry => p !== null)
}

/* ---------- 2. ข้อความแจ้งเตือนธนาคาร ---------- */

const MONEY_IN = /เงินเข้า|รับโอน|โอนเข้า|เข้าบัญชี|ฝากเงิน|ได้รับเงิน|รับเงิน|เงินโอนเข้า|received|deposit|credited|incoming|transfer\s*in/i
const MONEY_OUT =
  /เงินออก|โอนออก|โอนเงินไป|ถอน|จ่าย|ชำระ|ตัดบัญชี|หักบัญชี|ใช้จ่าย|ซื้อ|withdraw|debited|paid|payment|spent|transfer\s*(?:out|to)/i
const ACCOUNT_HINT = /บ\/ช|บช\.?|บัญชี|a\/c|acct|account|[xX*]{1,}-?\d{3,4}|คงเหลือ|balance|avail/i
const BALANCE = /(?:ยอดเงินคงเหลือ|ยอดคงเหลือ|คงเหลือ|ใช้ได้|ยอดใช้ได้|available\s*balance|avail(?:able)?\.?\s*bal(?:ance)?\.?|balance|bal\.)\s*:?\s*(?:thb|บ\.?)?\s*[\d,]+(?:\.\d+)?\s*(?:บ\.|บาท|thb)?/gi
const ACCOUNT = /(?:บ\/ช|บช\.?|บัญชี|a\/c|acct\.?|account)?\s*(?:[xX*]+-?)+\d{3,4}(?:-[xX*\d])?/g
const DATE = /(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)/
const DATE_ALL = new RegExp(DATE.source, 'g')
/** เวลาใช้ ":" หรือมี @/เวลา นำหน้า — "500.00" ไม่ใช่เวลา */
const TIME = /(?:@|เวลา)\s*\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:น\.?)?|(?<![\d.,])\d{1,2}:\d{2}(?::\d{2})?\s*(?:น\.?)?/g
const MONEY = /(?<![\d,.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(บ\.|บาท|thb|฿)?/gi
const PARTY_IN = /(?:จาก|from)\s+([^\d|@]{2,60}?)(?=\s*(?:\d|บ\/ช|บช|บัญชี|เข้า|ไป|$))/i
const PARTY_OUT = /(?:ไปยัง|โอนให้|ให้|ที่ร้าน|ร้าน|to|at)\s+([^\d|@]{2,60}?)(?=\s*(?:\d|บ\/ช|บช|บัญชี|จาก|$))/i

export function looksLikeBankNotice(text: string): boolean {
  return (MONEY_IN.test(text) || MONEY_OUT.test(text)) && ACCOUNT_HINT.test(text) && /\d+[.,]\d{2}|\d\s*(?:บ\.|บาท|thb)/i.test(text)
}

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

/** วันที่ในแจ้งเตือน: 09/10/69 · 09-10-2026 · 09/10 (ไม่มีปี = ปีนี้ ถ้าอยู่ในอนาคตคือปีที่แล้ว) */
function noticeDate(text: string, today: string): string | null {
  const m = text.match(DATE)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const thisYear = Number(today.slice(0, 4))
  if (!m[3]) {
    const date = validDate(thisYear, month, day)
    return date && date > today ? validDate(thisYear - 1, month, day) : date
  }
  let year = Number(m[3])
  if (m[3].length === 2) year = year >= 50 ? year + 2500 - 543 : year + 2000
  else if (year >= 2400) year -= 543
  const date = validDate(year, month, day)
  return date && date <= today ? date : null
}

function noticeAmount(text: string): number | null {
  const cleaned = text.replace(BALANCE, ' ').replace(ACCOUNT, ' ').replace(TIME, ' ').replace(DATE_ALL, ' ')
  let fallback: number | null = null
  for (const m of cleaned.matchAll(MONEY)) {
    const value = Number(`${m[1]!.replace(/,/g, '')}${m[2] ?? ''}`)
    if (!(value > 0)) continue
    if (m[2] || m[3]) return value
    fallback ??= value
  }
  return fallback
}

/** แยกข้อความที่วางมาเป็นทีละแจ้งเตือน — แจ้งเตือนใหม่เริ่มเมื่อเจอคำเงินเข้า/ออกอีกครั้ง */
function splitNotices(text: string): string[] {
  const lines = text
    .split(/\s*[|\n]\s*/)
    .map((l) => l.trim())
    .filter(Boolean)
  const notices: string[] = []
  let current = ''
  for (const line of lines) {
    const startsNew = (MONEY_IN.test(line) || MONEY_OUT.test(line)) && current && noticeAmount(current) !== null
    if (startsNew) {
      notices.push(current)
      current = line
    } else current = current ? `${current} ${line}` : line
  }
  if (current) notices.push(current)
  return notices
}

function firstIndex(pattern: RegExp, text: string): number {
  const m = text.match(pattern)
  return m ? m.index! : Infinity
}

export function parseBankNotices(text: string, mode: WorkspaceMode, today: string): ParsedEntry[] {
  const out: ParsedEntry[] = []
  for (const notice of splitNotices(text)) {
    const inAt = firstIndex(MONEY_IN, notice)
    const outAt = firstIndex(MONEY_OUT, notice)
    if (inAt === Infinity && outAt === Infinity) continue
    const amount = noticeAmount(notice)
    if (!amount) continue
    const type = inAt <= outAt ? 'income' : 'expense'
    const party = (type === 'income' ? notice.match(PARTY_IN) : notice.match(PARTY_OUT))?.[1]?.trim() ?? ''
    const account = notice.match(/(?:[xX*]+-?)+(\d{3,4})/)?.[1]
    const note =
      (party ? `${type === 'income' ? 'รับโอนจาก' : 'โอนให้'} ${party}` : type === 'income' ? 'เงินเข้าบัญชี' : 'เงินออกจากบัญชี') +
      (account ? ` (บช ${account})` : '')
    out.push({
      type,
      amount: Math.round(amount * 100) / 100,
      date: noticeDate(notice, today) ?? today,
      note,
      categoryKey: guessCategory(`${party} ${notice}`, type, mode),
      reason: 'จากข้อความแจ้งเตือนธนาคาร',
    })
  }
  return out
}

/** ข้อความที่พิมพ์หรือวาง → รายการทั้งหมดที่อ่านได้ */
export function parseEntries(text: string, mode: WorkspaceMode, today: string): ParsedEntry[] {
  if (!text.trim()) return []
  if (looksLikeBankNotice(text)) {
    const notices = parseBankNotices(text, mode, today)
    if (notices.length) return notices
  }
  return parseQuickEntries(text, mode, today)
}
