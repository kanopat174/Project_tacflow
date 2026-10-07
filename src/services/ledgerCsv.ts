/**
 * CSV ของสมุดบัญชี — ฟังก์ชันบริสุทธิ์
 *
 *  1. ส่งออกรายการเป็น CSV เปิดใน Excel / Google Sheets ได้ทันที (ใส่ BOM ให้ Excel อ่านภาษาไทยถูก)
 *  2. นำเข้า statement ธนาคาร: อ่าน CSV เดาคอลัมน์ วันที่ / รายละเอียด / ยอด (หรือถอน–ฝากแยกคอลัมน์)
 *     แปลงวันที่ทั้งแบบ ค.ศ. และ พ.ศ. แล้วจัดหมวดให้อัตโนมัติจากคำในรายละเอียด
 */

import { categoriesOf, categoryLabel, type EntryType, type WorkspaceMode } from '@/data/workspaceModes'
import type { LedgerEntry } from './ledgerEngine'
import { roundMoney } from './taxEngine'

/* ---------- อ่านและเขียน CSV ---------- */

/** แยก CSV ตาม RFC 4180 — รองรับเครื่องหมายคำพูด จุลภาคและขึ้นบรรทัดใหม่ในช่อง */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  // statement บางธนาคารใช้ ; หรือ tab แทนจุลภาค ดูจากบรรทัดแรก
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  )

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

function csvCell(value: string | number): string {
  let text = String(value ?? '')
  // กันสูตรที่ฝังมากับหมายเหตุ (CSV injection) ตอนเปิดใน Excel
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/* ---------- ส่งออก ---------- */

export function entriesToCsv(entries: LedgerEntry[], mode: WorkspaceMode): string {
  const header = ['วันที่', 'ประเภท', 'หมวด', 'จำนวนเงิน', 'ภาษีหัก ณ ที่จ่าย', 'ภาษีมูลค่าเพิ่ม', 'สัญลักษณ์', 'หมายเหตุ']
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  return toCsv([
    header,
    ...sorted.map((e) => [
      e.date,
      e.type === 'income' ? 'รายรับ' : 'รายจ่าย',
      categoryLabel(mode, e.categoryKey),
      e.amount,
      e.withholdingTax ?? '',
      e.vatAmount ?? '',
      e.symbol ?? '',
      e.note ?? '',
    ]),
  ])
}

/* ---------- นำเข้า statement ---------- */

/** แปลงตัวเลขจาก statement: "1,234.50" "(500.00)" "-500" "500.00 DR" */
export function parseAmount(raw: string): number | null {
  const text = (raw ?? '').replace(/[฿\s,]|THB|บาท/gi, '')
  if (!text) return null
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /DR$/i.test(text)
  const n = Number(text.replace(/[()\-+]|DR$|CR$/gi, ''))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/**
 * แปลงวันที่เป็น YYYY-MM-DD — รับ 2026-01-31, 31/01/2026, 31/01/2569, 31-01-69, 31 ม.ค. 2569
 * ปีตั้งแต่ 2400 ถือเป็น พ.ศ. ปีสองหลักถือเป็น พ.ศ. ถ้ามากกว่า 40 (69 → 2569) ไม่งั้นเป็น ค.ศ.
 */
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function normaliseYear(y: number): number {
  if (y >= 2400) return y - 543
  if (y < 100) return y > 40 ? y + 2500 - 543 : y + 2000
  return y
}

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseDate(raw: string): string | null {
  const text = (raw ?? '').trim().split(/[ T]\d{1,2}:\d{2}/)[0]!.trim()
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return validDate(normaliseYear(+m[1]!), +m[2]!, +m[3]!)
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) return validDate(normaliseYear(+m[3]!), +m[2]!, +m[1]!)
  m = text.match(/^(\d{1,2})\s*([^\d\s]+)\s*(\d{2}|\d{4})$/)
  if (m) {
    const name = m[2]!.toLowerCase()
    let month = THAI_MONTHS.findIndex((t) => name === t || name === t.replace(/\./g, ''))
    if (month < 0) month = EN_MONTHS.findIndex((t) => name.startsWith(t))
    if (month >= 0) return validDate(normaliseYear(+m[3]!), month + 1, +m[1]!)
  }
  return null
}

export interface ColumnMap {
  date: number
  description: number
  /** ยอดคอลัมน์เดียว (บวกคือเงินเข้า ลบคือเงินออก) */
  amount: number
  /** ถอน / เงินออก */
  debit: number
  /** ฝาก / เงินเข้า */
  credit: number
}

const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp> = {
  date: /วันที่|date|วัน/i,
  description: /รายละเอียด|รายการ|description|details|memo|narrative|หมายเหตุ|ผู้รับ|payee/i,
  debit: /ถอน|เงินออก|จ่ายเงิน|withdraw|debit|\bdr\b/i,
  credit: /ฝาก|เงินเข้า|รับเงิน|deposit|credit|\bcr\b/i,
  amount: /จำนวนเงิน|ยอดเงิน|amount|value/i,
}

/** หาแถวหัวตารางและเดาคอลัมน์ — statement มักมีข้อมูลบัญชีอยู่หลายบรรทัดก่อนหัวตาราง */
export function detectColumns(rows: string[][]): { headerRow: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const header = rows[r]!
    const find = (key: keyof ColumnMap, skip: number[] = []) =>
      header.findIndex((h, i) => !skip.includes(i) && HEADER_PATTERNS[key].test(h) && !/คงเหลือ|balance/i.test(h))
    const date = find('date')
    if (date < 0) continue
    const debit = find('debit', [date])
    const credit = find('credit', [date, debit])
    const amount = find('amount', [date, debit, credit])
    const description = find('description', [date, debit, credit, amount])
    if (amount < 0 && (debit < 0 || credit < 0)) continue
    return { headerRow: r, columns: { date, description, amount, debit, credit } }
  }
  return null
}

