/**
 * แปลงข้อความ OCR ของสลิปโอนเงินเป็นข้อมูลรายการ — ฟังก์ชันบริสุทธิ์
 *
 * หลักการ
 *  - ไม่ยึดรูปแบบสลิปของธนาคารใดธนาคารหนึ่ง: ใช้ป้ายข้อความ (ไทย/อังกฤษ) เป็นหลักฐานก่อน
 *    ถ้าไม่มีป้าย ใช้โครงสร้างที่สลิปทุกเจ้าเหมือนกัน คือ บล็อกผู้โอนอยู่บน บล็อกผู้รับอยู่ล่าง
 *    และแต่ละบล็อกมีชื่อตามด้วยธนาคารหรือเลขบัญชี
 *  - ทุกช่องมีค่าความมั่นใจ 0–1 และบรรทัดต้นทางบนสลิป ช่องที่ต่ำกว่าเกณฑ์หรือหาไม่เจอต้องให้ผู้ใช้ตรวจ
 *  - ไม่เดาเติมค่าที่ไม่มีในสลิป: ไม่ใช้วันนี้แทนวันที่ ไม่ใช้ชื่อผู้โอนแทนผู้รับ ไม่หยิบเลขอื่นมาเป็นเลขอ้างอิง
 *  - ข้อความ OCR เป็นข้อมูลที่ไม่น่าเชื่อถือ: ตัดอักขระควบคุม จำกัดความยาว และตรวจรูปแบบทุกช่องก่อนใช้
 */

import type { EntryType } from '@/data/workspaceModes'
import type { LedgerEntry, RecipientType, SlipMeta } from './ledgerEngine'

/** บรรทัดจาก OCR พร้อมความมั่นใจ 0–100 ของตัวอ่าน */
export interface OcrLine {
  text: string
  confidence: number
}

export interface SlipField<T> {
  value: T | null
  /** 0–1 */
  confidence: number
  /** บรรทัดบนสลิปที่ใช้เป็นหลักฐาน */
  source: string | null
  /** เหตุผลที่ต้องให้ผู้ใช้ตรวจ — null คือไม่มีข้อสังเกต */
  issue: string | null
}

export type SlipFieldKey = 'amount' | 'date' | 'time' | 'sender' | 'recipient' | 'reference'

export interface SlipExtraction {
  amount: SlipField<number>
  /** YYYY-MM-DD ตามวันที่พิมพ์บนสลิป (เวลาไทย) */
  date: SlipField<string>
  /** HH:MM */
  time: SlipField<string>
  sender: SlipField<string>
  recipient: SlipField<string>
  recipientType: RecipientType | null
  recipientBank: string | null
  banks: string[]
  reference: SlipField<string>
  /** ชื่อที่พบแต่ระบุไม่ได้ว่าเป็นผู้โอนหรือผู้รับ */
  unassignedNames: string[]
  /** null = ตัดสินไม่ได้ ผู้ใช้ต้องเลือกเอง */
  direction: EntryType | null
  directionReason: string
  /** ช่องที่ต้องให้ผู้ใช้ตรวจก่อนบันทึก */
  review: SlipFieldKey[]
}

/** ความมั่นใจต่ำกว่านี้ต้องให้ผู้ใช้ตรวจ */
export const REVIEW_THRESHOLD = 0.75

interface Line {
  text: string
  /** ความมั่นใจของ OCR 0–1 */
  conf: number
}

function field<T>(value: T | null, confidence: number, source: string | null, issue: string | null = null): SlipField<T> {
  return value === null
    ? { value: null, confidence: 0, source, issue }
    : { value, confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100, source, issue }
}

/** OCR อ่านไม่ชัดทำให้ช่องที่มาจากบรรทัดนั้นน่าเชื่อถือน้อยลง */
function ocrFactor(conf: number): number {
  return conf >= 0.8 ? 1 : conf >= 0.6 ? 0.85 : 0.6
}

/* ---------- ทำความสะอาดข้อความ ---------- */

// อักขระควบคุม อักขระล่องหน และตัวกลับทิศทางข้อความ — ไม่มีความหมายบนสลิป และอาจใช้ซ่อนข้อความได้
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g

function normaliseLine(raw: string): string {
  return raw
    .replace(INVISIBLE, '')
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/ํา/g, 'ำ') // "ํา" ที่ OCR แยกเป็นสองตัว → "ำ"
    .replace(/[：﹕]/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

function toLines(input: string | OcrLine[]): Line[] {
  const raw: Line[] =
    typeof input === 'string'
      ? input.split(/\r?\n/).map((text) => ({ text, conf: 1 }))
      : input.map((l) => ({ text: l.text, conf: Math.max(0, Math.min(100, Number(l.confidence) || 0)) / 100 }))
  return raw.map((l) => ({ text: normaliseLine(l.text), conf: l.conf })).filter((l) => l.text).slice(0, 200)
}

/* ---------- ป้ายข้อความ ---------- */

/**
 * สร้าง regex ที่ทนช่องว่างที่ OCR แทรกระหว่างตัวอักษร และจุดที่หายไป
 * เช่น "เลขที่รายการ" จับ "เลขที่ รายการ" ได้ "ref. no." จับ "Ref No" ได้
 */
function loose(phrases: string[]): string {
  return [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) =>
      [...p]
        .map((c) => (c === ' ' ? '\\s*' : c === '.' ? '\\.?' : c.replace(/[\\^$*+?()[\]{}|/-]/g, '\\$&')))
        .join('\\s?'),
    )
    .join('|')
}

