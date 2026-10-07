/**
 * อ่านตัวเลขจากข้อความของหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — ฟังก์ชันบริสุทธิ์
 *
 * ข้อความมาจากสองทาง: ดึงตรงจาก PDF ที่นายจ้างออกให้ (แม่นยำ) หรือ OCR จากรูปถ่าย (มีสัญญาณรบกวน)
 * จึงจับตามป้ายของแต่ละแถวในแบบฟอร์มมาตรฐาน แล้วเอาตัวเลขที่มีทศนิยม 2 ตำแหน่งท้ายแถวเป็น
 * "จำนวนเงินที่จ่าย" และ "ภาษีที่หักและนำส่งไว้" ตามลำดับคอลัมน์ในแบบ
 * ตัวเลขที่ไม่มีทศนิยม (ปี พ.ศ. วันที่ เลขประจำตัว) จึงไม่ถูกหยิบผิด
 *
 * ผลลัพธ์ต้องให้ผู้ใช้ตรวจก่อนเติมลงแบบเสมอ
 */

export type CertificateRowKind = '40(1)' | '40(2)' | '40(3)' | '40(4)a' | '40(4)b' | '3tres' | 'other'

export interface CertificateRow {
  kind: CertificateRowKind
  label: string
  /** ช่องเงินได้ในแบบยื่นที่ควรเติม */
  incomeKey: string
  paid: number
  tax: number
  /** ประเภทเงินได้กำกวม ผู้ใช้ควรเลือกช่องเอง */
  review: boolean
}

export interface CertificateFunds {
  socialSecurity: number
  providentFund: number
  gpf: number
}

export interface CertificateResult {
  rows: CertificateRow[]
  funds: CertificateFunds
  /** แถว "รวมเงินที่จ่ายและภาษีที่หักนำส่ง" ถ้าอ่านได้ */
  total: { paid: number; tax: number } | null
  /** ผลรวมของแถวไม่ตรงกับแถวรวม — อ่านพลาดบางแถว */
  mismatch: boolean
  /** เลขประจำตัวผู้เสียภาษีของผู้จ่ายเงิน (ตัวแรกในเอกสาร) */
  payerTaxId: string
}

const ROW_RULES: { kind: CertificateRowKind; pattern: RegExp; label: string; incomeKey: string; review?: boolean }[] = [
  // แถวที่ 5 มีคำว่า "ค่าจ้างทำของ" จึงจับเฉพาะ "ค่าจ้าง" ที่ไม่ใช่ค่าจ้างทำของ
  { kind: '40(1)', pattern: /40\(1\)|เงินเดือน|ค่าจ้าง(?!ทำของ)/, label: 'เงินเดือน ค่าจ้าง โบนัส · 40(1)', incomeKey: 'salary' },
  { kind: '40(2)', pattern: /40\(2\)|ค่าธรรมเนียม|ค่านายหน้า/, label: 'ค่าธรรมเนียม ค่านายหน้า · 40(2)', incomeKey: 'freelance' },
  { kind: '40(3)', pattern: /40\(3\)|ลิขสิทธิ์/, label: 'ค่าลิขสิทธิ์ · 40(3)', incomeKey: 'royalty' },
  { kind: '40(4)a', pattern: /40\(4\)\s*\(ก\)|ดอกเบี้ย/, label: 'ดอกเบี้ย · 40(4)(ก)', incomeKey: 'investment' },
  { kind: '40(4)b', pattern: /40\(4\)\s*\(ข\)|เงินปันผล|ส่วนแบ่งกำไร/, label: 'เงินปันผล · 40(4)(ข)', incomeKey: 'investment' },
  {
    kind: '3tres',
    pattern: /3\s*เตรส|ค่าจ้างทำของ|ค่าบริการ|ค่าโฆษณา/,
    label: 'ค่าบริการ ค่าจ้างทำของ ฯลฯ (มาตรา 3 เตรส)',
    incomeKey: 'freelance',
    review: true,
  },
  { kind: 'other', pattern: /^\s*6\.|อื่น\s*ๆ\s*\(ระบุ\)/, label: 'อื่น ๆ', incomeKey: 'business', review: true },
]

const TOTAL_PATTERN = /รวมเงินที่จ่าย|รวมเงินได้|total/i
const FUND_RULES: { key: keyof CertificateFunds; pattern: RegExp }[] = [
  { key: 'gpf', pattern: /กบข|กสจ|สงเคราะห์ครู/ },
  { key: 'socialSecurity', pattern: /ประกันสังคม/ },
  { key: 'providentFund', pattern: /สำรองเลี้ยงชีพ/ },
]

const MONEY = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g

