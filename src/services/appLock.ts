/**
 * ล็อกแอปด้วย PIN — กันคนในบ้านหรือคนยืมเครื่องเปิดดูข้อมูลภาษี
 *
 * ข้อจำกัด: เป็นการล็อกหน้าจอเท่านั้น ข้อมูลใน localStorage ยังไม่ได้เข้ารหัส
 * คนที่เปิด DevTools ของเบราว์เซอร์ยังอ่านได้ — กันได้แค่การเปิดแอปดูตรง ๆ
 *
 * เก็บเฉพาะ hash ของ PIN (PBKDF2-SHA256 + salt สุ่ม) ไม่เก็บ PIN
 * ใส่ผิดติดกันเกิน MAX_FREE_ATTEMPTS ครั้งต้องรอนานขึ้นเรื่อย ๆ
 */

export const PIN_PATTERN = /^\d{4,6}$/
export const PIN_ERROR = 'PIN ต้องเป็นตัวเลข 4–6 หลัก'
export const MAX_FREE_ATTEMPTS = 5
const PIN_ITERATIONS = 150_000

/** ล็อกเมื่อไม่ได้ใช้งานกี่นาที — 0 คือล็อกเฉพาะตอนเปิดเว็บใหม่ */
export const IDLE_OPTIONS = [1, 5, 15, 30, 0] as const
export const DEFAULT_IDLE_MINUTES = 5

export interface PinRecord {
  salt: string
  hash: string
  iterations: number
  idleMinutes: number
}

export interface LockoutState {
  fails: number
  /** เวลา (ms) ที่ใส่ PIN ได้อีกครั้ง */
  until: number
}

export const pinStorageKey = (userId: string) => `taxflow_pin_${userId}`
const lockoutKey = (userId: string) => `taxflow_pin_lockout_${userId}`

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256)
  return toHex(bits)
}

/** เทียบแบบใช้เวลาเท่ากันทุกกรณี ไม่บอกใบ้ว่าตรงไปกี่ตัว */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function readPin(userId: string): PinRecord | null {
  try {
    const raw = localStorage.getItem(pinStorageKey(userId))
    const parsed = raw ? (JSON.parse(raw) as PinRecord) : null
    return parsed?.hash && parsed.salt ? parsed : null
  } catch {
    return null
  }
}

export async function setPin(userId: string, pin: string, idleMinutes = DEFAULT_IDLE_MINUTES): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new Error(PIN_ERROR)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const record: PinRecord = {
    salt: toHex(salt),
    hash: await hashPin(pin, salt, PIN_ITERATIONS),
    iterations: PIN_ITERATIONS,
    idleMinutes,
  }
  localStorage.setItem(pinStorageKey(userId), JSON.stringify(record))
  clearLockout(userId)
}

export function setIdleMinutes(userId: string, idleMinutes: number): void {
  const record = readPin(userId)
  if (!record) return
  localStorage.setItem(pinStorageKey(userId), JSON.stringify({ ...record, idleMinutes }))
}

export function removePin(userId: string): void {
  try {
    localStorage.removeItem(pinStorageKey(userId))
  } catch {
    /* ไม่มีอะไรให้ลบ */
  }
  clearLockout(userId)
}

export async function checkPin(userId: string, pin: string): Promise<boolean> {
  const record = readPin(userId)
  if (!record) return true
  const hash = await hashPin(pin, fromHex(record.salt), record.iterations)
  return sameHash(hash, record.hash)
}

/* ---------- กันเดา PIN ---------- */

export function readLockout(userId: string): LockoutState {
  try {
    const raw = localStorage.getItem(lockoutKey(userId))
    const parsed = raw ? (JSON.parse(raw) as LockoutState) : null
    return { fails: Number(parsed?.fails) || 0, until: Number(parsed?.until) || 0 }
  } catch {
    return { fails: 0, until: 0 }
  }
}

/** ระยะรอหลังใส่ผิดครั้งที่ fails — ฟรี 5 ครั้งแรก จากนั้น 30 วินาที แล้วเพิ่มเท่าตัว สูงสุด 1 ชั่วโมง */
export function lockoutDelayMs(fails: number): number {
  if (fails < MAX_FREE_ATTEMPTS) return 0
  return Math.min(30_000 * 2 ** (fails - MAX_FREE_ATTEMPTS), 3_600_000)
}

export function recordFailure(userId: string, now = Date.now()): LockoutState {
  const fails = readLockout(userId).fails + 1
  const state = { fails, until: now + lockoutDelayMs(fails) }
  try {
    localStorage.setItem(lockoutKey(userId), JSON.stringify(state))
  } catch {
    /* เก็บไม่ได้ก็ยังกันได้ในรอบนี้ */
  }
  return state
}

export function clearLockout(userId: string): void {
  try {
    localStorage.removeItem(lockoutKey(userId))
  } catch {
    /* ไม่มีอะไรให้ลบ */
  }
}
