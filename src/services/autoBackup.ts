/**
 * สำรองข้อมูลอัตโนมัติลงโฟลเดอร์ในเครื่อง — File System Access API (Chrome/Edge บนคอมพิวเตอร์)
 *
 * ผู้ใช้เลือกโฟลเดอร์ครั้งเดียว (เช่นโฟลเดอร์ Google Drive/OneDrive ที่ซิงก์อยู่) แล้วเว็บเขียนไฟล์สำรองให้
 * ทุก AUTO_BACKUP_DAYS วันตอนเปิดเว็บ เก็บไว้ AUTO_BACKUP_KEEP ไฟล์ล่าสุด
 *
 * ตั้งรหัสผ่านไว้ได้: เก็บเฉพาะกุญแจ AES แบบ non-extractable ใน IndexedDB ไม่เก็บรหัสผ่าน
 * ไฟล์ที่ได้กู้คืนด้วยรหัสผ่านเดิม
 *
 * เบราว์เซอร์อาจถามสิทธิ์เขียนโฟลเดอร์อีกครั้งหลังปิดเว็บ — ตอนเปิดเว็บเงียบ ๆ จะไม่ถาม (ต้องมีการกดของผู้ใช้)
 * จึงคืนสถานะ no-permission ให้หน้าโปรไฟล์แสดงปุ่ม "สำรองตอนนี้" แทน
 */

import { buildBackup } from './backupExport'
import { deriveBackupKey, encryptWithKey, PBKDF2_ITERATIONS, randomSalt } from './backupCrypto'
import { markBackedUp } from './storageSafety'
import { safeFilename } from './download'
import { localToday } from '@/stores/ledger'

export const AUTO_BACKUP_DAYS = 7
export const AUTO_BACKUP_KEEP = 8
const FILE_PREFIX = 'jodwise-backup-'

type Permission = 'granted' | 'denied' | 'prompt'

/** ส่วนของ File System Access API ที่ใช้ — บางเมธอดยังไม่อยู่ใน lib.dom ของ TypeScript */
interface DirHandle {
  name: string
  queryPermission(options: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(options: { mode: 'readwrite' }): Promise<Permission>
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterable<string>
}

interface AutoBackupRecord {
  dir: DirHandle
  key: CryptoKey | null
  salt: Uint8Array | null
  iterations: number
  lastRun: string
}

export function autoBackupSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof indexedDB !== 'undefined'
}

/* ---------- IndexedDB (เก็บ handle ของโฟลเดอร์และกุญแจ ซึ่ง localStorage เก็บไม่ได้) ---------- */

const DB_NAME = 'jodwise-auto-backup'
const STORE = 'settings'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

const readRecord = (userId: string) => idb<AutoBackupRecord | undefined>('readonly', (s) => s.get(userId))
const writeRecord = (userId: string, record: AutoBackupRecord) => idb('readwrite', (s) => s.put(record, userId))
const deleteRecord = (userId: string) => idb('readwrite', (s) => s.delete(userId))

/* ---------- การตั้งค่า ---------- */

export interface AutoBackupStatus {
  enabled: boolean
  folder: string
  encrypted: boolean
  lastRun: string
  permission: Permission | null
}

export async function autoBackupStatus(userId: string): Promise<AutoBackupStatus> {
  if (!autoBackupSupported()) return { enabled: false, folder: '', encrypted: false, lastRun: '', permission: null }
  const record = await readRecord(userId).catch(() => undefined)
  if (!record) return { enabled: false, folder: '', encrypted: false, lastRun: '', permission: null }
  return {
    enabled: true,
    folder: record.dir.name,
    encrypted: !!record.key,
    lastRun: record.lastRun,
    permission: await record.dir.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as const),
  }
}

/** เลือกโฟลเดอร์และเปิดการสำรองอัตโนมัติ — ต้องเรียกจากการกดปุ่มของผู้ใช้ */
export async function enableAutoBackup(userId: string, password: string): Promise<void> {
  const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker
  const dir = await picker({ id: 'jodwise-backup', mode: 'readwrite' })
  const salt = password ? randomSalt() : null
  const key = salt ? await deriveBackupKey(password, salt) : null
  await writeRecord(userId, { dir, key, salt, iterations: PBKDF2_ITERATIONS, lastRun: '' })
  await runAutoBackup(userId, { force: true, interactive: true })
}

export async function disableAutoBackup(userId: string): Promise<void> {
  await deleteRecord(userId)
}

export type AutoBackupResult = 'done' | 'not-due' | 'no-permission' | 'off' | 'error'

/**
 * สำรองถ้าถึงรอบแล้ว (หรือ force) — interactive คือเรียกจากการกดปุ่ม ขอสิทธิ์โฟลเดอร์ได้
 * ไม่โยน error: การสำรองอัตโนมัติล้มเหลวต้องไม่ทำให้หน้าเว็บพัง
 */
let running: Promise<AutoBackupResult> | null = null

export function runAutoBackup(
  userId: string,
  options: { force?: boolean; interactive?: boolean } = {},
): Promise<AutoBackupResult> {
  // หน้าเว็บเรียกซ้ำได้หลายครั้งระหว่างโหลด — รอบที่กำลังเขียนอยู่ใช้ร่วมกัน ไม่เขียนไฟล์ซ้อน
  if (!running) running = backupOnce(userId, options).finally(() => (running = null))
  return running
}

async function backupOnce(
  userId: string,
  options: { force?: boolean; interactive?: boolean },
): Promise<AutoBackupResult> {
  if (!autoBackupSupported()) return 'off'
  try {
    const record = await readRecord(userId)
    if (!record) return 'off'
    const today = localToday()
    if (!options.force && record.lastRun && daysSince(record.lastRun, today) < AUTO_BACKUP_DAYS) return 'not-due'

    let permission = await record.dir.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted' && options.interactive) {
      permission = await record.dir.requestPermission({ mode: 'readwrite' })
    }
    if (permission !== 'granted') return 'no-permission'

    const backup = await buildBackup(userId)
    const plain = JSON.stringify(backup)
    const text = record.key && record.salt ? await encryptWithKey(plain, record.key, record.salt, record.iterations) : plain
    const name = `${FILE_PREFIX}${safeFilename(backup.account.username)}-${today}.json`
    const writable = await (await record.dir.getFileHandle(name, { create: true })).createWritable()
    await writable.write(text)
    await writable.close()
    await prune(record.dir, backup.account.username)

    await writeRecord(userId, { ...record, lastRun: today })
    markBackedUp(userId, today)
    return 'done'
  } catch {
    return 'error'
  }
}

function daysSince(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** เก็บเฉพาะไฟล์สำรองอัตโนมัติล่าสุดของบัญชีนี้ — ไฟล์อื่นในโฟลเดอร์ไม่แตะ */
async function prune(dir: DirHandle, username: string): Promise<void> {
  const prefix = `${FILE_PREFIX}${safeFilename(username)}-`
  const names: string[] = []
  for await (const name of dir.keys()) {
    if (name.startsWith(prefix) && /-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name)
  }
  names.sort().reverse()
  for (const name of names.slice(AUTO_BACKUP_KEEP)) await dir.removeEntry(name).catch(() => undefined)
}
