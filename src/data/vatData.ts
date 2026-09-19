/**
 * ภาษีมูลค่าเพิ่ม (VAT)
 * อัตราตามกฎหมายคือ 10% แต่มีพระราชกฤษฎีกาลดเหลือ 7% ต่ออายุเป็นช่วง ๆ
 */

export const VAT_RATE = 0.07
export const VAT_STATUTORY_RATE = 0.1

/** รายรับเกินเกณฑ์นี้ต่อปีต้องจดทะเบียนภาษีมูลค่าเพิ่ม */
export const VAT_REGISTRATION_THRESHOLD = 1_800_000

export interface VatSupplyType {
  key: string
  label: string
  rate: number | null
  hint: string
  /** ขอคืนภาษีซื้อที่เกี่ยวข้องได้หรือไม่ */
  claimableInput: boolean
}

export const VAT_SUPPLY_TYPES: VatSupplyType[] = [
  {
    key: 'standard',
    label: 'ขายสินค้าหรือบริการทั่วไป',
    rate: VAT_RATE,
    hint: 'เสียภาษีมูลค่าเพิ่มอัตรา 7% และขอคืนภาษีซื้อได้',
    claimableInput: true,
  },
  {
    key: 'zeroRated',
    label: 'อัตราศูนย์ เช่น ส่งออก',
    rate: 0,
    hint: 'เสียภาษีอัตรา 0% แต่ยังขอคืนภาษีซื้อได้เต็มจำนวน',
    claimableInput: true,
  },
  {
    key: 'exempt',
    label: 'กิจการที่ได้รับยกเว้น',
    rate: null,
    hint: 'ไม่ต้องเรียกเก็บภาษีขาย แต่ก็ขอคืนภาษีซื้อไม่ได้เช่นกัน',
    claimableInput: false,
  },
]

/** ภาษีซื้อที่กฎหมายห้ามนำมาหัก */
export const NON_CLAIMABLE_INPUT_VAT = [
  'ค่ารับรองและค่าบริการที่ใช้เพื่อการรับรอง',
  'ภาษีซื้อของรถยนต์นั่งและรถโดยสารที่มีที่นั่งไม่เกิน 10 คน',
  'ใบกำกับภาษีที่มีข้อความไม่ครบถ้วนตามที่กฎหมายกำหนด',
  'ภาษีซื้อที่ไม่เกี่ยวข้องโดยตรงกับการประกอบกิจการ',
  'ภาษีซื้อของกิจการที่ได้รับยกเว้นภาษีมูลค่าเพิ่ม',
]

export const VAT_FILING_NOTE =
  'ยื่นแบบ ภ.พ.30 พร้อมชำระภาษีภายในวันที่ 15 ของเดือนถัดไป แม้เดือนนั้นจะไม่มีรายรับก็ต้องยื่น'