/** เลขไทยเป็นอารบิก ช่องว่างซ้อน และ "40 ( 1 )" เป็น "40(1)" */
export function normaliseText(text: string): string {
  return text
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[ \t]+/g, ' ')
    .replace(/40\s*\(\s*(\d)\s*\)/g, '40($1)')
    // OCR มักอ่านจุลภาคในตัวเลขเป็นจุด: "30.000.00" — ไม่แก้กรณีเว้นวรรค เพราะจะไปรวมปี พ.ศ. ที่อยู่หน้ายอดเงิน
    .replace(/(\d)\.(\d{3})(?=[.,]\d{2}\b|\.\d{3})/g, '$1,$2')
    .replace(/[ ]{2,}/g, ' ')
}

function amounts(line: string): number[] {
  return (line.match(MONEY) ?? []).map((m) => Number(m.replace(/,/g, '')))
}

export function parseWithholdingCertificate(text: string): CertificateResult {
  const lines = normaliseText(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const isLabelled = (line: string) =>
    ROW_RULES.some((r) => r.pattern.test(line)) || TOTAL_PATTERN.test(line) || FUND_RULES.some((f) => f.pattern.test(line))

  /** ตัวเลขของแถว — ป้ายยาวมักขึ้นบรรทัดใหม่ ตัวเลขจึงอาจอยู่บรรทัดถัดไปที่ไม่มีป้ายของแถวอื่น */
  const numbersFor = (index: number): number[] => {
    const own = amounts(lines[index]!)
    if (own.length) return own
    for (let j = index + 1; j <= index + 2 && j < lines.length; j++) {
      if (isLabelled(lines[j]!)) break
      const next = amounts(lines[j]!)
      if (next.length) return next
    }
    return []
  }

  const rows: CertificateRow[] = []
  const funds: CertificateFunds = { socialSecurity: 0, providentFund: 0, gpf: 0 }
  let total: CertificateResult['total'] = null

  lines.forEach((line, i) => {
    if (TOTAL_PATTERN.test(line)) {
      const n = numbersFor(i)
      if (!total && n.length) total = { paid: n.length > 1 ? n[n.length - 2]! : n[0]!, tax: n.length > 1 ? n[n.length - 1]! : 0 }
      return
    }
    // กองทุนทั้งสามมักอยู่บรรทัดเดียวกัน ตัดบรรทัดเป็นช่วงตามตำแหน่งป้าย แล้วอ่านยอดของแต่ละช่วง
    const found = FUND_RULES.map((f) => ({ key: f.key, at: line.search(f.pattern) }))
      .filter((f) => f.at >= 0)
      .sort((a, b) => a.at - b.at)
    if (found.length) {
      found.forEach((f, k) => {
        const segment = line.slice(f.at, found[k + 1]?.at ?? line.length)
        const n = amounts(segment)
        const value = n.length ? n[0]! : found.length === 1 ? (numbersFor(i)[0] ?? 0) : 0
        if (value && !funds[f.key]) funds[f.key] = value
      })
      return
    }
    const rule = ROW_RULES.find((r) => r.pattern.test(line))
    if (!rule || rows.some((r) => r.kind === rule.kind)) return
    const n = numbersFor(i)
    if (!n.length) return
    const paid = n.length > 1 ? n[n.length - 2]! : n[0]!
    const tax = n.length > 1 ? n[n.length - 1]! : 0
    // ภาษีที่หักต้องไม่เกินเงินที่จ่าย ถ้าเกินแปลว่าหยิบตัวเลขผิดคอลัมน์ สลับให้
    rows.push({
      kind: rule.kind,
      label: rule.label,
      incomeKey: rule.incomeKey,
      paid: Math.max(paid, tax),
      tax: Math.min(paid, tax),
      review: Boolean(rule.review),
    })
  })

  const sum = (key: 'paid' | 'tax') => Math.round(rows.reduce((s, r) => s + r[key], 0) * 100) / 100
  const t = total as CertificateResult['total']
  const mismatch = Boolean(t && rows.length && (Math.abs(sum('paid') - t.paid) > 0.01 || Math.abs(sum('tax') - t.tax) > 0.01))

  // ถ้าอ่านแถวไม่ได้เลยแต่มีแถวรวม ใช้แถวรวมเป็นเงินเดือนไว้ก่อน (กรณีพบบ่อยที่สุด) แล้วให้ผู้ใช้ตรวจ
  if (!rows.length && t) {
    rows.push({ kind: '40(1)', label: 'ยอดรวมตามหนังสือรับรอง', incomeKey: 'salary', paid: t.paid, tax: t.tax, review: true })
  }

  const payerTaxId = normaliseText(text).replace(/[\s-]/g, '').match(/(?<!\d)\d{13}(?!\d)/)?.[0] ?? ''

  return { rows, funds, total: t, mismatch, payerTaxId }
}
