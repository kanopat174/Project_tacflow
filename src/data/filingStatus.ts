/** ขั้นตอนการพิจารณาแบบภาษีหลังยื่น — ใช้ร่วมกันระหว่างหน้าประวัติและหน้าติดตามสถานะ */
import type { FilingStatus } from '@/services/api'

export interface StatusMeta {
  label: string
  badge: string
  description: string
}

export const STATUS_META: Record<FilingStatus, StatusMeta> = {
  submitted: {
    label: 'ยื่นแบบแล้ว',
    badge: 'badge-accent',
    description: 'ระบบรับแบบของคุณเข้าคิวส่งต่อให้กรมสรรพากรเรียบร้อย',
  },
  received: {
    label: 'สรรพากรรับแบบ',
    badge: 'badge-accent',
    description: 'แบบภาษีเข้าสู่ระบบของกรมสรรพากรและได้รับเลขรับแล้ว',
  },
  reviewing: {
    label: 'อยู่ระหว่างตรวจสอบ',
    badge: 'badge-warn',
    description: 'เจ้าหน้าที่กำลังตรวจความถูกต้องของเงินได้และเอกสารลดหย่อน',
  },
  completed: {
    label: 'เสร็จสิ้น',
    badge: 'badge-ok',
    description: 'การพิจารณาเสร็จสมบูรณ์ ดูยอดชำระหรือยอดคืนภาษีได้ด้านล่าง',
  },
}

/** ลำดับสถานะสำหรับวาด timeline */
export const STATUS_FLOW: FilingStatus[] = ['submitted', 'received', 'reviewing', 'completed']
