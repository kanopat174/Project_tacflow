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
import { parseSlipQr } from './slipQr'

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
  /** เลขบัญชีส่วนที่มองเห็นบนสลิป เช่น "1234" จาก xxx-x-x1234-x */
  senderAccount: string | null
  recipientAccount: string | null
  /** null = ตัดสินไม่ได้ (เช่นโอนระหว่างบัญชีตัวเอง) ผู้ใช้ต้องเลือกเอง */
  direction: EntryType | null
  directionReason: string
  /** ทิศทางมาจากการเดา ไม่ใช่จากชื่อหรือบัญชีของผู้ใช้ — แสดงให้ผู้ใช้เปลี่ยนได้ */
  directionGuessed: boolean
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

/**
 * OCR มักอ่านเลข 0 เป็นตัว O และเลข 1 เป็น l/I/| ในกลุ่มที่เป็นตัวเลข ("2O26" "1l:30")
 * แก้เฉพาะกลุ่มที่มีเลขอย่างน้อยสองตัวและไม่มีตัวอักษรอื่น — ชื่อและเลขอ้างอิงที่มีตัวอักษรไม่ถูกแตะ
 */
function fixDigitTokens(text: string): string {
  return text
    .split(' ')
    .map((token) =>
      (token.match(/\d/g) ?? []).length >= 2 && /^[\dOoIl|.,:/-]+$/.test(token)
        ? token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1')
        : token,
    )
    .join(' ')
}

function normaliseLine(raw: string): string {
  return fixDigitTokens(
    raw
      .replace(INVISIBLE, '')
      .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
      .replace(/ํา/g, 'ำ') // "ํา" ที่ OCR แยกเป็นสองตัว → "ำ"
      .replace(/[：﹕]/g, ':')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 300)
}

function toLines(input: string | OcrLine[]): Line[] {
  const raw: Line[] =
    typeof input === 'string'
      ? input.split(/\r?\n/).map((text) => ({ text, conf: 1 }))
      : input.map((l) => ({ text: l.text, conf: Math.max(0, Math.min(100, Number(l.confidence) || 0)) / 100 }))
  return raw.map((l) => ({ text: normaliseLine(l.text), conf: l.conf })).filter((l) => l.text).slice(0, 200)
}

/* ---------- ป้ายข้อความ ---------- */

/** วรรณยุกต์และการันต์ที่ OCR ตกหล่นบ่อย ("เลขทีรายการ") และสระที่อ่านสลับกัน */
const THAI_LOOSE: Record<string, string> = {
  '่': '่?',
  '้': '้?',
  '๊': '๊?',
  '๋': '๋?',
  '์': '์?',
  'ิ': '[ิี]',
  'ี': '[ีิ]',
  'ำ': '(?:ำ|ํา|า)',
}

/**
 * สร้าง regex ที่ทนช่องว่างที่ OCR แทรกระหว่างตัวอักษร จุดที่หายไป และวรรณยุกต์ที่ตกหล่น
 * เช่น "เลขที่รายการ" จับ "เลขที่ รายการ" และ "เลขทีรายการ" ได้ "ref. no." จับ "Ref No" ได้
 */
