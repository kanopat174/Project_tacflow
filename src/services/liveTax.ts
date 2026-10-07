/**
 * ภาษีของปีนี้แบบสด — ฟังก์ชันบริสุทธิ์
 *
 * รวมรายรับในสมุดตั้งแต่ 1 มกราคมถึงวันนี้ (จับคู่ประเภทเงินได้ด้วยกติกาเดียวกับการดึงเข้าแบบภาษี)
 * แล้วคาดการณ์ถึงสิ้นปีว่า "ยอดถึงวันนี้ + ค่าเฉลี่ยต่อเดือน × เดือนที่เหลือ"
 * ค่าเฉลี่ยคิดจากเดือนที่มีรายรับประเภทนั้นจริง เงินเดือนที่จดทุกเดือนจึงคาดการณ์ได้ 12 เดือนพอดี
 * ไม่บวมเพราะวันที่ยังไม่ครบเดือน
 */

import { buildFilingImport, type ImportEntry, type ImportWorkspace } from './ledgerImport'
import { calculateTax, roundMoney, type AmountMap, type TaxOptions, type TaxResult } from './taxEngine'

export interface LiveTax {
  taxYear: string
  /** เดือนปัจจุบัน 1–12 */
  month: number
  ytdIncome: number
  ytdWithholding: number
  /** ภาษีของเงินได้ถึงวันนี้ ถ้าปีภาษีจบวันนี้ */
  ytdTax: number
  projectedIncome: number
  projectedWithholding: number
  projected: TaxResult
  /** จำนวนเดือนที่มีรายรับในสมุด — น้อยกว่า 2 ถือว่าคาดการณ์ยังไม่แม่น */
  monthsWithData: number
  confident: boolean
}

export function liveTax(
  workspaces: ImportWorkspace[],
  entries: ImportEntry[],
  today: string,
  deductions: AmountMap,
  options: Omit<TaxOptions, 'taxYear'> = {},
): LiveTax | null {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const taxYear = String(year + 543)

  const ytd = buildFilingImport(workspaces, entries, taxYear, [1, month])
  if (!ytd.lines.length) return null

  // ยอดของแต่ละเดือน เพื่อหาค่าเฉลี่ยจากเดือนที่มีข้อมูลจริง
  const monthly = Array.from({ length: month }, (_, i) => buildFilingImport(workspaces, entries, taxYear, [i + 1, i + 1]))
  const remaining = 12 - month

  const income: AmountMap = {}
  const projectedIncome: AmountMap = {}
  for (const line of ytd.lines) {
    const amounts = monthly.map((m) => m.lines.find((l) => l.incomeKey === line.incomeKey)?.amount ?? 0)
    const active = amounts.filter((a) => a > 0).length || 1
    income[line.incomeKey] = line.amount
    projectedIncome[line.incomeKey] = roundMoney(line.amount + (line.amount / active) * remaining)
  }
  const whtMonths = monthly.filter((m) => m.withholdingTax > 0).length || 1
  const projectedWithholding = roundMoney(ytd.withholdingTax + (ytd.withholdingTax / whtMonths) * remaining)

  const opts: TaxOptions = { ...options, taxYear }
  const ytdResult = calculateTax(income, deductions, ytd.withholdingTax, opts)
  const projected = calculateTax(projectedIncome, deductions, projectedWithholding, opts)
  const monthsWithData = monthly.filter((m) => m.lines.length > 0).length

  return {
    taxYear,
    month,
    ytdIncome: ytdResult.grossIncome,
    ytdWithholding: ytd.withholdingTax,
    ytdTax: ytdResult.tax,
    projectedIncome: projected.grossIncome,
    projectedWithholding,
    projected,
    monthsWithData,
    confident: monthsWithData >= 2,
  }
}
