/**
 * อ่านยอด วันที่ และชื่อร้านจากข้อความ OCR ของใบเสร็จ — ฟังก์ชันบริสุทธิ์
 *
 * ยอดเงิน: ใช้ตัวเลขบนบรรทัดที่มีคำว่า "รวม/ทั้งสิ้น/total" ตัวท้ายสุดของใบ (ยอดสุทธิมักอยู่ล่างสุด)
 *          ถ้าไม่มีเลย ใช้ตัวเลขที่มากที่สุดในใบ (ต้องมีทศนิยม 2 ตำแหน่ง จะได้ไม่หยิบเลขโทรศัพท์)
 * ไม่นับบรรทัดเงินทอน เงินสดที่รับ และ VAT เพราะไม่ใช่ยอดที่จ่ายจริง
 */

import { parseDate } from './ledgerCsv'
import { normaliseText } from './withholdingCertificate'

export interface ReceiptGuess {
  amount: number | null
  date: string | null
  merchant: string
}

const MONEY = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g
const TOTAL_LINE = /ยอดสุทธิ|รวมทั้งสิ้น|ยอดรวม|รวมเงิน|ทั้งสิ้น|grand\s*total|net\s*total|total|amount\s*due|รวม/i
const IGNORE_LINE = /เงินทอน|ทอน|change|เงินสด|cash|รับเงิน|received|vat|ภาษีมูลค่าเพิ่ม|ส่วนลด|discount|ก่อนภาษี|before\s*tax/i
const DATE_TOKEN = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s*[ก-๙a-z.]{2,8}\s*\d{2,4}/gi

function numbers(line: string): number[] {
  return (line.match(MONEY) ?? []).map((m) => Number(m.replace(/,/g, '')))
}

/** ใบเสร็จที่ใช้ลดหย่อนภาษีได้ — หมวดในสมุดที่ควรลง และคำที่ใส่ในรายละเอียดให้ระบบดึงค่าลดหย่อนจับประเภทได้ */
export interface DeductionReceipt {
  kind: 'lifeInsurance' | 'healthInsurance' | 'pensionInsurance' | 'rmf' | 'ssf' | 'thaiEsg' | 'thaiEsgx'
  categoryKey: 'insurance' | 'savingInvest'
  label: string
}

const DEDUCTION_RECEIPTS: { pattern: RegExp; receipt: DeductionReceipt }[] = [
  { pattern: /esg\s*x|esgx/i, receipt: { kind: 'thaiEsgx', categoryKey: 'savingInvest', label: 'Thai ESGX' } },
  { pattern: /thai\s*esg|ไทยเพื่อความยั่งยืน/i, receipt: { kind: 'thaiEsg', categoryKey: 'savingInvest', label: 'Thai ESG' } },
  // รหัสกองทุนมักติดกับชื่อ บลจ. เช่น SCBRMF2, KFSSF จึงไม่บังคับขอบคำ
  { pattern: /rmf|เพื่อการเลี้ยงชีพ/i, receipt: { kind: 'rmf', categoryKey: 'savingInvest', label: 'RMF' } },
  { pattern: /ssf|เพื่อการออม/i, receipt: { kind: 'ssf', categoryKey: 'savingInvest', label: 'SSF' } },
  { pattern: /ประกัน.{0,12}บำนาญ|บำนาญ|annuity|pension/i, receipt: { kind: 'pensionInsurance', categoryKey: 'insurance', label: 'เบี้ยประกันชีวิตแบบบำนาญ' } },
  { pattern: /ประกัน.{0,12}สุขภาพ|health\s*insurance/i, receipt: { kind: 'healthInsurance', categoryKey: 'insurance', label: 'เบี้ยประกันสุขภาพ' } },
  { pattern: /ประกันชีวิต|life\s*insurance|ชีวิต.{0,6}ประกัน/i, receipt: { kind: 'lifeInsurance', categoryKey: 'insurance', label: 'เบี้ยประกันชีวิต' } },
]

/** ใบเสร็จนี้เป็นค่าลดหย่อนประเภทไหน — null คือใบเสร็จทั่วไป */
export function detectDeductionReceipt(text: string): DeductionReceipt | null {
  const normalised = normaliseText(text)
  return DEDUCTION_RECEIPTS.find((r) => r.pattern.test(normalised))?.receipt ?? null
}

export function parseReceipt(text: string, today: string): ReceiptGuess {
  const lines = normaliseText(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let amount: number | null = null
  for (const line of lines) {
    if (TOTAL_LINE.test(line) && !IGNORE_LINE.test(line)) {
      const n = numbers(line)
      if (n.length) amount = n[n.length - 1]!
    }
  }
  if (amount === null) {
    const all = lines.filter((l) => !IGNORE_LINE.test(l)).flatMap(numbers)
    amount = all.length ? Math.max(...all) : null
  }

  let date: string | null = null
  for (const line of lines) {
    for (const token of line.match(DATE_TOKEN) ?? []) {
      const parsed = parseDate(token)
      // ใบเสร็จต้องไม่ใช่วันในอนาคต
      if (parsed && parsed <= today) {
        date = parsed
        break
      }
    }
    if (date) break
  }

  // ชื่อร้านมักเป็นบรรทัดแรกที่มีตัวอักษรเป็นส่วนใหญ่ ไม่ใช่เลขที่ ที่อยู่ หรือเลขผู้เสียภาษี
  const merchant =
    lines.find((l) => /[ก-๙a-z]{3,}/i.test(l) && !/tax\s*id|เลขประจำตัว|tel|โทร|ใบเสร็จ|receipt|ใบกำกับ|invoice|\d{5,}/i.test(l))?.slice(0, 60) ?? ''

  return { amount: amount !== null && amount > 0 ? amount : null, date, merchant }
}