/* ---------- จัดหมวดอัตโนมัติ ---------- */

/** คำในรายละเอียด → หมวดที่น่าจะใช่ เรียงตามลำดับที่ลอง ใช้หมวดแรกที่โหมดนั้นมี */
const CATEGORY_RULES: { pattern: RegExp; keys: string[] }[] = [
  { pattern: /เงินเดือน|salary|payroll/i, keys: ['salary', 'staff', 'payroll'] },
  { pattern: /โบนัส|bonus|\bot\b|ล่วงเวลา/i, keys: ['bonus'] },
  { pattern: /ปันผล|dividend/i, keys: ['dividend', 'investmentIncome'] },
  { pattern: /ดอกเบี้ย|interest/i, keys: ['interest', 'investmentIncome', 'interestIncome', 'interestExpense', 'marginInterest'] },
  { pattern: /ค่าเช่า|rent/i, keys: ['housing', 'rent', 'premises', 'rentalIncome'] },
  { pattern: /grab ?food|lineman|foodpanda|robinhood|7-?eleven|7-11|เซเว่น|lotus|โลตัส|big ?c|makro|แม็คโคร|tops|ร้านอาหาร|cafe|coffee|กาแฟ|starbucks|mcdonald|kfc|ข้าว|อาหาร|ขนม|ก๋วยเตี๋ยว|ชานม|ชาไข่มุก|บุฟเฟ่|มื้อ|ผลไม้|กับข้าว/i, keys: ['food'] },
  { pattern: /bts|mrt|grab(?! ?food)|bolt|taxi|แท็กซี่|ปตท|ptt|bangchak|บางจาก|shell|caltex|น้ำมัน|ทางด่วน|easy ?pass|m-?flow|ค่ารถ|วินมอเตอร์ไซค์|มอไซค์|รถเมล์|รถไฟ|ที่จอดรถ/i, keys: ['transport', 'workTravel', 'logistics'] },
  { pattern: /การไฟฟ้า|ไฟฟ้า|ค่าไฟ|ค่าน้ำ(?!มัน)|ค่าเน็ต|ค่าโทร|\bmea\b|\bpea\b|ประปา|\bmwa\b|\bpwa\b|ais|true|dtac|3bb|internet|อินเทอร์เน็ต|โทรศัพท์/i, keys: ['utilities', 'premises'] },
  { pattern: /โรงพยาบาล|hospital|clinic|คลินิก|ร้านยา|pharmacy|boots|watsons/i, keys: ['health'] },
  { pattern: /ประกันสังคม|social security|สปส/i, keys: ['socialSecurity'] },
  { pattern: /ประกัน|insurance|aia|เมืองไทยประกัน|allianz|fwd/i, keys: ['insurance'] },
  { pattern: /บัตรเครดิต|credit card|สินเชื่อ|loan|ผ่อน|ค่างวด/i, keys: ['debt', 'interestExpense'] },
  { pattern: /ค่าเทอม|tuition|โรงเรียน|มหาวิทยาลัย|school|university|course|คอร์ส/i, keys: ['education'] },
  { pattern: /netflix|spotify|youtube|disney|shopee|lazada|central|robinson|cinema|major|sf cinema/i, keys: ['lifestyle'] },
  { pattern: /กองทุน|fund|rmf|ssf|thai ?esg|หุ้น|securities|หลักทรัพย์|ออม/i, keys: ['savingInvest', 'contribution'] },
  { pattern: /ค่าธรรมเนียม|fee|charge/i, keys: ['bankFee', 'platformFee', 'brokerFee', 'commission'] },
  { pattern: /adobe|figma|canva|google|microsoft|aws|github|notion|openai|anthropic|software/i, keys: ['software', 'dataFee'] },
  { pattern: /facebook|meta ads|google ads|tiktok|โฆษณา|ads/i, keys: ['marketing'] },
  { pattern: /flash|kerry|ไปรษณีย์|thailand post|j&t|ขนส่ง/i, keys: ['logistics'] },
  { pattern: /สรรพากร|revenue|ภาษี|tax/i, keys: ['taxFee', 'corporateTax', 'withheldTax'] },
]

