/**
 * ความคืบหน้าของแบบภาษีที่บันทึกไว้ — ใช้ร่วมกันระหว่างหน้าประวัติและหน้าสรุปแบบ
 *
 * TaxFlow ไม่ได้ส่งแบบให้กรมสรรพากรเอง ผู้ใช้ต้องนำตัวเลขไปยื่นที่ระบบ e-Filing ด้วยตัวเอง
 * สถานะจึงเลื่อนเมื่อผู้ใช้กดอัปเดตเท่านั้น ไม่เปลี่ยนเองตามเวลาเหมือนเดิม
 */
import type { FilingStatus } from '@/services/api'

/** ระบบยื่นแบบออนไลน์ของกรมสรรพากร */
export const E_FILING_URL = 'https://efiling.rd.go.th'

export interface StatusMeta {
  label: string
  badge: string
  description: string
  /** ข้อความบนปุ่มที่พาไปสถานะนี้ */
  action: string
}

export const STATUS_META: Record<FilingStatus, StatusMeta> = {
  submitted: {
    label: 'บันทึกสรุปแล้ว',
    badge: 'badge-muted',
    description: 'ยังไม่ได้ยื่นจริง นำตัวเลขในสรุปนี้ไปกรอกที่ระบบ e-Filing ของกรมสรรพากรด้วยตัวเอง',
    action: 'ย้อนกลับเป็นยังไม่ได้ยื่น',
  },
  received: {
    label: 'ยื่นที่ e-Filing แล้ว',
    badge: 'badge-accent',
    description: 'คุณยื่นแบบกับกรมสรรพากรเรียบร้อย เก็บเลขอ้างอิงจาก e-Filing ไว้ใช้ติดตามผล',
    action: 'ฉันยื่นแบบที่ e-Filing แล้ว',
  },
  reviewing: {
    label: 'รอผลจากสรรพากร',
    badge: 'badge-warn',
    description: 'กรมสรรพากรกำลังตรวจสอบแบบ ดูสถานะล่าสุดได้ที่ระบบ e-Filing',
    action: 'สรรพากรกำลังตรวจสอบ',
  },
  completed: {
    label: 'ปิดเรื่องแล้ว',
    badge: 'badge-ok',
    description: 'ชำระภาษีเพิ่มหรือได้รับเงินคืนเรียบร้อยแล้ว',
    action: 'ชำระ/ได้เงินคืนเรียบร้อยแล้ว',
  },
}

/** ลำดับสถานะสำหรับวาด timeline */
export const STATUS_FLOW: FilingStatus[] = ['submitted', 'received', 'reviewing', 'completed']
