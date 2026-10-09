/**
 * รวบรวมค่าลดหย่อนให้อัตโนมัติจาก 3 แหล่ง — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 *  1. สมุดบัญชี: รายจ่ายหมวดเบี้ยประกัน ประกันสังคม ออมและลงทุน ของปีภาษีนั้น
 *     แยกประเภทย่อยจากรายละเอียดรายการ (ชีวิต/สุขภาพ/บำนาญ/RMF/Thai ESG ...)
 *  2. กองทุนลดหย่อนของฉัน: ยอดซื้อ RMF/SSF/Thai ESG/Thai ESGX ในปีนั้น
 *  3. แบบภาษีปีก่อน: รายการที่มักเท่าเดิมทุกปี เช่น เบี้ยประกัน ดอกเบี้ยบ้าน
 *
 * ลำดับความน่าเชื่อถือ: สมุดบัญชี (เกิดจริงปีนี้) > กองทุนที่จด > ปีก่อน (ประมาณ)
 * กองทุนที่จดไว้ในหน้ากองทุนแล้ว ไม่นับซ้ำจากสมุดบัญชี
 * รายการที่จับประเภทไม่ได้แยกไว้พร้อมเหตุผล ให้ผู้ใช้ตัดสินใจเอง
 */

import { DEDUCTION_ITEMS, isDeductionAvailable } from '@/data/taxData'
import type { WorkspaceMode } from '@/data/workspaceModes'
import type { FundKind, FundLot } from './fundHoldings'
import { purchasesInTaxYear } from './fundHoldings'
import { calendarYearOf } from './ledgerImport'
import { roundMoney } from './taxEngine'

export type DeductionSourceKind = 'ledger' | 'funds' | 'lastYear'

export interface DeductionSource {
  kind: DeductionSourceKind
  detail: string
  amount: number
}

export interface DeductionSuggestion {
  key: string
  label: string
  amount: number
  /** แหล่งที่ใช้คิดยอด (แหล่งที่ความน่าเชื่อถือสูงสุดของรายการนี้) */
  source: DeductionSourceKind
  sources: DeductionSource[]
}

export interface DeductionSkipped {
  note: string
  amount: number
  reason: string
}

export interface DeductionImport {
  lines: DeductionSuggestion[]
  skipped: DeductionSkipped[]
}

export interface DeductionEntry {
  workspaceId: string
  date: string
  type: 'income' | 'expense'
  categoryKey: string
  amount: number
  note?: string
}

/** รายการที่มักเท่าเดิมทุกปี ยกมาจากปีก่อนได้ */
export const CARRY_OVER_KEYS = [
  'lifeInsurance',
  'healthInsurance',
  'spouseLifeInsurance',
  'parentHealthInsurance',
  'pensionInsurance',
  'mortgageInterest',
]

const FUND_DEDUCTION: Record<FundKind, string> = {
  rmf: 'rmf',
  ssf: 'ssf',
  thaiEsg: 'thaiEsg',
  thaiEsgx: 'thaiEsgxNew',
}

/** กติกาจับประเภทจากรายละเอียด — ตรวจตามลำดับ ตัวแรกที่ตรงชนะ */
const INSURANCE_RULES: { pattern: RegExp; key: string | null; reason?: string }[] = [
  { pattern: /รถ|พ\.?ร\.?บ|ภาคบังคับ|อัคคีภัย|บ้าน|เดินทาง|car|motor|travel|fire/i, key: null, reason: 'ประกันรถ บ้าน หรือการเดินทางไม่ใช่ค่าลดหย่อน' },
  { pattern: /บำนาญ|pension|annuity/i, key: 'pensionInsurance' },
  { pattern: /(?:พ่อ|แม่|บิดา|มารดา|parent).*(?:สุขภาพ|health)|(?:สุขภาพ|health).*(?:พ่อ|แม่|บิดา|มารดา|parent)/i, key: 'parentHealthInsurance' },
  { pattern: /สุขภาพ|health|ค่ารักษา|โรคร้าย|ชดเชยรายได้/i, key: 'healthInsurance' },
  { pattern: /ชีวิต|life|สะสมทรัพย์|ออมทรัพย์|endowment/i, key: 'lifeInsurance' },
]

const SAVING_RULES: { pattern: RegExp; key: string }[] = [
  { pattern: /esg\s*x|esgx/i, key: 'thaiEsgxNew' },
  { pattern: /thai\s*esg|ไทยเอสจี|tesg|esg/i, key: 'thaiEsg' },
  // รหัสกองทุนมักติดกับชื่อ บลจ. เช่น SCBRMF2, KFSSF จึงไม่บังคับขอบคำ
  { pattern: /rmf|อาร์เอ็มเอฟ/i, key: 'rmf' },
  { pattern: /ssf|เพื่อการออม/i, key: 'ssf' },
  { pattern: /กบข|\bgpf\b/i, key: 'gpf' },
  { pattern: /กองทุนสำรองเลี้ยงชีพ|provident|\bpvd\b/i, key: 'providentFund' },
  { pattern: /กอช|การออมแห่งชาติ|\bnsf\b/i, key: 'nsf' },
]

