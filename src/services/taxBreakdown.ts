/**
 * แตกภาษีเป็นขั้นตอนให้เห็นภาพ "ภาษีของคุณมาจากไหน" — ฟังก์ชันบริสุทธิ์
 *
 * ขั้นแรกเป็นกราฟน้ำตก: เงินได้ → หักยกเว้น → หักค่าใช้จ่าย → หักค่าลดหย่อน = เงินได้สุทธิ
 * ขั้นที่สองแตกเงินได้สุทธิตามขั้นบันได ว่าก้อนไหนเสียกี่ % เป็นภาษีกี่บาท
 * แล้วสรุปเป็นประโยคที่คนทั่วไปเข้าใจ: จากทุก 100 บาทที่หาได้ เสียภาษีกี่บาท
 */

import type { TaxResult } from './taxEngine'

export interface WaterfallStep {
  key: string
  label: string
  /** term ในคำศัพท์ (glossary) ใช้ทำคำอธิบายแบบแตะดู */
  term?: string
  /** จุดเริ่มและจุดจบของแท่ง (บาท) */
  start: number
  end: number
  kind: 'total' | 'minus'
}

export interface BracketSlice {
  label: string
  rate: number
  amount: number
  tax: number
}

export interface TaxBreakdown {
  steps: WaterfallStep[]
  brackets: BracketSlice[]
  /** ภาษีต่อเงินได้ทุก 100 บาท */
  per100: number
  /** ภาษีของเงินได้ที่หาเพิ่มอีก 100 บาท */
  marginalPer100: number
}

export function taxBreakdown(r: TaxResult): TaxBreakdown | null {
  if (r.grossIncome <= 0) return null
  const steps: WaterfallStep[] = [{ key: 'gross', label: 'เงินได้พึงประเมิน', term: 'assessableIncome', start: 0, end: r.grossIncome, kind: 'total' }]
  let level = r.grossIncome
  const minus = (key: string, label: string, amount: number, term?: string) => {
    if (amount <= 0) return
    steps.push({ key, label, term, start: level - amount, end: level, kind: 'minus' })
    level -= amount
  }
  minus('exempt', 'ยกเว้นผู้สูงอายุ/ผู้พิการ', r.exemptIncome)
  minus('expense', 'ค่าใช้จ่าย', r.totalExpense, 'expense')
  minus('deduction', 'ค่าลดหย่อน', r.usedDeduction, 'deduction')
  steps.push({ key: 'net', label: 'เงินได้สุทธิ', term: 'netIncome', start: 0, end: r.netIncome, kind: 'total' })

  return {
    steps,
    brackets: r.bracketLines.filter((b) => b.amount > 0).map(({ label, rate, amount, tax }) => ({ label, rate, amount, tax })),
    per100: Math.round(r.effectiveRate * 100 * 100) / 100,
    marginalPer100: Math.round(r.marginalRate * 100),
  }
}
