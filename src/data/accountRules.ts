/**
 * กติกาของบัญชีผู้ใช้ — ใช้ร่วมกันทั้งฝั่งหน้าจอและชั้น API
 * เก็บไว้ที่เดียวเพื่อไม่ให้ข้อความที่บอกผู้ใช้กับกฎที่บังคับใช้จริงหลุดจากกัน
 */

/** อนุญาตตัวอักษรอังกฤษ ตัวเลข จุด ขีดล่าง และขีดกลาง ยาว 4–20 ตัว */
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,20}$/

export const USERNAME_HINT = 'ตัวอักษรภาษาอังกฤษ ตัวเลข จุด ขีดล่าง หรือขีดกลาง ยาว 4–20 ตัว'

export const USERNAME_ERROR = `username ต้องเป็น${USERNAME_HINT}`

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_ERROR = `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** ตรวจ username ตามกติกาเดียวกับที่ API ใช้ */
export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim())
}

/**
 * คีย์ที่ใช้เทียบความซ้ำและใช้ค้นหาตอนล็อกอิน
 * เก็บ username ตามที่ผู้ใช้พิมพ์ไว้แสดงผล แต่เทียบกันแบบไม่สนตัวพิมพ์เล็กใหญ่
 */
export function usernameKey(value: string): string {
  return value.trim().toLowerCase()
}

/* ---------- ชื่อ-นามสกุล ---------- */

export const FULL_NAME_MIN = 2
export const FULL_NAME_MAX = 100
export const FULL_NAME_ERROR = 'กรุณากรอกชื่อ-นามสกุล'

export function isValidFullName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= FULL_NAME_MIN && trimmed.length <= FULL_NAME_MAX
}

/* ---------- ตัวช่วยตัวเลข ---------- */

/** เก็บเฉพาะตัวเลข ทิ้งขีด วงเล็บ ช่องว่าง และอักขระอื่นทั้งหมด */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/\D/g, '')
}

/* ---------- เลขประจำตัวประชาชน ---------- */

export const CITIZEN_ID_LENGTH = 13
export const CITIZEN_ID_ERROR = 'เลขประจำตัวประชาชนต้องมี 13 หลัก'
export const CITIZEN_ID_CHECKSUM_WARNING =
  'เลข 13 หลักนี้ไม่ผ่านการตรวจหลักสุดท้าย อาจพิมพ์ผิด กรุณาตรวจสอบกับบัตรประชาชนอีกครั้ง'

export function isValidCitizenId(value: string): boolean {
  return digitsOnly(value).length === CITIZEN_ID_LENGTH
}

/**
 * ตรวจหลักตรวจสอบ (check digit) ตัวสุดท้ายของเลขประจำตัวประชาชน
 *
 * นำ 12 หลักแรกคูณด้วยน้ำหนัก 13 ลงมาถึง 2 แล้วรวมกัน
 * หลักที่ 13 ต้องเท่ากับ (11 − ผลรวม mod 11) mod 10
 *
 * ใช้เป็น "คำเตือน" ไม่ใช่ตัวบล็อก เพราะระบบนี้เป็นงานเพื่อการศึกษา
 * ผู้ทดสอบมักกรอกเลขสมมติที่ไม่ผ่านสูตรนี้
 */
export function isCitizenIdChecksumValid(value: string): boolean {
  const digits = digitsOnly(value)
  if (digits.length !== CITIZEN_ID_LENGTH) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (13 - i)
  }
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

/** จัดรูปแบบเป็น X-XXXX-XXXXX-XX-X ตามหน้าบัตรประชาชน */
export function formatCitizenId(value: string): string {
  const d = digitsOnly(value).slice(0, CITIZEN_ID_LENGTH)
  const parts = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)]
  return parts.filter(Boolean).join('-')
}

/* ---------- เบอร์โทรศัพท์ ---------- */

export const PHONE_ERROR = 'เบอร์โทรศัพท์ต้องมี 9 หรือ 10 หลัก และขึ้นต้นด้วย 0'

/** เบอร์ในไทยมี 9 หลัก (บ้าน) หรือ 10 หลัก (มือถือ) และขึ้นต้นด้วย 0 */
export function isValidPhone(value: string): boolean {
  const d = digitsOnly(value)
  return (d.length === 9 || d.length === 10) && d.startsWith('0')
}

/** จัดรูปแบบเป็น 0XX-XXX-XXXX (มือถือ) หรือ 0X-XXX-XXXX (บ้าน) */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}