/** จับประเภทค่าลดหย่อนของรายการ — null พร้อมเหตุผลคือไม่ใช่หรือไม่แน่ใจ */
export function classifyDeduction(
  mode: WorkspaceMode,
  categoryKey: string,
  note: string,
): { key: string | null; reason: string } | null {
  if (mode === 'company') return null
  if (categoryKey === 'socialSecurity') return { key: 'socialSecurity', reason: '' }
  if (categoryKey === 'insurance') {
    const rule = INSURANCE_RULES.find((r) => r.pattern.test(note))
    if (!rule) return { key: null, reason: 'ไม่รู้ว่าเป็นประกันชีวิตหรือสุขภาพ — ใส่คำว่า "ชีวิต" หรือ "สุขภาพ" ในรายละเอียด' }
    return { key: rule.key, reason: rule.reason ?? '' }
  }
  if (categoryKey === 'savingInvest') {
    const rule = SAVING_RULES.find((r) => r.pattern.test(note))
    // เงินออมทั่วไป (ฝากธนาคาร หุ้น) ไม่ใช่ค่าลดหย่อน ไม่ต้องรายงาน
    return rule ? { key: rule.key, reason: '' } : null
  }
  return null
}

export interface DeductionImportInput {
  workspaces: { id: string; name: string; mode: WorkspaceMode }[]
  entries: DeductionEntry[]
  taxYearBE: string
  fundLots?: FundLot[]
  /** ค่าลดหย่อนในแบบภาษีปีก่อน (ฉบับล่าสุด) */
  lastYear?: { taxYear: string; deductions: Record<string, number> } | null
}

export function buildDeductionImport(input: DeductionImportInput): DeductionImport {
  const year = calendarYearOf(input.taxYearBE)
  const byId = new Map(input.workspaces.map((w) => [w.id, w]))
  const lines = new Map<string, DeductionSuggestion>()
  const skipped = new Map<string, DeductionSkipped>()

  const available = (key: string) => {
    const item = DEDUCTION_ITEMS.find((d) => d.key === key)
    return item && isDeductionAvailable(item, input.taxYearBE) ? item : null
  }
  const add = (key: string, kind: DeductionSourceKind, detail: string, amount: number) => {
    const item = available(key)
    if (!item || amount <= 0) return
    const line = lines.get(key) ?? { key, label: item.label, amount: 0, source: kind, sources: [] }
    const existing = line.sources.find((s) => s.kind === kind && s.detail === detail)
    if (existing) existing.amount = roundMoney(existing.amount + amount)
    else line.sources.push({ kind, detail, amount: roundMoney(amount) })
    lines.set(key, line)
  }

  // 2. กองทุนที่จดไว้ — ใช้แทนรายการกองทุนเดียวกันในสมุด จะได้ไม่นับซ้ำ
  const fundTotals = purchasesInTaxYear(input.fundLots ?? [], input.taxYearBE)
  const fundKeys = new Set<string>()
  for (const [kind, amount] of Object.entries(fundTotals) as [FundKind, number][]) {
    const key = FUND_DEDUCTION[kind]
    fundKeys.add(key)
    add(key, 'funds', 'กองทุนลดหย่อนของฉัน', amount)
  }

  // 1. สมุดบัญชี
  for (const entry of input.entries) {
    const workspace = byId.get(entry.workspaceId)
    if (!workspace || entry.type !== 'expense' || !entry.date.startsWith(`${year}-`)) continue
    const amount = Number(entry.amount) || 0
    if (amount <= 0) continue
    const note = entry.note?.trim() ?? ''
    const hit = classifyDeduction(workspace.mode, entry.categoryKey, note)
    if (!hit) continue
    if (!hit.key) {
      const id = `${note}|${hit.reason}`
      const row = skipped.get(id) ?? { note: note || '(ไม่มีรายละเอียด)', amount: 0, reason: hit.reason }
      row.amount = roundMoney(row.amount + amount)
      skipped.set(id, row)
      continue
    }
    if (fundKeys.has(hit.key)) continue
    add(hit.key, 'ledger', workspace.name, amount)
  }

  // 3. ปีก่อน — เฉพาะรายการที่ปีนี้ยังไม่มีจากแหล่งที่เกิดจริง
  if (input.lastYear) {
    for (const key of CARRY_OVER_KEYS) {
      const amount = Number(input.lastYear.deductions[key]) || 0
      if (!lines.has(key)) add(key, 'lastYear', `แบบภาษีปี ${input.lastYear.taxYear}`, amount)
    }
  }

  const order = DEDUCTION_ITEMS.map((d) => d.key)
  return {
    lines: [...lines.values()]
      .map((line) => ({ ...line, amount: roundMoney(line.sources.reduce((s, x) => s + x.amount, 0)) }))
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)),
    skipped: [...skipped.values()],
  }
}

/** แบบภาษีฉบับล่าสุดของปีก่อนหน้าปีภาษีนี้ — null คือไม่มี */
export function previousYearFiling<T extends { taxYear: string; submittedAt: string }>(
  filings: T[],
  taxYearBE: string,
): T | null {
  const previous = String(Number(taxYearBE) - 1)
  return (
    filings
      .filter((f) => f.taxYear === previous)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null
  )
}
