/**
 * ภาษีเงินได้หัก ณ ที่จ่าย สำหรับการจ่ายเงินในประเทศ
 * อัตราอ้างอิงคำสั่งกรมสรรพากร ท.ป.4/2528 และที่แก้ไขเพิ่มเติม
 */

export type PayeeType = 'individual' | 'juristic'

export interface WithholdingType {
  key: string
  label: string
  hint: string
  /** อัตราตามประเภทผู้รับเงิน — null คือหักไม่ได้สำหรับผู้รับประเภทนั้น */
  rates: Record<PayeeType, number | null>
  /** แบบที่ใช้ยื่นนำส่ง */
  forms: Record<PayeeType, string>
}

export const WITHHOLDING_TYPES: WithholdingType[] = [
  {
    key: 'service',
    label: 'ค่าจ้างทำของ / ค่าบริการ',
    hint: 'งานรับจ้างทำของ ค่าที่ปรึกษา ค่าบริการทั่วไป',
    rates: { individual: 0.03, juristic: 0.03 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'profession',
    label: 'ค่าวิชาชีพอิสระ',
    hint: 'กฎหมาย บัญชี วิศวกรรม สถาปัตยกรรม การประกอบโรคศิลปะ ประณีตศิลป์',
    rates: { individual: 0.03, juristic: 0.03 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'rent',
    label: 'ค่าเช่าอสังหาริมทรัพย์',
    hint: 'ค่าเช่าอาคาร ที่ดิน และทรัพย์สินอื่น',
    rates: { individual: 0.05, juristic: 0.05 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'transport',
    label: 'ค่าขนส่ง',
    hint: 'ผู้รับต้องเป็นผู้ประกอบการขนส่งที่ไม่ใช่ขนส่งสาธารณะ',
    rates: { individual: 0.01, juristic: 0.01 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'advertising',
    label: 'ค่าโฆษณา',
    hint: 'จ่ายให้บริษัทรับทำโฆษณาหรือเอเจนซี',
    rates: { individual: 0.02, juristic: 0.02 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'royalty',
    label: 'ค่าสิทธิ / ค่าลิขสิทธิ์',
    hint: 'ค่าตอบแทนการใช้สิทธิในทรัพย์สินทางปัญญา',
    rates: { individual: 0.03, juristic: 0.03 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'prize',
    label: 'รางวัล ส่วนลด และการประกวดแข่งขัน',
    hint: 'เงินรางวัลจากการชิงโชคหรือการแข่งขัน',
    rates: { individual: 0.05, juristic: 0.05 },
    forms: { individual: 'ภ.ง.ด.3', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'dividend',
    label: 'เงินปันผล',
    hint: 'เงินปันผลจากบริษัทที่ตั้งขึ้นตามกฎหมายไทย',
    rates: { individual: 0.1, juristic: 0.1 },
    forms: { individual: 'ภ.ง.ด.2', juristic: 'ภ.ง.ด.2' },
  },
  {
    key: 'interest',
    label: 'ดอกเบี้ย',
    hint: 'ดอกเบี้ยเงินฝาก หุ้นกู้ และเงินให้กู้ยืม',
    rates: { individual: 0.15, juristic: 0.01 },
    forms: { individual: 'ภ.ง.ด.2', juristic: 'ภ.ง.ด.53' },
  },
  {
    key: 'insurancePremium',
    label: 'เบี้ยประกันวินาศภัย',
    hint: 'จ่ายให้บริษัทประกันวินาศภัยที่ประกอบกิจการในไทย',
    rates: { individual: null, juristic: 0.01 },
    forms: { individual: '-', juristic: 'ภ.ง.ด.53' },
  },
]

export const PAYEE_TYPES = [
  { value: 'individual' as const, label: 'บุคคลธรรมดา' },
  { value: 'juristic' as const, label: 'นิติบุคคล' },
]

export const WITHHOLDING_NOTE =
  'ภาษีหัก ณ ที่จ่ายคำนวณจากยอดก่อนภาษีมูลค่าเพิ่มเสมอ และต้องนำส่งภายในวันที่ 7 ของเดือนถัดไป พร้อมออกหนังสือรับรองการหักภาษีให้ผู้รับเงิน'
