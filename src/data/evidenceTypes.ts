/** ชนิดของหลักฐานที่แนบกับรายการในสมุดบัญชี */

export type EvidenceKind = 'receipt' | 'slip' | 'document'
export type EvidenceDirection = 'income' | 'expense'

export interface EvidenceKindOption {
  value: EvidenceKind
  label: string
  hint: string
  icon: string
}

export const EVIDENCE_KINDS: EvidenceKindOption[] = [
  {
    value: 'receipt',
    label: 'ใบเสร็จ',
    hint: 'ใบเสร็จรับเงิน ใบกำกับภาษี หรือใบเสร็จจากร้านค้า',
    icon: 'receipt',
  },
  {
    value: 'slip',
    label: 'สลิปโอนเงิน',
    hint: 'สลิปจากแอปธนาคาร พร้อมเพย์ หรือหลักฐานการโอน',
    icon: 'wallet',
  },
  {
    value: 'document',
    label: 'เอกสาร',
    hint: 'ใบแจ้งหนี้ สัญญา หรือเอกสารประกอบอื่น',
    icon: 'file',
  },
]

export const EVIDENCE_DIRECTIONS: { value: EvidenceDirection; label: string; icon: string }[] = [
  { value: 'income', label: 'หลักฐานการรับเงิน', icon: 'download' },
  { value: 'expense', label: 'หลักฐานการจ่ายเงิน', icon: 'upload' },
]

export function evidenceKindLabel(kind: EvidenceKind): string {
  return EVIDENCE_KINDS.find((k) => k.value === kind)?.label ?? 'เอกสาร'
}

export function evidenceDirectionLabel(direction: EvidenceDirection): string {
  return EVIDENCE_DIRECTIONS.find((d) => d.value === direction)?.label ?? 'หลักฐาน'
}

/** ชนิดไฟล์ที่รับ และเพดานขนาดก่อนบีบอัด */
export const ACCEPTED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

/** ภาพจะถูกย่อให้ด้านยาวสุดไม่เกินค่านี้ก่อนเก็บ เพื่อไม่ให้กินพื้นที่เบราว์เซอร์เกินจำเป็น */
export const IMAGE_MAX_EDGE = 1600
export const IMAGE_QUALITY = 0.72
