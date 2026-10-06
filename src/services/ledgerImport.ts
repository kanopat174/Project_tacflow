/**
 * แปลงรายการในสมุดบัญชีเป็นตัวเลขของแบบภาษีเงินได้บุคคลธรรมดา — ฟังก์ชันบริสุทธิ์
 *
 * จับคู่หมวดรายรับของแต่ละโหมดกับประเภทเงินได้ตามมาตรา 40
 * รายการที่ไม่ควรนำไปรวมในแบบบุคคลธรรมดาจะถูกแยกไว้พร้อมเหตุผล ให้ผู้ใช้ตัดสินใจเอง
 */

import { INCOME_CATEGORIES } from '@/data/taxData'
import { categoryLabel, type WorkspaceMode } from '@/data/workspaceModes'
import { roundMoney } from './taxEngine'

/** หมวดรายรับ → คีย์ประเภทเงินได้ในแบบภาษี (ตาม INCOME_CATEGORIES) */
const INCOME_MAP: Partial<Record<WorkspaceMode, Record<string, string>>> = {
  personal: {
    salary: 'salary',
    bonus: 'salary',
    sideIncome: 'freelance',
    investmentIncome: 'investment',
  },
  freelancer: {
    projectFee: 'freelance',
    retainer: 'freelance',
    teaching: 'freelance',
    royalty: 'royalty',
  },
  sme: {
    productSales: 'business',
    serviceIncome: 'business',
  },
  investor: {
    dividend: 'investment',
    interest: 'investment',
    rentalIncome: 'rent',
  },
}

/** หมวดรายจ่ายที่เป็นภาษีถูกหัก ณ ที่จ่าย นำไปเครดิตในแบบได้ */
const WITHHELD_EXPENSE_KEYS = new Set(['withheldTax'])

/** เหตุผลที่ไม่ดึงหมวดนั้นไปให้ */
function skipReason(mode: WorkspaceMode, key: string): string {
  if (mode === 'company') return 'สมุดโหมดบริษัทเสียภาษีเงินได้นิติบุคคล ไม่ใช่แบบบุคคลธรรมดา'
  if (mode === 'trader' || key === 'realisedGain') {
    return 'กำไรจากการขายหุ้นในตลาดหลักทรัพย์ได้รับยกเว้น — ถ้าเป็นหุ้นนอกตลาดหรือต่างประเทศ ใช้เครื่องคำนวณกำไรจากการขายหุ้น'
  }
  return 'ระบบไม่รู้ว่าเป็นเงินได้ประเภทไหน กรอกเองในช่องที่ตรงกับลักษณะเงินได้'
}

export interface ImportEntry {
  workspaceId: string
  date: string
  type: 'income' | 'expense'
  categoryKey: string
  amount: number
  withholdingTax?: number
}

export interface ImportWorkspace {
  id: string
  name: string
  mode: WorkspaceMode
}

export interface ImportSource {
  workspace: string
  category: string
  amount: number
}

export interface ImportLine {
  incomeKey: string
  code: string
  label: string
  amount: number
  sources: ImportSource[]
}

export interface ImportSkipped {
  workspace: string
  category: string
  amount: number
  reason: string
}

export interface FilingImport {
  /** ปี ค.ศ. ที่ใช้กรองรายการ */
  calendarYear: number
  lines: ImportLine[]
  withholdingTax: number
  skipped: ImportSkipped[]
  /** จำนวนรายการรายรับที่นำมาคิด */
  entryCount: number
  /** รายจ่ายจริงของสมุดโหมดธุรกิจ ใช้เทียบกับการหักค่าใช้จ่ายแบบเหมาของเงินได้ 40(8) */
  businessExpenses: number
}

/** ปีภาษี พ.ศ. → ปี ค.ศ. */
export function calendarYearOf(taxYearBE: string | number): number {
  return Number(taxYearBE) - 543
}

export function buildFilingImport(
  workspaces: ImportWorkspace[],
  entries: ImportEntry[],
  taxYearBE: string,
  /** จำกัดเฉพาะเดือน เช่น [1, 6] สำหรับภาษีครึ่งปี */
  months: [number, number] = [1, 12],
): FilingImport {
  const year = calendarYearOf(taxYearBE)
  const byId = new Map(workspaces.map((w) => [w.id, w]))
  const lines = new Map<string, ImportLine>()
  const skipped = new Map<string, ImportSkipped>()
  let withholdingTax = 0
  let entryCount = 0
  let businessExpenses = 0

  for (const entry of entries) {
    const workspace = byId.get(entry.workspaceId)
    if (!workspace || !entry.date.startsWith(`${year}-`)) continue
    const month = Number(entry.date.slice(5, 7))
    if (month < months[0] || month > months[1]) continue
    const amount = Number(entry.amount) || 0
    if (amount <= 0) continue
    const category = categoryLabel(workspace.mode, entry.categoryKey)

    if (entry.type === 'expense') {
      // ภาษีที่ถูกหักไว้บันทึกเป็นหมวดรายจ่ายในโหมดนักลงทุน
      if (WITHHELD_EXPENSE_KEYS.has(entry.categoryKey)) withholdingTax += amount
      // รายจ่ายของร้านค้า (ไม่รวมภาษีที่จ่ายให้รัฐ) คือค่าใช้จ่ายจริงของเงินได้ 40(8)
      else if (workspace.mode === 'sme' && entry.categoryKey !== 'taxFee') businessExpenses += amount
      continue
    }

    const incomeKey = INCOME_MAP[workspace.mode]?.[entry.categoryKey]
    if (!incomeKey) {
      const id = `${workspace.id}:${entry.categoryKey}`
      const row = skipped.get(id) ?? {
        workspace: workspace.name,
        category,
        amount: 0,
        reason: skipReason(workspace.mode, entry.categoryKey),
      }
      row.amount += amount
      skipped.set(id, row)
      continue
    }

    entryCount += 1
    withholdingTax += Number(entry.withholdingTax) || 0

    const meta = INCOME_CATEGORIES.find((c) => c.key === incomeKey)!
    const line = lines.get(incomeKey) ?? {
      incomeKey,
      code: meta.code,
      label: meta.label,
      amount: 0,
      sources: [],
    }
    line.amount += amount
    const source = line.sources.find((s) => s.workspace === workspace.name && s.category === category)
    if (source) source.amount += amount
    else line.sources.push({ workspace: workspace.name, category, amount })
    lines.set(incomeKey, line)
  }

  const order = INCOME_CATEGORIES.map((c) => c.key)
  return {
    calendarYear: year,
    lines: [...lines.values()]
      .map((line) => ({
        ...line,
        amount: roundMoney(line.amount),
        sources: line.sources.map((s) => ({ ...s, amount: roundMoney(s.amount) })),
      }))
      .sort((a, b) => order.indexOf(a.incomeKey) - order.indexOf(b.incomeKey)),
    withholdingTax: roundMoney(withholdingTax),
    skipped: [...skipped.values()].map((s) => ({ ...s, amount: roundMoney(s.amount) })),
    entryCount,
    businessExpenses: roundMoney(businessExpenses),
  }
}
