/**
 * ภาษีเงินได้นิติบุคคล (Corporate Income Tax)
 * อัตราและเงื่อนไขอ้างอิงประมวลรัษฎากรและพระราชกฤษฎีกาที่เกี่ยวข้อง
 * โปรเจกต์เพื่อการศึกษา — ตรวจสอบอัตราของรอบบัญชีนั้นกับกรมสรรพากรก่อนใช้จริง
 */

export type EntityType = 'sme' | 'standard' | 'foundation'

export interface EntityOption {
  value: EntityType
  label: string
  hint: string
}

export const ENTITY_TYPES: EntityOption[] = [
  {
    value: 'sme',
    label: 'SME — บริษัทหรือห้างหุ้นส่วนนิติบุคคลขนาดเล็ก',
    hint: 'ทุนจดทะเบียนที่ชำระแล้วไม่เกิน 5 ล้านบาท และรายได้ทั้งปีไม่เกิน 30 ล้านบาท',
  },
  {
    value: 'standard',
    label: 'บริษัททั่วไป',
    hint: 'เสียภาษีอัตราคงที่ 20% ของกำไรสุทธิ',
  },
  {
    value: 'foundation',
    label: 'มูลนิธิหรือสมาคม',
    hint: 'เสียภาษีจากรายได้ก่อนหักรายจ่าย 2% หรือ 10% ตามประเภทเงินได้',
  },
]

/** เกณฑ์ที่ทำให้เข้าข่าย SME */
export const SME_CAPITAL_LIMIT = 5_000_000
export const SME_REVENUE_LIMIT = 30_000_000

export interface CorporateBracket {
  cap: number
  rate: number
  label: string
}

/** อัตราภาษีขั้นบันไดของ SME */
export const SME_BRACKETS: CorporateBracket[] = [
  { cap: 300_000, rate: 0, label: 'กำไรสุทธิ 0 – 300,000' },
  { cap: 3_000_000, rate: 0.15, label: '300,001 – 3,000,000' },
  { cap: Number.POSITIVE_INFINITY, rate: 0.2, label: 'เกิน 3,000,000' },
]

/** อัตราคงที่ของบริษัททั่วไป */
export const STANDARD_CIT_RATE = 0.2

/** มูลนิธิ/สมาคม คิดจากรายได้ก่อนหักรายจ่าย */
export const FOUNDATION_RATE_SECTION_8 = 0.02 // เงินได้ตามมาตรา 40(8)
export const FOUNDATION_RATE_OTHER = 0.1 // เงินได้ประเภทอื่น

/** ผลขาดทุนสะสมยกมาหักได้ไม่เกิน 5 รอบบัญชี */
export const LOSS_CARRYFORWARD_YEARS = 5

export const CORPORATE_FORMS = [
  { value: 'ภ.ง.ด.50', label: 'ภ.ง.ด.50 — แบบแสดงรายการประจำรอบบัญชี', hint: 'ยื่นภายใน 150 วันนับแต่วันสุดท้ายของรอบบัญชี' },
  { value: 'ภ.ง.ด.51', label: 'ภ.ง.ด.51 — แบบแสดงรายการครึ่งรอบบัญชี', hint: 'ยื่นภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรก' },
] as const

/** รายจ่ายที่กฎหมายไม่ให้ถือเป็นรายจ่าย ต้องบวกกลับเข้ากำไรสุทธิ */
export const COMMON_ADD_BACKS = [
  'รายจ่ายส่วนตัว ให้โดยเสน่หา หรือการกุศลที่เกินเกณฑ์',
  'ค่ารับรองส่วนที่เกิน 0.3% ของรายได้หรือทุนชำระแล้ว (สูงสุด 10 ล้านบาท)',
  'ค่าปรับและเงินเพิ่มภาษีอากร',
  'รายจ่ายที่พิสูจน์ผู้รับไม่ได้',
  'ค่าเสื่อมราคาส่วนที่เกินอัตราที่กฎหมายกำหนด',
]
