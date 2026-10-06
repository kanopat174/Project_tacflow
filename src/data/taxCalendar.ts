/**
 * ปฏิทินกำหนดยื่นแบบและชำระภาษีที่เกิดซ้ำทุกปี/ทุกเดือน
 *
 * วันที่เป็นกำหนดตามกฎหมายสำหรับการยื่นแบบกระดาษ การยื่นทางอินเทอร์เน็ตมักได้ขยายเวลาเพิ่ม
 * ตามประกาศของกรมสรรพากรในแต่ละปี จึงแสดงข้อความนั้นไว้ในคำอธิบายแทนการเดาวันที่
 * ภาษีนิติบุคคลคิดจากรอบบัญชีที่สิ้นสุด 31 ธันวาคม ซึ่งเป็นรอบที่พบบ่อยที่สุด
 */

import type { WorkspaceMode } from './workspaceModes'

export type Audience = 'everyone' | WorkspaceMode

interface YearlyRule {
  kind: 'yearly'
  /** เดือน 1–12 */
  month: number
  day: number
}

interface MonthlyRule {
  kind: 'monthly'
  day: number
}

export interface CalendarRule {
  key: string
  title: string
  detail: string
  /** ใครต้องสนใจกำหนดนี้ — everyone คือผู้มีเงินได้ทุกคน */
  audience: Audience[]
  rule: YearlyRule | MonthlyRule
  /** ลิงก์ภายในเว็บที่ช่วยเตรียมเรื่องนี้ */
  to?: string
}

export const CALENDAR_RULES: CalendarRule[] = [
  {
    key: 'pit-annual',
    title: 'ยื่นแบบ ภ.ง.ด.90/91 ของปีที่แล้ว',
    detail: 'ภาษีเงินได้บุคคลธรรมดาประจำปี — ยื่นทางอินเทอร์เน็ตมักขยายเวลาให้ถึงต้นเดือนเมษายน',
    audience: ['everyone'],
    rule: { kind: 'yearly', month: 3, day: 31 },
    to: '/filing',
  },
  {
    key: 'deduction-deadline',
    title: 'วันสุดท้ายซื้อกองทุนและจ่ายเบี้ยประกันเพื่อลดหย่อนปีนี้',
    detail: 'SSF, RMF, Thai ESG, ประกันชีวิต และเงินบริจาค ต้องจ่ายภายในปีภาษีจึงจะใช้สิทธิได้',
    audience: ['everyone'],
    rule: { kind: 'yearly', month: 12, day: 31 },
    to: '/deductions',
  },
  {
    key: 'pit-half-year',
    title: 'ยื่นแบบ ภ.ง.ด.94 (ภาษีครึ่งปี)',
    detail: 'สำหรับเงินได้ตามมาตรา 40(5)–40(8) ที่ได้รับช่วงมกราคม–มิถุนายน เช่น ค่าเช่า วิชาชีพอิสระ ธุรกิจ',
    audience: ['freelancer', 'sme', 'investor'],
    rule: { kind: 'yearly', month: 9, day: 30 },
    to: '/calculator/personal',
  },
  {
    key: 'vat-monthly',
    title: 'ยื่นแบบ ภ.พ.30 และชำระภาษีมูลค่าเพิ่ม',
    detail: 'ของเดือนที่แล้ว ภายในวันที่ 15 (ยื่นทางอินเทอร์เน็ตได้ถึงวันที่ 23)',
    audience: ['sme', 'company'],
    rule: { kind: 'monthly', day: 15 },
    to: '/calculator/vat',
  },
  {
    key: 'wht-monthly',
    title: 'นำส่งภาษีหัก ณ ที่จ่าย ภ.ง.ด.1 / 3 / 53',
    detail: 'ของเดือนที่แล้ว ภายในวันที่ 7 (ยื่นทางอินเทอร์เน็ตได้ถึงวันที่ 15)',
    audience: ['sme', 'company'],
    rule: { kind: 'monthly', day: 7 },
    to: '/calculator/withholding',
  },
  {
    key: 'social-security',
    title: 'นำส่งเงินสมทบประกันสังคมของลูกจ้าง',
    detail: 'ของเดือนที่แล้ว ภายในวันที่ 15',
    audience: ['sme', 'company'],
    rule: { kind: 'monthly', day: 15 },
  },
  {
    key: 'pnd1-annual',
    title: 'ยื่นแบบ ภ.ง.ด.1ก สรุปเงินเดือนพนักงานทั้งปี',
    detail: 'สรุปเงินได้และภาษีที่หักไว้ของลูกจ้างทุกคนในปีที่แล้ว',
    audience: ['sme', 'company'],
    rule: { kind: 'yearly', month: 2, day: 28 },
  },
  {
    key: 'cit-annual',
    title: 'ยื่นแบบ ภ.ง.ด.50 ภาษีนิติบุคคลประจำปี',
    detail: 'ภายใน 150 วันนับจากวันสิ้นรอบบัญชี (รอบบัญชีปีปฏิทิน)',
    audience: ['company'],
    rule: { kind: 'yearly', month: 5, day: 30 },
    to: '/calculator/corporate',
  },
  {
    key: 'cit-half-year',
    title: 'ยื่นแบบ ภ.ง.ด.51 ภาษีนิติบุคคลครึ่งปี',
    detail: 'ภายใน 2 เดือนนับจากวันครบ 6 เดือนของรอบบัญชี (รอบบัญชีปีปฏิทิน)',
    audience: ['company'],
    rule: { kind: 'yearly', month: 8, day: 31 },
    to: '/calculator/corporate',
  },
]