function loose(phrases: string[]): string {
  return [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) =>
      [...p]
        .map((c) =>
          c === ' ' ? '\\s*' : c === '.' ? '\\.?' : (THAI_LOOSE[c] ?? c.replace(/[\\^$*+?()[\]{}|/-]/g, '\\$&')),
        )
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
    'เลขที่ทำรายการ',
    'เลขที่อ้างอิงรายการ',
    'รหัสการทำรายการ',
    'รหัสธุรกรรม',
    'หมายเลขธุรกรรม',
    'เลขธุรกรรม',
    'รหัสอ้างอิง',
    'เลขที่อ้างอิง',
    'หมายเลขอ้างอิง',
    'เลขอ้างอิง',
    'รหัสรายการ',
    'หมายเลขรายการ',
    'เลขที่ธุรกรรม',
    'transaction id',
    'transaction ref. no.',
    'transaction no.',
    'trans. ref.',
    'txn ref.',
    'ref. code',
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
  // LINE BK ให้บริการโดยกสิกรไทย แต่สลิปแสดงชื่อ LINE BK — ต้องตรวจก่อนกสิกร
  [/line\s*bk|ไลน์\s*บีเค/i, 'LINE BK'],
  [/กสิกร|k\s?plus|kbank|kasikorn|make\s?by/i, 'กสิกรไทย'],
  [/ไทยพาณิชย์|\bscb\b|siam\s*commercial/i, 'ไทยพาณิชย์'],
  [/ธนาคารกรุงเทพ|ธ\.\s?กรุงเทพ|\bbbl\b|bangkok\s*bank|bualuang/i, 'กรุงเทพ'],
  [/เป๋าตัง|paotang/i, 'เป๋าตัง (กรุงไทย)'],
  [/กรุงไทย|\bktb\b|krungthai|krung\s*thai/i, 'กรุงไทย'],
  [/กรุงศรี|\bbay\b|krungsri|\bkma\b/i, 'กรุงศรีอยุธยา'],
  [/ทหารไทยธนชาต|\bttb\b|tmbthanachart/i, 'ทีทีบี'],
  [/ออมสิน|\bgsb\b|mymo/i, 'ออมสิน'],
  // ต้องมีจุดครบ ไม่งั้นไปชน "ธ.กสิกรไทย"
  [/ธ\.ก\.ส\.|\bbaac\b|a-?mobile/i, 'ธ.ก.ส.'],
  [/ยูโอบี|\buob\b|\btmrw\b/i, 'ยูโอบี'],
  [/ซีไอเอ็มบี|\bcimb\b/i, 'ซีไอเอ็มบี ไทย'],
  [/เกียรตินาคิน|\bkkp\b|kiatnakin/i, 'เกียรตินาคินภัทร'],
  [/แลนด์\s*แอนด์\s*เฮ้าส์|\blh\s*bank\b/i, 'แลนด์ แอนด์ เฮ้าส์'],
  [/ทิสโก้|\btisco\b/i, 'ทิสโก้'],
  [/อาคารสงเคราะห์|\bghb\b/i, 'อาคารสงเคราะห์'],
  [/ไทยเครดิต|thai\s*credit/i, 'ไทยเครดิต'],
  [/ไอซีบีซี|\bicbc\b/i, 'ไอซีบีซี (ไทย)'],
  [/ธนาคารอิสลาม|\bibank\b|islamic\s*bank/i, 'อิสลามแห่งประเทศไทย'],
  [/สแตนดาร์ด\s*ชาร์เตอร์ด|standard\s*chartered/i, 'สแตนดาร์ดชาร์เตอร์ด'],
  [/แห่งประเทศจีน|bank\s*of\s*china/i, 'แห่งประเทศจีน'],
  [/ทรูมันนี่|true\s*money/i, 'TrueMoney'],
  [/ช้อปปี้\s*เพย์|shopee\s*pay/i, 'ShopeePay'],
  [/\bdime\b/i, 'Dime'],
  [/พร้อมเพย์|promptpay|prompt\s*pay/i, 'พร้อมเพย์'],
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

/** ปีสองหลักที่ OCR อ่านติดกับเวลา ("ต.ค.6914:32") ลองก่อนปีสี่หลัก */
const DATE_WORD =
  /(?<!\d)(\d{1,2})\s*([ก-๙a-z][ก-๙a-z.\s]{0,14}?)\s*\.?\s*,?\s*(\d{2}(?=\d{1,2}\s?[:.]\s?\d{2})|\d{4}|\d{2}(?!\s?[:.]\s?\d{2}))(?!\d{3})/gi
/** แบบอังกฤษเดือนขึ้นก่อน: "Oct 9, 2026" */
const DATE_US = /(?<![a-z])([a-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/gi
/** สลิปบางแอปไม่พิมพ์ปี: "9 ต.ค. 14:32" — ใช้เฉพาะเมื่อไม่พบวันที่แบบอื่น */
const DATE_NO_YEAR = /(?<!\d)(\d{1,2})\s*([ก-๙][ก-๙.]{1,12}|[a-z]{3,9})\.?(?=\s*[,-]?\s*(?:\d{1,2}\s?[:.]\s?\d{2}|$))/gi

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = temp
    }
  }
  return row[b.length]!
}