/** ป้ายที่ขึ้นต้นบรรทัด ตามด้วยช่องว่าง โคลอน หรือจบบรรทัด (\b ใช้กับอักษรไทยไม่ได้) */
function labelAt(phrases: string[]): RegExp {
  return new RegExp(`^(?:${loose(phrases)})(?=$|[\\s:.])\\s*[:.]?\\s*`, 'i')
}

const SENDER_LABEL = labelAt(['ชื่อผู้โอน', 'บัญชีผู้โอน', 'ผู้โอนเงิน', 'ผู้โอน', 'โอนจาก', 'จาก', 'from', 'sender', 'payer', 'from account'])
const RECIPIENT_LABEL = labelAt([
  'ชื่อผู้รับเงิน',
  'ชื่อผู้รับ',
  'บัญชีผู้รับ',
  'ผู้รับเงิน',
  'ผู้รับโอน',
  'ผู้รับ',
  'ไปยัง',
  'ไปที่',
  'โอนไปยัง',
  'โอนให้',
  'ถึง',
  'to',
  'recipient',
  'payee',
  'beneficiary',
  'pay to',
  'transfer to',
  'to account',
])
const AMOUNT_LABEL = new RegExp(
  loose(['จำนวนเงิน', 'จำนวน', 'ยอดเงิน', 'ยอดโอน', 'ยอดชำระ', 'ยอดรวม', 'amount', 'total amount', 'transfer amount', 'total']),
  'i',
)
const FEE_LABEL = new RegExp(loose(['ค่าธรรมเนียม', 'ยอดคงเหลือ', 'คงเหลือ', 'fee', 'balance', 'available']), 'i')
const REFERENCE_LABEL = new RegExp(
  `(?:^|\\s)(?:${loose([
    'เลขที่รายการ',
    'รหัสอ้างอิง',
    'เลขที่อ้างอิง',
    'หมายเลขอ้างอิง',
    'เลขอ้างอิง',
    'รหัสรายการ',
    'หมายเลขรายการ',
    'เลขที่ธุรกรรม',
    'transaction id',
    'transaction no.',
    'transaction ref.',
    'transaction reference',
    'transaction number',
    'trans. id',
    'txn id',
    'reference no.',
    'reference number',
    'reference id',
    'reference code',
    'reference',
    'ref. no.',
    'ref. id',
    'ref.',
  ])})(?![a-z])\\s*[:.#]?\\s*`,
  'i',
)
/** เลขอ้างอิงของบิล (Ref.1 / Ref 2) เป็นเลขลูกค้า ไม่ใช่เลขของรายการโอน */
const BILLER_REF_SUFFIX = /^[123](?:\s*[:.]|\s|$)/
const MEMO_LABEL = new RegExp(loose(['บันทึกช่วยจำ', 'บันทึก', 'หมายเหตุ', 'memo', 'note', 'รายละเอียด']), 'i')
const STATUS_TEXT =
  /สำเร็จ|successful|success|completed|ทำรายการ|ขอบคุณ|thank|สแกน|scan|ตรวจสอบ|verify|qr\s*code|e-?slip|ใบเสร็จ|receipt|ค่าธรรมเนียม|\bfee\b/i

const PERSON_TITLE = /^(?:นางสาว|นาง|นาย|น\.\s?ส\.?|ด\.\s?ช\.?|ด\.\s?ญ\.?|mrs|mr|ms|miss|mister)(?:\.|\s|(?=[ก-๙]))/i
const COMPANY_MARK =
  /บริษัท|บจก|บมจ|หจก|ห้างหุ้นส่วน|จำกัด|มหาชน|มูลนิธิ|สมาคม|สหกรณ์|\b(?:co\.?,?\s*ltd|company|limited|ltd|corp(?:oration)?|inc|plc|llc|foundation|association)\b/i
