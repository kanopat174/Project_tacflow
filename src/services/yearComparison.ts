/**
 * เทียบแบบภาษีหลายปี — ฟังก์ชันบริสุทธิ์
 * ใช้ตัวเลขสรุปที่เก็บไว้กับแบบภาษีแต่ละปี จึงใช้ได้แม้แบบเก่าจะไม่มีรายละเอียดรายการลดหย่อน
 */

import { roundMoney } from './taxEngine'

export interface YearFiling {
  taxYear: string
  grossIncome: number
  netIncome: number
  tax: number
}

export interface YearRow {
  taxYear: string
  grossIncome: number
  netIncome: number
  tax: number
  /** ภาษีเทียบเงินได้พึงประเมิน */
  effectiveRate: number
  /** สัดส่วนของเงินได้ที่หักออกได้ (ค่าใช้จ่าย + ค่าลดหย่อน) */
  shieldRate: number
  /** ภาษีเปลี่ยนจากปีก่อนกี่เปอร์เซ็นต์ — null คือไม่มีปีก่อนให้เทียบ */
  taxChange: number | null
  incomeChange: number | null
}

export interface YearComparison {
  rows: YearRow[]
  /** ปีที่อัตราภาษีแท้จริงต่ำสุด */
  lowestRateYear: string | null
  /** ปีที่หักค่าใช้จ่ายและลดหย่อนได้สัดส่วนมากที่สุด */
  bestShieldYear: string | null
  insights: string[]
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}

export function compareYears(filings: YearFiling[]): YearComparison {
  // ปีเดียวกันยื่นได้ครั้งเดียว แต่กันไว้เผื่อข้อมูลซ้ำ: ใช้ฉบับแรกที่เจอ
  const unique = new Map<string, YearFiling>()
  for (const f of filings) if (!unique.has(f.taxYear)) unique.set(f.taxYear, f)
  const sorted = [...unique.values()].sort((a, b) => Number(a.taxYear) - Number(b.taxYear))

  const rows: YearRow[] = sorted.map((f, i) => {
    const prev = sorted[i - 1]
    return {
      taxYear: f.taxYear,
      grossIncome: roundMoney(f.grossIncome),
      netIncome: roundMoney(f.netIncome),
      tax: roundMoney(f.tax),
      effectiveRate: f.grossIncome > 0 ? f.tax / f.grossIncome : 0,
      shieldRate: f.grossIncome > 0 ? Math.max(0, f.grossIncome - f.netIncome) / f.grossIncome : 0,
      taxChange: prev ? change(f.tax, prev.tax) : null,
      incomeChange: prev ? change(f.grossIncome, prev.grossIncome) : null,
    }
  })

  const withIncome = rows.filter((r) => r.grossIncome > 0)
  const lowest = [...withIncome].sort((a, b) => a.effectiveRate - b.effectiveRate)[0]
  const bestShield = [...withIncome].sort((a, b) => b.shieldRate - a.shieldRate)[0]

  const insights: string[] = []
  const last = rows[rows.length - 1]
  if (last && last.taxChange !== null && last.incomeChange !== null) {
    const taxDir = last.taxChange >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'
    const incomeDir = last.incomeChange >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'
    insights.push(
      `ปี ${last.taxYear} ภาษี${taxDir} ${pct(Math.abs(last.taxChange))} ขณะที่เงินได้${incomeDir} ${pct(Math.abs(last.incomeChange))} จากปีก่อน`,
    )
    if (last.taxChange > last.incomeChange + 0.05) {
      insights.push('ภาษีโตเร็วกว่าเงินได้ เพราะอัตราภาษีเป็นขั้นบันได ลองดูผู้ช่วยแนะนำการลดหย่อนเพื่อลดขั้นภาษี')
    }
  }
  if (withIncome.length >= 2 && lowest) {
    insights.push(`ปี ${lowest.taxYear} เสียภาษีคุ้มที่สุด อัตราภาษีที่แท้จริง ${pct(lowest.effectiveRate)}`)
  }
  if (withIncome.length >= 2 && bestShield) {
    insights.push(
      `ปี ${bestShield.taxYear} หักค่าใช้จ่ายและลดหย่อนได้มากที่สุด ${pct(bestShield.shieldRate)} ของเงินได้`,
    )
  }

  return {
    rows,
    lowestRateYear: withIncome.length >= 2 ? (lowest?.taxYear ?? null) : null,
    bestShieldYear: withIncome.length >= 2 ? (bestShield?.taxYear ?? null) : null,
    insights,
  }
}