/**
 * ชื่อเดือนที่ OCR อ่านเพี้ยนไปหนึ่งตัว ("ศ.ค." แทน "ต.ค.") — รับเฉพาะเมื่อใกล้เดือนเดียวชัดเจน
 * ถ้าใกล้หลายเดือนเท่ากัน ("นค" ใกล้ทั้ง มค กค สค) ไม่เดา
 */
function monthOf(key: string): number | null {
  const exact = MONTH_KEYS[key]
  if (exact) return exact
  if (key.length < 2) return null
  const limit = key.length <= 4 ? 1 : 2
  let best: number | null = null
  let bestDistance = Infinity
  let tie = false
  for (const [name, month] of Object.entries(MONTH_KEYS)) {
    if (/[ก-๙]/.test(name) !== /[ก-๙]/.test(key)) continue
    const d = editDistance(key, name)
    if (d > limit) continue
    if (d < bestDistance) {
      best = month
      bestDistance = d
      tie = false
    } else if (d === bestDistance && month !== best) tie = true
  }
  return tie ? null : best
}
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
    // ปีที่เป็นไปไม่ได้ (OCR อ่านเลขอื่นมาเป็นปี) ไม่ใช่วันที่
    if (year < 2000 || year > Number(today.slice(0, 4)) + 1) return null
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
      const month = monthOf(key)
      if (month) push(resolveDate(m[3]!, month, Number(m[1]), /[ก-๙]/.test(key) ? 'thai' : 'english', today), m.index! + m[0].length)
    }
    for (const m of line.text.matchAll(DATE_US)) {
      const month = MONTH_KEYS[m[1]!.toLowerCase()]
      if (month) push(resolveDate(m[3]!, month, Number(m[2]), 'english', today), m.index! + m[0].length)
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

/** วันที่ที่ไม่มีปี ("9 ต.ค. 14:32") — ใช้ปีนี้ ถ้าได้วันในอนาคตแปลว่าเป็นปีที่แล้ว */
function dateWithoutYear(lines: Line[], today: string): { date: SlipField<string>; time: SlipField<string> } | null {
  const year = Number(today.slice(0, 4))
  for (const line of lines) {
    if (OTHER_DATE_LABEL.test(line.text)) continue
    for (const m of line.text.matchAll(DATE_NO_YEAR)) {
      const month = MONTH_KEYS[m[2]!.toLowerCase().replace(/[.\s]/g, '')]
      if (!month) continue
      let date = validDate(year, month, Number(m[1]))
      if (date && date > today) date = validDate(year - 1, month, Number(m[1]))
      if (!date) continue
      const time = parseTime(line.text.slice(m.index! + m[0].length))
      const confidence = 0.7 * ocrFactor(line.conf)
      return {
        date: field(date, confidence, line.text, 'สลิปไม่ได้พิมพ์ปี ใช้ปีปัจจุบัน ตรวจอีกครั้ง'),
        time: time ? field(time, confidence, line.text) : field<string>(null, 0, null),
      }
    }
  }
  return null
}

function findDateTime(lines: Line[], today: string): { date: SlipField<string>; time: SlipField<string> } {
  const { found, future } = dateCandidates(lines, today)
  if (!found.length) {
    const noYear = dateWithoutYear(lines, today)
    if (noYear) return noYear
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
  /** เลขบัญชีส่วนที่มองเห็น (เลขชุดท้าย) */
  account: string | null
  /** มีธนาคารหรือเลขบัญชีตามหลังชื่อ — ลักษณะของบล็อกคู่โอน */
  structured: boolean
  end: number
}

/** ตัวเลขที่ไม่ถูกปิดของเลขบัญชี 4 ตัวท้าย: "xxx-x-x1234-x" → "1234" · "xxx-xxx123-4" → "1234" */
export function visibleAccount(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  return digits.length >= 3 ? digits.slice(-4) : null
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
  let account: string | null = null
  let structured = false
  for (let j = i; j < Math.min(block.length, i + 3); j++) {
    const text = block[j]!.text
    if (isNameLike(text) && hasNameMarker(text)) break
    bank ??= bankOf(text)
    if (isAccountLine(text)) account ??= visibleAccount(text)
    if (isBankLine(text) || isAccountLine(text)) structured = true
  }
  // ธนาคารหรือเลขบัญชีอาจอยู่บรรทัดเดียวกับชื่อ เช่น "นาย ก ข ธ.กสิกรไทย" "นาย ก ข xxx-x-x1234-x"
  const nameText = parts.map((p) => p.text).join(' ')
  bank ??= bankOf(nameText)
  if (/[x*•]{2,}/i.test(nameText)) account ??= visibleAccount(nameText)
  return {
    name: cleanName(nameText),
    source: parts.map((p) => p.text).join(' / '),
    conf: Math.min(...parts.map((p) => p.conf)),
    bank,
    account,
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
      if (before.length === 1) {
        senderParty = before[0]!
        sender = partyField(senderParty, 0.78)
      }
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
  const senderAccount = sender.value && senderParty?.name === sender.value ? senderParty.account : null
  const recipientAccount = recipientName && recipientParty?.name === recipientName ? recipientParty.account : null
  return { sender, recipient, recipientType, recipientBank, senderAccount, recipientAccount, unassigned }
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

/**
 * ไม่มีป้ายหรือ OCR อ่านป้ายเพี้ยน: เลขรายการของธนาคารไทยยาว 12–30 ตัว มีตัวเลขอย่างน้อย 10 ตัว
 * อยู่ในบรรทัดที่ไม่ใช่เลขบัญชี ยอดเงิน วันที่ หรือเวลา — รับเฉพาะเมื่อพบค่าเดียว
 */
function unlabelledReference(lines: Line[]): SlipField<string> | null {
  const hits: { value: string; line: Line }[] = []
  for (const line of lines) {
    if (isAccountLine(line.text) || TIME.test(line.text) || !dateCandidatesFree(line.text)) continue
    for (const token of line.text.split(' ')) {
      const value = token.replace(/[^A-Za-z0-9]/g, '')
      if (value.length < 12 || value.length > 30 || (value.match(/\d/g) ?? []).length < 10) continue
      if (/^0\d{9}$/.test(value) || !isValidReference(value)) continue
      hits.push({ value, line })
    }
  }
  const distinct = new Set(hits.map((h) => h.value))
  if (distinct.size !== 1) return null
  const only = hits[0]!
  return field(only.value, 0.7 * ocrFactor(only.line.conf), only.line.text, 'ไม่พบป้ายเลขอ้างอิง ใช้เลขรายการยาวที่พบบนสลิป')
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
    const loose = unlabelledReference(lines)
    if (loose) return loose
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

interface Direction {
  direction: EntryType | null
  reason: string
  guessed: boolean
}

/**
 * เงินเข้าหรือออก ดูตามลำดับ
 *  1. ชื่อผู้โอน/ผู้รับตรงกับชื่อผู้ใช้ (ชื่อในโปรไฟล์ + ชื่อที่ระบบจำได้จากสลิปก่อน ๆ เช่นชื่อภาษาอังกฤษ)
 *  2. เลขบัญชีที่มองเห็นตรงกับบัญชีที่ระบบจำได้ว่าเป็นของผู้ใช้
 *  3. เดา: ผู้รับเป็นบริษัท/ร้านค้า = จ่าย · ผู้โอนเป็นบริษัท = รับ (เช่นเงินเดือน) · นอกนั้นถือเป็นจ่าย
 *     เพราะสลิปที่คนเก็บไว้ส่วนใหญ่คือสลิปที่ตัวเองโอนออก — บอกผู้ใช้ว่าเดา และเปลี่ยนได้
 * ตัดสินไม่ได้จริงเฉพาะเมื่อทั้งสองฝั่งเป็นผู้ใช้เอง (โอนระหว่างบัญชีตัวเอง ไม่ใช่รายรับหรือรายจ่าย)
 */
function decideDirection(
  sender: SlipField<string>,
  recipient: SlipField<string>,
  ownerNames: string[],
  ownAccounts: string[],
  senderAccount: string | null,
  recipientAccount: string | null,
  recipientType: RecipientType | null,
): Direction {
  const owners = ownerNames.filter((n) => n.trim())
  const isSender =
    (!!sender.value && owners.some((o) => nameMatches(sender.value!, o))) || (!!senderAccount && ownAccounts.includes(senderAccount))
  const isRecipient =
    (!!recipient.value && owners.some((o) => nameMatches(recipient.value!, o))) ||
    (!!recipientAccount && ownAccounts.includes(recipientAccount))
  if (isSender && isRecipient) {
    return { direction: null, reason: 'ผู้โอนและผู้รับเป็นคุณทั้งคู่ — น่าจะโอนระหว่างบัญชีตัวเอง', guessed: false }
  }
  if (isSender || isRecipient) {
    const matched = isSender ? sender : recipient
    const unclear = !!matched.value && matched.confidence < REVIEW_THRESHOLD
    return {
      direction: isSender ? 'expense' : 'income',
      reason: `${isSender ? 'ผู้โอน' : 'ผู้รับ'}ตรงกับชื่อหรือบัญชีของคุณ${unclear ? ' (อ่านชื่อไม่ชัด ตรวจอีกครั้ง)' : ''}`,
      guessed: unclear,
    }
  }
  const senderCompany = !!sender.value && COMPANY_MARK.test(sender.value)
  if (recipientType === 'company' && !senderCompany) {
    return { direction: 'expense', reason: 'ผู้รับเป็นบริษัท/ร้านค้า จึงเดาว่าคุณจ่ายเงิน', guessed: true }
  }
  if (senderCompany && recipientType !== 'company') {
    return { direction: 'income', reason: 'ผู้โอนเป็นบริษัท จึงเดาว่าคุณได้รับเงิน', guessed: true }
  }
  return {
    direction: 'expense',
    reason: owners.length
      ? 'ชื่อบนสลิปไม่ตรงกับชื่อคุณ จึงเดาว่าเป็นเงินโอนออก'
      : 'ยังไม่รู้จักชื่อคุณบนสลิป จึงเดาว่าเป็นเงินโอนออก',
    guessed: true,
  }
}

/* ---------- รวมทุกขั้น ---------- */

export interface SlipContext {
  /** ข้อความจาก QR ตรวจสอบสลิป (ถ้าอ่านได้) */
  qr?: string | null
  /** วันที่ของไฟล์รูป (YYYY-MM-DD) — สำรองเมื่อสลิปไม่มีวันที่ที่อ่านได้ */
  fileDate?: string | null
  /** เลขบัญชีชุดท้ายที่ระบบจำได้ว่าเป็นของผู้ใช้ */
  ownAccounts?: string[]
}

/** เลขอ้างอิงที่ขึ้นต้นด้วยวันที่ YYYYMMDD (เช่นของไทยพาณิชย์) ใช้เป็นวันที่สำรองได้ */
function dateFromReference(reference: string | null, today: string): string | null {
  const m = reference?.match(/^(20\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const date = validDate(Number(m[1]), Number(m[2]), Number(m[3]))
  return date && date <= today && date >= yearsBefore(today, 1) ? date : null
}

/**
 * @param input ข้อความ OCR ทั้งก้อน หรือรายบรรทัดพร้อมความมั่นใจ
 * @param ownerNames ชื่อเจ้าของบัญชี (รวมชื่อที่ระบบจำได้) ใช้ตัดสินว่าเงินเข้าหรือออก
 * @param today วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้กันวันที่ในอนาคต
 * @param context ข้อมูลเสริมนอกตัวอักษรบนสลิป: QR วันที่ของไฟล์ และบัญชีของผู้ใช้
 */
export function parseSlip(input: string | OcrLine[], ownerNames: string[], today: string, context: SlipContext = {}): SlipExtraction {
  const lines = toLines(input)
  const amount = findAmount(lines)
  let { date, time } = findDateTime(lines, today)
  const { sender, recipient, recipientType, recipientBank, senderAccount, recipientAccount, unassigned } = findParties(lines)
  let reference = findReference(lines)
  const banks = [...new Set(lines.map((l) => bankOf(l.text)).filter((b): b is string => !!b))]

  // QR ตรวจสอบสลิปแม่นกว่าตัวอักษรที่ OCR อ่าน
  const qr = parseSlipQr(context.qr)
  if (qr) {
    reference = field(qr.reference, 0.99, 'QR บนสลิป')
    if (qr.bank && !banks.includes(qr.bank)) banks.unshift(qr.bank)
  }

  // ไม่มีวันที่ที่อ่านได้: ลองจากเลขอ้างอิง แล้วจากวันที่ของไฟล์รูป (สลิปส่วนใหญ่แคปทันทีหลังโอน)
  if (!date.value) {
    const fromRef = dateFromReference(reference.value, today)
    const fromFile = context.fileDate && context.fileDate <= today ? context.fileDate : null
    if (fromRef) date = field(fromRef, 0.7, `เลขอ้างอิง ${reference.value}`, 'ไม่พบวันที่บนสลิป ใช้วันที่จากเลขอ้างอิง ตรวจอีกครั้ง')
    else if (fromFile) date = field(fromFile, 0.55, 'วันที่ของไฟล์รูป', 'ไม่พบวันที่บนสลิป ใช้วันที่ของไฟล์รูปแทน ตรวจอีกครั้ง')
    if (date.value) time = time.value ? time : field<string>(null, 0, null)
  }

  const { direction, reason, guessed } = decideDirection(
    sender,
    recipient,
    ownerNames,
    context.ownAccounts ?? [],
    senderAccount,
    recipientAccount,
    recipientType,
  )

  const fields: Record<SlipFieldKey, SlipField<unknown>> = { amount, date, time, sender, recipient, reference }
  // ช่องหลักต้องตรวจเมื่อหาไม่เจอหรือไม่มั่นใจ ช่องรองต้องตรวจเฉพาะเมื่ออ่านได้แต่ไม่มั่นใจ
  // เลขอ้างอิงเป็นช่องรอง: บางสลิปไม่มี (วอลเล็ต) และการกันสลิปซ้ำยังใช้รูปและวันที่+ยอด+ชื่อได้
  const required: SlipFieldKey[] = ['amount', 'date', 'recipient']
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
    senderAccount,
    recipientAccount,
    direction,
    directionReason: reason,
    directionGuessed: guessed,
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

/** วันที่ของไฟล์รูปตามเวลาไทย — ใช้สำรองเมื่อสลิปไม่มีวันที่ (สลิปส่วนใหญ่แคปหน้าจอทันทีหลังโอน) */
export function fileDateOf(file: Blob): string | null {
  const modified = (file as File).lastModified
  if (!modified || !Number.isFinite(modified)) return null
  return bangkokToday(new Date(modified))
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
