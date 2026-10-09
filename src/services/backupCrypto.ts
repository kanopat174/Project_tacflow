/**
 * เข้ารหัสไฟล์สำรองด้วยรหัสผ่าน — Web Crypto ของเบราว์เซอร์ ไม่ใช้ไลบรารีเพิ่ม
 *
 * ไฟล์สำรองมีเลขบัตรประชาชน ที่อยู่ และข้อมูลการเงินทั้งหมด มักถูกส่งต่อทาง LINE หรือเก็บใน Drive
 * จึงเข้ารหัสด้วย AES-GCM 256 บิต กุญแจได้จากรหัสผ่านผ่าน PBKDF2-SHA256 (salt สุ่มต่อไฟล์)
 * AES-GCM ตรวจความถูกต้องในตัว รหัสผ่านผิดหรือไฟล์ถูกแก้จะถอดไม่ได้เลย ไม่ได้ข้อมูลเพี้ยนออกมา
 */

export const ENCRYPTED_APP = 'taxflow-encrypted'
export const ENCRYPTED_VERSION = 1
/** รอบ PBKDF2 ตามคำแนะนำ OWASP สำหรับ SHA-256 */
export const PBKDF2_ITERATIONS = 600_000
export const BACKUP_PASSWORD_MIN = 8

export interface EncryptedBackup {
  app: typeof ENCRYPTED_APP
  version: typeof ENCRYPTED_VERSION
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  data: string
}

export class BackupPasswordError extends Error {}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** สร้างกุญแจ AES จากรหัสผ่าน — non-extractable จึงเก็บใน IndexedDB ได้โดยไม่มีใครอ่านกุญแจออกมา */
export async function deriveBackupKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16))
}

/** เข้ารหัสด้วยกุญแจที่สร้างไว้แล้ว (ใช้กับการสำรองอัตโนมัติที่ไม่ถามรหัสผ่านทุกครั้ง) */
export async function encryptWithKey(
  plain: string,
  key: CryptoKey,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  const file: EncryptedBackup = {
    app: ENCRYPTED_APP,
    version: ENCRYPTED_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
  }
  return JSON.stringify(file)
}

export async function encryptBackup(plain: string, password: string): Promise<string> {
  const salt = randomSalt()
  return encryptWithKey(plain, await deriveBackupKey(password, salt), salt)
}

/** ไฟล์นี้เป็นไฟล์สำรองที่เข้ารหัสไว้หรือไม่ */
export function isEncryptedBackup(text: string): boolean {
  try {
    const raw = JSON.parse(text) as Partial<EncryptedBackup>
    return raw?.app === ENCRYPTED_APP
  } catch {
    return false
  }
}

export async function decryptBackup(text: string, password: string): Promise<string> {
  const raw = JSON.parse(text) as Partial<EncryptedBackup>
  if (raw.app !== ENCRYPTED_APP || raw.version !== ENCRYPTED_VERSION || !raw.salt || !raw.iv || !raw.data) {
    throw new BackupPasswordError('ไฟล์สำรองที่เข้ารหัสเสียหายหรือเป็นรุ่นที่ไม่รองรับ')
  }
  const iterations = Number(raw.iterations) || PBKDF2_ITERATIONS
  const key = await deriveBackupKey(password, fromBase64(raw.salt), iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(raw.iv) }, key, fromBase64(raw.data))
    return new TextDecoder().decode(plain)
  } catch {
    throw new BackupPasswordError('รหัสผ่านไม่ถูกต้อง หรือไฟล์ถูกแก้ไข')
  }
}