export function guessCategory(description: string, type: EntryType, mode: WorkspaceMode): string {
  const available = new Set(categoriesOf(mode, type).map((c) => c.key))
  for (const rule of CATEGORY_RULES) {
    if (!rule.pattern.test(description)) continue
    const key = rule.keys.find((k) => available.has(k))
    if (key) return key
  }
  return type === 'income' ? 'otherIncome' : 'otherExpense'
}

/* ---------- รวมทุกขั้น ---------- */

export interface ImportedRow {
  /** ลำดับแถวในไฟล์ (เริ่ม 1) ใช้บอกผู้ใช้ว่าแถวไหนมีปัญหา */
  line: number
  date: string
  type: EntryType
  amount: number
  categoryKey: string
  note: string
  /** มีรายการวันเดียวกัน ยอดเท่ากัน ประเภทเดียวกันอยู่ในสมุดแล้ว — น่าจะนำเข้าซ้ำ */
  duplicate: boolean
}

export interface StatementImport {
  rows: ImportedRow[]
  skipped: { line: number; reason: string }[]
  error: string
}

export function importStatement(
  text: string,
  mode: WorkspaceMode,
  existing: Pick<LedgerEntry, 'date' | 'type' | 'amount'>[] = [],
): StatementImport {
  const table = parseCsv(text)
  const detected = detectColumns(table)
  if (!detected) {
    return {
      rows: [],
      skipped: [],
      error: 'ไม่พบหัวตารางที่มีคอลัมน์วันที่และยอดเงิน ลองส่งออก statement เป็น CSV อีกครั้ง',
    }
  }

  const { headerRow, columns: c } = detected
  const seen = new Set(existing.map((e) => `${e.date}|${e.type}|${roundMoney(e.amount)}`))
  const rows: ImportedRow[] = []
  const skipped: StatementImport['skipped'] = []

  for (let r = headerRow + 1; r < table.length; r++) {
    const cells = table[r]!
    const line = r + 1
    const date = parseDate(cells[c.date] ?? '')
    if (!date) {
      // แถวสรุปยอดท้ายไฟล์ไม่มีวันที่ ไม่ต้องรายงานว่าเป็นปัญหา
      if ((cells[c.date] ?? '').trim()) skipped.push({ line, reason: 'อ่านวันที่ไม่ได้' })
      continue
    }

    let signed: number | null = null
    if (c.debit >= 0 && c.credit >= 0) {
      const out = parseAmount(cells[c.debit] ?? '')
      const inn = parseAmount(cells[c.credit] ?? '')
      if (inn) signed = Math.abs(inn)
      else if (out) signed = -Math.abs(out)
    } else {
      signed = parseAmount(cells[c.amount] ?? '')
    }
    if (!signed) {
      skipped.push({ line, reason: 'ไม่มียอดเงิน' })
      continue
    }

    const type: EntryType = signed > 0 ? 'income' : 'expense'
    const amount = roundMoney(Math.abs(signed))
    const note = (c.description >= 0 ? cells[c.description] ?? '' : '').slice(0, 200)
    const key = `${date}|${type}|${amount}`
    rows.push({
      line,
      date,
      type,
      amount,
      categoryKey: guessCategory(note, type, mode),
      note,
      duplicate: seen.has(key),
    })
  }

  return {
    rows,
    skipped,
    error: rows.length || skipped.length ? '' : 'ไฟล์นี้ไม่มีรายการที่อ่านได้',
  }
}