const COMPANY_START = /^(?:บริษัท|บจก|บมจ|หจก|ห้างหุ้นส่วน|มูลนิธิ|สมาคม|สหกรณ์|company)/i
const COMPANY_END = /(?:จำกัด|\(?มหาชน\)?|ltd\.?|limited|inc\.?|plc\.?|corp(?:oration)?\.?)\s*$/i
const CONTINUATION_START = /^(?:จำกัด|\(?มหาชน\)?|co\.?|ltd|limited|company|corporation|public|inc|plc|\()/i

const BANKS: [RegExp, string][] = [
  [/กสิกร|k\s?plus|kbank|kasikorn|make\s?by/i, 'กสิกรไทย'],
  [/ไทยพาณิชย์|\bscb\b|siam\s*commercial/i, 'ไทยพาณิชย์'],
  [/ธนาคารกรุงเทพ|ธ\.\s?กรุงเทพ|\bbbl\b|bangkok\s*bank|bualuang/i, 'กรุงเทพ'],
  [/กรุงไทย|\bktb\b|krungthai|krung\s*thai/i, 'กรุงไทย'],
  [/กรุงศรี|\bbay\b|krungsri/i, 'กรุงศรีอยุธยา'],
  [/ทหารไทยธนชาต|\bttb\b|tmbthanachart/i, 'ทีทีบี'],
  [/ออมสิน|\bgsb\b|mymo/i, 'ออมสิน'],
  // ต้องมีจุดครบ ไม่งั้นไปชน "ธ.กสิกรไทย"
  [/ธ\.ก\.ส\.|\bbaac\b/i, 'ธ.ก.ส.'],
  [/ยูโอบี|\buob\b/i, 'ยูโอบี'],
  [/ซีไอเอ็มบี|\bcimb\b/i, 'ซีไอเอ็มบี ไทย'],
  [/เกียรตินาคิน|\bkkp\b/i, 'เกียรตินาคินภัทร'],
  [/แลนด์\s*แอนด์\s*เฮ้าส์|\blh\s*bank\b/i, 'แลนด์ แอนด์ เฮ้าส์'],
  [/ทิสโก้|\btisco\b/i, 'ทิสโก้'],
  [/อาคารสงเคราะห์|\bghb\b/i, 'อาคารสงเคราะห์'],
  [/พร้อมเพย์|promptpay/i, 'พร้อมเพย์'],
]
const BANK_WORDS = /ธนาคาร|bank|ธ\.|ไทย|thai|จำกัด|มหาชน|public|company|limited|pcl|mobile|banking|app|next|easy|plus|make|by/gi

function bankOf(text: string): string | null {
  return BANKS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

/** บรรทัดที่มีแต่ชื่อธนาคารหรือชื่อแอป */
function isBankLine(text: string): boolean {
  if (!bankOf(text)) return false
  let rest = text
  for (const [pattern] of BANKS) rest = rest.replace(new RegExp(pattern.source, 'gi'), '')
  return (rest.replace(BANK_WORDS, '').match(/[ก-๙a-z]/gi) ?? []).length < 3
}

/** เลขบัญชีที่ปิดบางหลัก เลขพร้อมเพย์ เลขร้านค้า */
function isAccountLine(text: string): boolean {
  return (
    /[x*•]{2,}/i.test(text) ||
    /^[\dx*•\s-]{8,}$/i.test(text) ||
    /เลขที่บัญชี|บัญชีเลขที่|account\s*(?:no|number)|biller\s*id|รหัสร้านค้า|merchant\s*id|เลขประจำตัว/i.test(text)
  )
}

/* ---------- ยอดเงิน ---------- */

const MONEY = /(?<![\d,.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?(?![\d,]|\.\d)(\s*(?:บาท|thb|baht|฿))?/gi

/** OCR มักอ่านจุลภาคเป็นจุด: "1.250.00" → "1,250.00" */
function fixThousands(text: string): string {
  return text.replace(/(\d)\.(\d{3})(?=[.,]\d{2}(?!\d)|\.\d{3})/g, '$1,$2')
}

/** ยอดเงินในบรรทัด — ทศนิยมสองตำแหน่ง หรือจำนวนเต็มที่มีคำว่าบาทตามหลัง (ถ้า allowInteger) */
function moneyIn(text: string, allowInteger: boolean): number[] {
  const out: number[] = []
  for (const m of fixThousands(text).matchAll(MONEY)) {
    if (!m[2] && !(allowInteger && m[3])) continue
    const n = Number(`${m[1]!.replace(/,/g, '')}${m[2] ?? ''}`)
    if (n > 0 && n <= 100_000_000) out.push(n)
  }
  return out
}

function findAmount(lines: Line[]): SlipField<number> {
  const labelled: { value: number; line: Line }[] = []
  lines.forEach((line, i) => {
    if (!AMOUNT_LABEL.test(line.text) || FEE_LABEL.test(line.text)) return
    const own = moneyIn(line.text, true)
    if (own.length) return labelled.push({ value: own[0]!, line })
    // ป้ายอยู่บรรทัดหนึ่ง ตัวเลขอยู่บรรทัดถัดไป
    const next = lines[i + 1]
    if (next && !FEE_LABEL.test(next.text)) {
      const below = moneyIn(next.text, true)
      if (below.length) labelled.push({ value: below[0]!, line: next })
    }
  })
  if (labelled.length) {
    const distinct = new Set(labelled.map((l) => l.value))
    const first = labelled[0]!
    return distinct.size === 1
      ? field(first.value, 0.92 * ocrFactor(first.line.conf), first.line.text)
      : field(first.value, 0.5, first.line.text, 'พบยอดเงินที่มีป้ายมากกว่าหนึ่งค่า')
  }
  // ไม่มีป้าย: ใช้ได้เฉพาะเมื่อทั้งสลิปมียอดทศนิยมอยู่ค่าเดียว
  const candidates = lines
    .filter((l) => !FEE_LABEL.test(l.text) && !TIME.test(l.text))
    .flatMap((l) => moneyIn(l.text, false).map((value) => ({ value, line: l })))
  const distinct = new Set(candidates.map((c) => c.value))
  if (distinct.size === 1) {
    const only = candidates[0]!
    return field(only.value, 0.65 * ocrFactor(only.line.conf), only.line.text, 'ไม่พบป้าย "จำนวนเงิน" ใช้ยอดเดียวที่พบบนสลิป')
  }
  return field<number>(null, 0, null, distinct.size ? 'พบตัวเลขหลายค่าแต่ไม่มีป้ายบอกว่าค่าไหนคือยอดโอน' : 'ไม่พบยอดเงินบนสลิป')
}

/* ---------- วันที่และเวลา ---------- */

const MONTH_KEYS: Record<string, number> = {}
;[
  ['มค', 'มกราคม', 'jan', 'january'],
  ['กพ', 'กุมภาพันธ์', 'feb', 'february'],
  ['มีค', 'มีนาคม', 'mar', 'march'],
  ['เมย', 'เมษายน', 'apr', 'april'],
  ['พค', 'พฤษภาคม', 'may'],
  ['มิย', 'มิถุนายน', 'jun', 'june'],
  ['กค', 'กรกฎาคม', 'jul', 'july'],
  ['สค', 'สิงหาคม', 'aug', 'august'],
  ['กย', 'กันยายน', 'sep', 'sept', 'september'],
  ['ตค', 'ตุลาคม', 'oct', 'october'],
  ['พย', 'พฤศจิกายน', 'nov', 'november'],
  ['ธค', 'ธันวาคม', 'dec', 'december'],
].forEach((names, i) => names.forEach((n) => (MONTH_KEYS[n] = i + 1)))

const DATE_WORD = /(?<!\d)(\d{1,2})\s*([ก-๙a-z][ก-๙a-z.\s]{0,14}?)\s*\.?\s*(\d{4}|\d{2})(?!\d)/gi
const DATE_NUMERIC = /(?<![\d/.:-])(\d{1,2})\s?([/.-])\s?(\d{1,2})\s?\2\s?(\d{4}|\d{2})(?![\d/-]|\.\d)/g
const DATE_ISO = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g
const TIME = /(?<![\d.,:])([01]?\d|2[0-3])\s?:\s?([0-5]\d)(?:\s?:\s?[0-5]\d)?(?!\d)\s*(am|pm|น\.?)?|(?<![\d.,])([01]?\d|2[0-3])\.([0-5]\d)\s*น/i

const TX_DATE_LABEL =
  /วันที่ทำรายการ|วันที่โอน|วันเวลา|วันและเวลา|วันที่และเวลา|วันที่ชำระ|ทำรายการ|transaction\s*date|transfer\s*date|payment\s*date|date\s*(?:&|and|\/)?\s*time/i
const GENERIC_DATE_LABEL = /วันที่|\bdate\b/i
const OTHER_DATE_LABEL =
  /พิมพ์|printed?|ครบกำหนด|\bdue\b|หมดอายุ|expir|valid|วันเกิด|birth|ออกให้|issued|รอบบัญชี|statement|อัปเดต|update|มีผล|effective|นัด/i

type YearStyle = 'thai' | 'english' | 'numeric'

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function yearsBefore(today: string, years: number): string {
  return `${Number(today.slice(0, 4)) - years}${today.slice(4)}`
}

/**
 * ปี พ.ศ. หรือ ค.ศ. — สี่หลักตั้งแต่ 2400 เป็น พ.ศ.
 * สองหลัก: เดือนภาษาไทยใช้ พ.ศ. เดือนภาษาอังกฤษใช้ ค.ศ. ตัวเลขล้วนเลือกแบบที่ไม่อยู่ในอนาคตและไม่เก่าเกิน 10 ปี
 */
function resolveDate(
  yearText: string,
  month: number,
  day: number,
  style: YearStyle,
  today: string,
): { date: string; ambiguous: boolean } | null {
  const raw = Number(yearText)
  if (yearText.length === 4) {
    const year = raw >= 2400 ? raw - 543 : raw
    const date = validDate(year, month, day)
    return date ? { date, ambiguous: false } : null
  }
  const buddhist = validDate(raw + 2500 - 543, month, day)
  const gregorian = validDate(raw + 2000, month, day)
  const preferred = style === 'english' ? gregorian : buddhist
  const plausible = [buddhist, gregorian].filter((d): d is string => !!d && d <= today && d >= yearsBefore(today, 10))
  if (plausible.length === 1) return { date: plausible[0]!, ambiguous: style !== 'numeric' && plausible[0] !== preferred }
  return preferred ? { date: preferred, ambiguous: true } : null
}

function parseTime(text: string): string | null {
  const m = text.match(TIME)
  if (!m) return null
  let hour = Number(m[1] ?? m[4])
  const minute = m[2] ?? m[5]
  const suffix = (m[3] ?? '').toLowerCase()
  if (suffix === 'pm' && hour < 12) hour += 12
  if (suffix === 'am' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${minute}`
}

interface DateCandidate {
  date: string
  ambiguous: boolean
  index: number
  score: number
  time: string | null
  timeSameLine: boolean
}

function dateCandidates(lines: Line[], today: string): { found: DateCandidate[]; future: string[] } {
  const found: DateCandidate[] = []
  const future: string[] = []
  lines.forEach((line, index) => {
    const tokens: { date: string; ambiguous: boolean; end: number }[] = []
    const push = (resolved: ReturnType<typeof resolveDate>, end: number) => {
      if (!resolved) return
      if (resolved.date > today) future.push(resolved.date)
      else tokens.push({ ...resolved, end })
    }
    for (const m of line.text.matchAll(DATE_WORD)) {
      const key = m[2]!.toLowerCase().replace(/[.\s]/g, '')
      const month = MONTH_KEYS[key]
      if (month) push(resolveDate(m[3]!, month, Number(m[1]), /[ก-๙]/.test(key) ? 'thai' : 'english', today), m.index! + m[0].length)
    }
    for (const m of line.text.matchAll(DATE_NUMERIC)) {
      push(resolveDate(m[4]!, Number(m[3]), Number(m[1]), 'numeric', today), m.index! + m[0].length)
    }
    for (const m of line.text.matchAll(DATE_ISO)) {
      const date = validDate(Number(m[1]), Number(m[2]), Number(m[3]))
      if (date) push({ date, ambiguous: false }, m.index! + m[0].length)
    }
    if (!tokens.length) return

    // ป้ายอาจอยู่บรรทัดเดียวกันหรือบรรทัดก่อนหน้า (ถ้าบรรทัดนั้นไม่มีวันที่ของตัวเอง)
    const prev = lines[index - 1]?.text ?? ''
    const context = `${line.text} ${dateCandidatesFree(prev) ? prev : ''}`
    let score = 0
    if (TX_DATE_LABEL.test(context)) score += 3
    else if (GENERIC_DATE_LABEL.test(context)) score += 1
    if (OTHER_DATE_LABEL.test(context)) score -= 5

    for (const token of tokens) {
      const sameLine = parseTime(line.text.slice(token.end))
      const nearby = sameLine ?? parseTime(lines[index + 1]?.text ?? '') ?? null
      found.push({
        date: token.date,
        ambiguous: token.ambiguous,
        index,
        // เวลาแนบอยู่กับวันที่เป็นลักษณะของเวลาทำรายการ
        score: score + (nearby ? 2 : 0),
        time: nearby,
        timeSameLine: !!sameLine,
      })
    }
  })
  return { found, future }
}

/** บรรทัดที่ไม่มีวันที่ — ใช้เป็นบรรทัดป้ายของวันที่บรรทัดถัดไปได้ */
function dateCandidatesFree(text: string): boolean {
  return !new RegExp(DATE_WORD.source, 'i').test(text) && !new RegExp(DATE_NUMERIC.source).test(text)
}

function findDateTime(lines: Line[], today: string): { date: SlipField<string>; time: SlipField<string> } {
  const { found, future } = dateCandidates(lines, today)
  if (!found.length) {
    const issue = future.length ? 'วันที่บนสลิปอยู่หลังวันนี้ — อาจอ่านผิด กรอกวันที่เอง' : 'ไม่พบวันที่ทำรายการบนสลิป กรอกวันที่เอง'
    return { date: field<string>(null, 0, null, issue), time: field<string>(null, 0, null) }
  }
  const ranked = [...found].sort((a, b) => b.score - a.score || a.index - b.index)
  const best = ranked[0]!
  const rivals = ranked.filter((c) => c.score === best.score && c.date !== best.date)
  const line = lines[best.index]!

  let confidence = 0.92
  let issue: string | null = null
  if (rivals.length) {
    confidence = 0.5
    issue = 'พบหลายวันที่บนสลิปและแยกไม่ได้ว่าวันไหนคือวันทำรายการ'
  } else if (best.score < 0) {
    confidence = 0.3
    issue = 'วันที่ที่พบมีป้ายว่าไม่ใช่วันทำรายการ'
  } else if (best.ambiguous) {
    confidence = 0.5
    issue = 'ปีบนสลิปเป็นเลขสองหลัก ไม่แน่ใจว่าเป็น พ.ศ. หรือ ค.ศ.'
  } else if (best.date < yearsBefore(today, 3)) {
    confidence = 0.6
    issue = 'วันที่เก่ากว่า 3 ปี ตรวจปีอีกครั้ง'
  }
  confidence *= ocrFactor(line.conf)
  return {
    date: field(best.date, confidence, line.text, issue),
    time: best.time
      ? field(best.time, confidence * (best.timeSameLine ? 1 : 0.9), line.text)
      : field<string>(null, 0, null),
  }
}

/* ---------- ผู้โอนและผู้รับ ---------- */

function isLabelLine(text: string): boolean {
  return (
    SENDER_LABEL.test(text) ||
    RECIPIENT_LABEL.test(text) ||
    AMOUNT_LABEL.test(text) ||
    REFERENCE_LABEL.test(text) ||
    FEE_LABEL.test(text) ||
    MEMO_LABEL.test(text)
  )
}

function isNameLike(text: string): boolean {
  const letters = (text.match(/[ก-๙a-z]/gi) ?? []).length
  const digits = (text.match(/\d/g) ?? []).length
  if (letters < 2 || digits > letters / 2) return false
  if (isLabelLine(text) || STATUS_TEXT.test(text) || isBankLine(text) || isAccountLine(text)) return false
  if (moneyIn(text, true).length || TIME.test(text) || !dateCandidatesFree(text)) return false
  return true
}

function cleanName(raw: string): string {
  return raw
    .split(' ')
    .filter((token) => !/[x*•]{2,}/i.test(token) && !/^[\d-]{6,}$/.test(token)) // เลขบัญชี เลขโทรศัพท์
    .join(' ')
    .replace(/^[\s|•·>→↓-]+|[\s|•·>→↓-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 120)
}

function hasNameMarker(text: string): boolean {
  return PERSON_TITLE.test(text) || COMPANY_MARK.test(text)
}

/** ชื่อบริษัทยาวที่ OCR ตัดขึ้นบรรทัดใหม่ */
function continues(current: string, next: string): boolean {
  if (CONTINUATION_START.test(next)) return true
  return COMPANY_START.test(current) && !COMPANY_END.test(current) && COMPANY_END.test(next)
}

interface Party {
  name: string
  source: string
  conf: number
  bank: string | null
  /** มีธนาคารหรือเลขบัญชีตามหลังชื่อ — ลักษณะของบล็อกคู่โอน */
  structured: boolean
  end: number
}

/** อ่านชื่อจากบรรทัดที่ start (รวมบรรทัดต่อของชื่อยาว) แล้วดูธนาคารในบล็อกเดียวกัน */
function readParty(block: Line[], start: number): Party {
  const parts = [block[start]!]
  let i = start + 1
  while (i < block.length && parts.length < 3 && isNameLike(block[i]!.text) && continues(parts[parts.length - 1]!.text, block[i]!.text)) {
    parts.push(block[i]!)
    i++
  }
  let bank: string | null = null
  let structured = false
  for (let j = i; j < Math.min(block.length, i + 3); j++) {
    const text = block[j]!.text
    if (isNameLike(text) && hasNameMarker(text)) break
    bank ??= bankOf(text)
    if (isBankLine(text) || isAccountLine(text)) structured = true
  }
  // ธนาคารอาจอยู่บรรทัดเดียวกับชื่อ เช่น "นาย ก ข ธ.กสิกรไทย"
  bank ??= bankOf(parts.map((p) => p.text).join(' '))
  return {
    name: cleanName(parts.map((p) => p.text).join(' ')),
    source: parts.map((p) => p.text).join(' / '),
    conf: Math.min(...parts.map((p) => p.conf)),
    bank,
    structured,
    end: i,
  }
}

/** บล็อกหลังป้าย: เศษข้อความหลังป้าย + บรรทัดถัดไปจนเจอป้ายอื่น */
function labelledParty(lines: Line[], index: number, label: RegExp): Party | null {
  const rest = lines[index]!.text.replace(label, '')
  const block: Line[] = rest ? [{ text: rest, conf: lines[index]!.conf }] : []
  for (let i = index + 1; i < lines.length && block.length < 6; i++) {
    const text = lines[i]!.text
    if (isLabelLine(text) || STATUS_TEXT.test(text) || !dateCandidatesFree(text)) break
    block.push(lines[i]!)
  }
  const start = block.findIndex((l) => isNameLike(l.text))
  return start < 0 ? null : readParty(block, start)
}

/** ชื่อที่ไม่มีป้าย: ต้องมีคำนำหน้า/คำบอกนิติบุคคล หรือมีธนาคาร/เลขบัญชีตามหลัง */
function unlabelledParties(lines: Line[], from: number, to: number): Party[] {
  const parties: Party[] = []
  for (let i = from; i < to; i++) {
    if (!isNameLike(lines[i]!.text)) continue
    const party = readParty(lines.slice(0, to), i)
    if (hasNameMarker(party.name) || party.structured) {
      parties.push(party)
      i = party.end - 1
    }
  }
  return parties
}

function partyField(party: Party | null, base: number, issue: string | null = null): SlipField<string> {
  if (!party || !party.name) return field<string>(null, 0, null, issue)
  return field(party.name, base * ocrFactor(party.conf), party.source, issue)
}

function findParties(lines: Line[]) {
  const senderAt = lines.findIndex((l) => SENDER_LABEL.test(l.text))
  const recipientAt = lines.findIndex((l) => RECIPIENT_LABEL.test(l.text))
  let sender: SlipField<string>
  let recipient: SlipField<string>
  let senderParty: Party | null = null
  let recipientParty: Party | null = null
  const unassigned: string[] = []

  if (senderAt >= 0) senderParty = labelledParty(lines, senderAt, SENDER_LABEL)
  if (recipientAt >= 0) recipientParty = labelledParty(lines, recipientAt, RECIPIENT_LABEL)

  if (senderAt >= 0 || recipientAt >= 0) {
    sender = partyField(senderParty, 0.92, senderAt >= 0 && !senderParty ? 'พบป้ายผู้โอนแต่อ่านชื่อไม่ได้' : null)
    recipient = partyField(recipientParty, 0.92, recipientAt >= 0 && !recipientParty ? 'พบป้ายผู้รับแต่อ่านชื่อไม่ได้' : null)
    // มีป้ายฝั่งเดียว: อีกฝั่งดูจากตำแหน่ง (ผู้โอนอยู่ก่อนป้ายผู้รับ ผู้รับอยู่หลังบล็อกผู้โอน)
    if (senderAt < 0 && recipientAt >= 0) {
      const before = unlabelledParties(lines, 0, recipientAt)
      if (before.length === 1) sender = partyField(before[0]!, 0.78)
    }
    if (recipientAt < 0 && senderAt >= 0) {
      const after = unlabelledParties(lines, senderAt + 1, lines.length).filter((p) => p.name !== senderParty?.name)
      recipientParty = after[0] ?? null
      recipient = recipientParty
        ? partyField(recipientParty, 0.78, after.length > 1 ? 'พบชื่อหลังผู้โอนมากกว่าหนึ่งชื่อ' : null)
        : field<string>(null, 0, null, 'ไม่พบชื่อผู้รับบนสลิป')
    }
  } else {
    // ไม่มีป้ายเลย: สลิปทุกธนาคารเรียงบล็อกผู้โอนไว้บนบล็อกผู้รับ
    const parties = unlabelledParties(lines, 0, lines.length)
    if (parties.length >= 2) {
      const base = parties[0]!.structured && parties[1]!.structured ? 0.85 : 0.65
      const extra = parties.length > 2 ? 'พบชื่อมากกว่าสองชื่อ ตรวจว่าผู้รับถูกคน' : null
      senderParty = parties[0]!
      recipientParty = parties[1]!
      sender = partyField(senderParty, base)
      recipient = partyField(recipientParty, extra ? Math.min(base, 0.6) : base, extra)
      unassigned.push(...parties.slice(2).map((p) => p.name))
    } else {
      // ชื่อเดียวบอกไม่ได้ว่าเป็นฝั่งไหน — ไม่เดา
      unassigned.push(...parties.map((p) => p.name))
      sender = field<string>(null, 0, null)
      recipient = field<string>(
        null,
        0,
        null,
        parties.length ? 'พบชื่อเดียวบนสลิป ระบุไม่ได้ว่าเป็นผู้โอนหรือผู้รับ' : 'ไม่พบชื่อผู้รับบนสลิป',
      )
    }
  }
  if (!recipient.value && !recipient.issue) recipient = { ...recipient, issue: 'ไม่พบชื่อผู้รับบนสลิป' }

  const recipientName = recipient.value
  const recipientType: RecipientType | null = !recipientName
    ? null
    : COMPANY_MARK.test(recipientName)
      ? 'company'
      : PERSON_TITLE.test(recipientName)
        ? 'person'
        : null
  const recipientBank = recipientName && recipientParty?.name === recipientName ? recipientParty.bank : null
  return { sender, recipient, recipientType, recipientBank, unassigned }
}

/* ---------- เลขอ้างอิง ---------- */

/** รูปแบบเลขอ้างอิงที่ยอมรับ: ตัวอักษร/ตัวเลข/ขีด 6–40 ตัว มีตัวเลขอย่างน้อย 4 ตัว และไม่ใช่เลขบัญชี วันที่ หรือเบอร์โทร */
export function isValidReference(value: string): boolean {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value)) return false
  if (value.length < 6 || value.length > 40) return false
  if ((value.match(/\d/g) ?? []).length < 4) return false
  if (/[x]{2,}/i.test(value) && /\d/.test(value) && /-/.test(value)) return false // xxx-x-x1234-x
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(value)) return false
  if (/^0\d{1,2}-\d{3}-\d{4}$/.test(value)) return false
  return true
}

/**
 * ค่าหลังป้าย: กลุ่มตัวอักษร/ตัวเลขที่คั่นด้วยช่องว่างจะรวมกันเฉพาะเมื่อทั้งสองกลุ่มมีตัวเลข
 * ("0152 8114 3250" → "015281143250") แต่คำต่อท้ายอย่าง "Copy" ไม่ถูกรวม
 */
function referenceValue(text: string): string | null {
  const tokens = text.split(' ').filter(Boolean)
  const first = tokens[0]
  if (!first || !/^[A-Za-z0-9-]+$/.test(first)) return null
  let value = first
  for (const token of tokens.slice(1)) {
    if (!/^[A-Za-z0-9-]+$/.test(token) || !/\d/.test(token) || !/\d/.test(value) || token.length < 2) break
    value += token
  }
  return isValidReference(value) ? value : null
}

function findReference(lines: Line[]): SlipField<string> {
  const hits: { value: string; line: Line }[] = []
  let unreadable: Line | null = null
  lines.forEach((line, i) => {
    const m = line.text.match(REFERENCE_LABEL)
    if (!m) return
    const rest = line.text.slice(m.index! + m[0].length)
    if (BILLER_REF_SUFFIX.test(rest)) return
    const value = rest ? referenceValue(rest) : lines[i + 1] ? referenceValue(lines[i + 1]!.text) : null
    if (value) hits.push({ value, line: rest ? line : lines[i + 1]! })
    else unreadable ??= line
  })
  if (!hits.length) {
    return field<string>(
      null,
      0,
      unreadable ? (unreadable as Line).text : null,
      unreadable ? 'พบป้ายเลขอ้างอิงแต่อ่านเลขไม่ชัด' : 'ไม่พบเลขอ้างอิงบนสลิป',
    )
  }
  const distinct = new Set(hits.map((h) => h.value))
  const first = hits[0]!
  return distinct.size === 1
    ? field(first.value, 0.92 * ocrFactor(first.line.conf), first.line.text)
    : field(first.value, 0.5, first.line.text, 'พบเลขอ้างอิงมากกว่าหนึ่งค่า')
}

/* ---------- เทียบชื่อกับเจ้าของบัญชี ---------- */

function nameParts(name: string): string[] {
  return name
    .toLowerCase()
    .replace(PERSON_TITLE, '')
    .replace(/[^ก-๙a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * สลิปมักปิดนามสกุลบางส่วน เช่น "นาย สมชาย ใ" หรือ "MR. SOMCHAI J"
 * จึงถือว่าตรงเมื่อชื่อต้นตรงกันทั้งคำ และนามสกุลบนสลิป (ถ้ามี) เป็นส่วนต้นของนามสกุลจริง
 */
export function nameMatches(slipName: string, ownerName: string): boolean {
  const slip = nameParts(slipName)
  const owner = nameParts(ownerName)
  if (!slip.length || !owner.length || slip[0] !== owner[0]) return false
  if (slip.length < 2 || owner.length < 2) return true
  return owner[owner.length - 1]!.startsWith(slip[slip.length - 1]!)
}

function decideDirection(
  sender: SlipField<string>,
  recipient: SlipField<string>,
  ownerNames: string[],
): { direction: EntryType | null; reason: string } {
  const owners = ownerNames.filter((n) => n.trim())
  if (!owners.length) return { direction: null, reason: 'ยังไม่ได้ตั้งชื่อในโปรไฟล์ จึงเทียบไม่ได้ว่าเงินเข้าหรือออก' }
  if (!sender.value && !recipient.value) return { direction: null, reason: 'อ่านชื่อผู้โอนและผู้รับไม่ได้' }
  const isSender = !!sender.value && owners.some((o) => nameMatches(sender.value!, o))
  const isRecipient = !!recipient.value && owners.some((o) => nameMatches(recipient.value!, o))
  if (isSender && isRecipient) return { direction: null, reason: 'ผู้โอนและผู้รับเป็นชื่อคุณทั้งคู่ — น่าจะโอนระหว่างบัญชีตัวเอง' }
  const matched = isSender ? sender : isRecipient ? recipient : null
  if (matched && matched.confidence < REVIEW_THRESHOLD) {
    return { direction: null, reason: 'ชื่อที่ตรงกับคุณอ่านได้ไม่ชัด ตรวจก่อนว่าเงินเข้าหรือออก' }
  }
  if (isSender) return { direction: 'expense', reason: 'ชื่อผู้โอนตรงกับชื่อคุณ' }
  if (isRecipient) return { direction: 'income', reason: 'ชื่อผู้รับตรงกับชื่อคุณ' }
  if (!sender.value || !recipient.value) return { direction: null, reason: 'อ่านชื่อได้ฝั่งเดียวและไม่ตรงกับชื่อคุณ' }
  return { direction: null, reason: 'ชื่อผู้โอนและผู้รับไม่ตรงกับชื่อในโปรไฟล์' }
}

/* ---------- รวมทุกขั้น ---------- */

/**
 * @param input ข้อความ OCR ทั้งก้อน หรือรายบรรทัดพร้อมความมั่นใจ
 * @param ownerNames ชื่อเจ้าของบัญชี ใช้ตัดสินว่าเงินเข้าหรือออก
 * @param today วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้กันวันที่ในอนาคตเท่านั้น ไม่ใช้แทนวันที่ที่หาไม่เจอ
 */
export function parseSlip(input: string | OcrLine[], ownerNames: string[], today: string): SlipExtraction {
  const lines = toLines(input)
  const amount = findAmount(lines)
  const { date, time } = findDateTime(lines, today)
  const { sender, recipient, recipientType, recipientBank, unassigned } = findParties(lines)
  const reference = findReference(lines)
  const { direction, reason } = decideDirection(sender, recipient, ownerNames)
  const banks = [...new Set(lines.map((l) => bankOf(l.text)).filter((b): b is string => !!b))]

  const fields: Record<SlipFieldKey, SlipField<unknown>> = { amount, date, time, sender, recipient, reference }
  // ช่องหลักต้องตรวจเมื่อหาไม่เจอหรือไม่มั่นใจ ช่องรองต้องตรวจเฉพาะเมื่ออ่านได้แต่ไม่มั่นใจ
  const required: SlipFieldKey[] = ['amount', 'date', 'recipient', 'reference']
  const review = (Object.keys(fields) as SlipFieldKey[]).filter((key) => {
    const f = fields[key]!
    if (f.value === null) return required.includes(key)
    return f.confidence < REVIEW_THRESHOLD
  })

  return {
    amount,
    date,
    time,
    sender,
    recipient,
    recipientType,
    recipientBank,
    banks,
    reference,
    unassignedNames: unassigned,
    direction,
    directionReason: reason,
    review,
  }
}

/* ---------- ตรวจข้อมูลก่อนบันทึก ---------- */

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = normaliseLine(value).slice(0, max)
  return text || null
}

/**
 * ตรวจและทำความสะอาดข้อมูลสลิปก่อนเก็บลงฐานข้อมูล — ค่าที่รูปแบบผิดกลายเป็น null
 * คืน undefined ถ้าไม่ใช่ object
 */
export function sanitizeSlipMeta(raw: unknown): SlipMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const reference = cleanText(r.reference, 40)
  const time = typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null
  return {
    time,
    sender: cleanText(r.sender, 120),
    recipient: cleanText(r.recipient, 120),
    recipientType: r.recipientType === 'person' || r.recipientType === 'company' ? r.recipientType : null,
    recipientBank: cleanText(r.recipientBank, 60),
    banks: Array.isArray(r.banks) ? r.banks.map((b) => cleanText(b, 60)).filter((b): b is string => !!b).slice(0, 10) : [],
    reference: reference && isValidReference(reference) ? reference : null,
    imageHash: typeof r.imageHash === 'string' && /^[0-9a-f]{64}$/.test(r.imageHash) ? r.imageHash : null,
  }
}

/* ---------- สลิปซ้ำ ---------- */

export interface SlipCandidate {
  date: string
  amount: number
  meta: SlipMeta
}

export interface DuplicateMatch<E extends LedgerEntry = LedgerEntry> {
  entry: E
  /** reference/image = แน่ใจว่าซ้ำ, details = ข้อมูลตรงกันหลายช่อง อาจซ้ำ */
  reason: 'reference' | 'image' | 'details'
}

function compactRef(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return nameParts(a).join(' ') === nameParts(b).join(' ')
}

/**
 * หารายการเดิมที่น่าจะเป็นสลิปใบเดียวกัน
 *  1. เลขอ้างอิงตรงกัน (รวมรายการเก่าที่เลขอ้างอิงอยู่ในรายละเอียด)
 *  2. รูปไฟล์เดียวกัน
 *  3. ไม่มีเลขอ้างอิงให้เทียบ: วันที่ + ยอด + ชื่อคู่โอน (+ เวลา ถ้ามีทั้งคู่) ตรงกัน
 * ไม่ถือว่าซ้ำจากยอดหรือชื่ออย่างเดียว
 */
export function findSlipDuplicates<E extends LedgerEntry>(candidate: SlipCandidate, entries: E[]): DuplicateMatch<E>[] {
  const ref = candidate.meta.reference ? compactRef(candidate.meta.reference) : null
  const matches: DuplicateMatch<E>[] = []
  for (const entry of entries) {
    const meta = entry.slip
    if (ref && meta?.reference && compactRef(meta.reference) === ref) {
      matches.push({ entry, reason: 'reference' })
      continue
    }
    if (ref && ref.length >= 8 && !meta?.reference && compactRef(entry.note ?? '').includes(ref)) {
      matches.push({ entry, reason: 'reference' })
      continue
    }
    if (candidate.meta.imageHash && meta?.imageHash === candidate.meta.imageHash) {
      matches.push({ entry, reason: 'image' })
      continue
    }
    if (!meta || entry.date !== candidate.date || entry.amount !== candidate.amount) continue
    if (ref && meta.reference) continue // มีเลขอ้างอิงทั้งคู่แต่ไม่ตรงกัน = คนละรายการ
    if (candidate.meta.time && meta.time && candidate.meta.time !== meta.time) continue
    if (sameName(candidate.meta.sender, meta.sender) || sameName(candidate.meta.recipient, meta.recipient)) {
      matches.push({ entry, reason: 'details' })
    }
  }
  return matches
}

/* ---------- อื่น ๆ ---------- */

/** วันนี้ตามเวลาไทย — สลิปพิมพ์วันเวลาไทยเสมอ ไม่ว่าเครื่องผู้ใช้ตั้งโซนเวลาไหน */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** ข้อความรายละเอียดของรายการ — ใส่เฉพาะสิ่งที่อ่านได้จริง */
export function slipNote(
  meta: Pick<SlipMeta, 'sender' | 'recipient' | 'time' | 'reference'>,
  type: EntryType,
): string {
  const party = type === 'income' ? meta.sender : meta.recipient
  return [
    party ? `${type === 'income' ? 'รับโอนจาก' : 'โอนให้'} ${party}` : '',
    meta.time ? `${meta.time} น.` : '',
    meta.reference ? `อ้างอิง ${meta.reference}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
