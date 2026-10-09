/**
 * กันข้อมูลหาย — ข้อมูลทั้งหมดอยู่ใน localStorage/IndexedDB ของเบราว์เซอร์เครื่องเดียว
 *
 * - ขอให้เบราว์เซอร์เก็บข้อมูลแบบถาวร (navigator.storage.persist) ไม่ลบเองตอนพื้นที่เครื่องเหลือน้อย
 *   Safari ลบข้อมูลของเว็บที่ไม่ได้เปิดเกิน 7 วันอยู่ดี เว้นแต่ติดตั้งเป็นแอปที่หน้าจอหลัก
 * - จำวันที่สำรองข้อมูลล่าสุด เพื่อเตือนเมื่อไม่ได้สำรองนานเกินไป
 */

import { ref } from 'vue'
import { daysBetween } from './gamification'

/** เตือนให้สำรองเมื่อไม่ได้สำรองมาครบกี่วัน */
export const BACKUP_REMINDER_DAYS = 30

export const lastBackupKey = (userId: string) => `taxflow_last_backup_${userId}`

/** เพิ่มค่าทุกครั้งที่บันทึกวันสำรอง ให้ computed ที่อ่าน localStorage คำนวณใหม่ */
export const backupStamp = ref(0)

/** วันที่สำรองล่าสุด (YYYY-MM-DD) — null คือยังไม่เคยสำรองในเครื่องนี้ */
export function readLastBackup(userId: string): string | null {
  try {
    return localStorage.getItem(lastBackupKey(userId))
  } catch {
    return null
  }
}

export function markBackedUp(userId: string, date: string): void {
  try {
    localStorage.setItem(lastBackupKey(userId), date)
  } catch {
    /* พื้นที่เต็ม — เสียแค่การเตือน ไฟล์สำรองดาวน์โหลดไปแล้ว */
  }
  backupStamp.value++
}

let persistRequested = false

/**
 * ขอเก็บข้อมูลแบบถาวรครั้งเดียวต่อการเปิดเว็บ — Chrome/Edge ตัดสินเองโดยไม่ถามผู้ใช้
 * Firefox อาจถามผู้ใช้ จึงควรเรียกหลังผู้ใช้มีข้อมูลที่ควรเก็บแล้วเท่านั้น
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return false
  persistRequested = true
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage?.persist) return false
  try {
    if (await storage.persisted?.()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/**
 * ต้องเตือนให้สำรองหรือไม่ — ฟังก์ชันบริสุทธิ์
 * นับจากวันสำรองล่าสุด ถ้ายังไม่เคยสำรองนับจากวันสมัคร ไม่มีข้อมูลเลยก็ไม่ต้องเตือน
 * คืนจำนวนวันที่ไม่ได้สำรอง หรือ null ถ้ายังไม่ถึงเวลาเตือน
 */
export function backupOverdueDays(
  lastBackup: string | null,
  createdAt: string,
  today: string,
  hasData: boolean,
): number | null {
  if (!hasData) return null
  const since = lastBackup ?? createdAt.slice(0, 10)
  const days = daysBetween(since, today)
  return days >= BACKUP_REMINDER_DAYS ? days : null
}
