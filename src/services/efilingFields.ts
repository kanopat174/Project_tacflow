/**
 * จัดตัวเลขของแบบที่บันทึกไว้ให้เรียงตามหน้าจอ e-Filing ภ.ง.ด.90/91 ของกรมสรรพากร — ฟังก์ชันบริสุทธิ์
 *
 * ผู้ใช้กดคัดลอกทีละช่องไปวางใน efiling.rd.go.th ได้เลย ไม่ต้องพิมพ์ตัวเลขเอง
 * ค่าที่ให้คัดลอกคือยอดที่ "จ่ายจริง/ได้รับจริง" ไม่ใช่ยอดหลังตัดเพดาน เพราะ e-Filing ตัดเพดานเอง
 * ผู้อยู่ในอุปการะ e-Filing ถามเป็นจำนวนคน จึงให้คัดลอกเป็นจำนวนคน
 */

import { inferDependents } from '@/data/dependents'
import { DEDUCTION_GROUPS, DEDUCTION_ITEMS, INCOME_CATEGORIES, type DeductionGroup } from '@/data/taxData'
import { formatBaht } from './taxEngine'

export interface EFilingField {
  id: string
  label: string
  /** ข้อความที่คัดลอกไปวาง — ตัวเลขไม่มีจุลภาค */
  copy: string
  /** ข้อความที่แสดงบนจอ */
  display: string
  hint?: string
}

export interface EFilingSection {
  title: string
  fields: EFilingField[]
}

interface FilingSnapshot {
  taxpayer?: { citizenId?: string; fullName?: string }
  income?: Record<string, number>
  deductions?: Record<string, number>
  withholdingTax?: number
}

/** ตัวเลขสำหรับวางในช่องกรอกเงิน: ทศนิยม 2 ตำแหน่ง ไม่มีจุลภาค */
export function plainMoney(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2)
}

const money = (id: string, label: string, amount: number, hint?: string): EFilingField => ({
  id,
  label,
  copy: plainMoney(amount),
  display: formatBaht(amount),
  hint,
})

const GROUP_ORDER: DeductionGroup[] = ['personal', 'insurance', 'investment', 'housing', 'stimulus', 'donation']

export function efilingSections(snapshot: FilingSnapshot): EFilingSection[] {
  const income = snapshot.income ?? {}
  const deductions = snapshot.deductions ?? {}
  const sections: EFilingSection[] = []

  const citizenId = snapshot.taxpayer?.citizenId?.replace(/\D/g, '') ?? ''
  if (citizenId) {
    sections.push({
      title: 'เข้าสู่ระบบ e-Filing',
      fields: [{ id: 'citizenId', label: 'เลขประจำตัวผู้เสียภาษี', copy: citizenId, display: citizenId }],
    })
  }

  const incomeFields: EFilingField[] = []
  for (const category of INCOME_CATEGORIES) {
    const amount = Number(income[category.key]) || 0
    if (amount <= 0) continue
    incomeFields.push(money(`income:${category.key}`, `${category.label} ${category.code}`, amount))
    if (category.code === '40(1)' && (snapshot.withholdingTax ?? 0) > 0) {
      incomeFields.push(
        money('withholding', 'ภาษีหัก ณ ที่จ่าย', snapshot.withholdingTax ?? 0, 'ยอดรวมทุกใบ 50 ทวิ — ถ้ามีหลายประเภทเงินได้ แยกกรอกตามใบ'),
      )
    }
  }
  const hasSalary = INCOME_CATEGORIES.some((c) => c.code === '40(1)' && (Number(income[c.key]) || 0) > 0)
  if (!hasSalary && (snapshot.withholdingTax ?? 0) > 0) {
    incomeFields.push(money('withholding', 'ภาษีหัก ณ ที่จ่าย (รวม)', snapshot.withholdingTax ?? 0))
  }
  if (incomeFields.length) sections.push({ title: 'เงินได้', fields: incomeFields })

  const dependents = inferDependents(deductions)
  for (const group of GROUP_ORDER) {
    const fields: EFilingField[] = []
    for (const item of DEDUCTION_ITEMS.filter((d) => d.group === group)) {
      const amount = Number(deductions[item.key]) || 0
      // ค่าลดหย่อนส่วนตัว e-Filing ใส่ให้เอง
      if (amount <= 0 || item.preset) continue
      if (item.key === 'children') {
        fields.push({ id: 'children', label: 'บุตร (จำนวนคน)', copy: String(dependents.children), display: `${dependents.children} คน`, hint: 'e-Filing ถามแยกบุตรที่เกิดก่อน/ตั้งแต่ปี 2561' })
      } else if (item.key === 'parents') {
        fields.push({ id: 'parents', label: 'บิดามารดา (จำนวนคน)', copy: String(dependents.parents), display: `${dependents.parents} คน` })
      } else if (item.key === 'disabledCare') {
        fields.push({ id: 'disabledCare', label: 'ผู้พิการหรือทุพพลภาพที่อุปการะ (จำนวนคน)', copy: String(dependents.disabled), display: `${dependents.disabled} คน` })
      } else {
        fields.push(money(`deduction:${item.key}`, item.label, amount))
      }
    }
    if (fields.length) sections.push({ title: DEDUCTION_GROUPS[group].label, fields })
  }
  return sections
}
