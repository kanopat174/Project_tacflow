/**
 * สร้างไฟล์สำรองของบัญชีที่ล็อกอินอยู่ และคืนค่าข้อมูลเสริมในเครื่องตอนกู้คืน
 * ใช้ร่วมกันระหว่างปุ่มสำรองเอง (BackupPanel) และการสำรองอัตโนมัติ (autoBackup)
 */

import { backupApi } from './api'
import { BACKUP_APP, BACKUP_VERSION, type BackupFile } from './backup'
import { memoryStorageKey } from './entryMemory'
import { fundStorageKey } from './fundHoldings'
import { DRAFT_KEY } from '@/stores/filing'
import { gameStorageKey } from '@/stores/game'

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function buildBackup(userId: string): Promise<BackupFile> {
  const { account, data, files } = await backupApi.exportData()
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    account,
    data,
    files,
    extras: {
      draft: readLocal(DRAFT_KEY),
      game: readLocal(gameStorageKey(userId)),
      memory: readLocal(memoryStorageKey(userId)),
      funds: readLocal(fundStorageKey(userId)),
    },
  }
}

/** เขียนข้อมูลเสริมกลับลงเครื่อง — พื้นที่เต็มก็ข้าม เพราะข้อมูลหลักกู้คืนแล้ว */
export function restoreExtras(backup: BackupFile, userId: string): void {
  const pairs: [string, string | null][] = [
    [DRAFT_KEY, backup.extras.draft],
    [gameStorageKey(userId), backup.extras.game],
    [memoryStorageKey(userId), backup.extras.memory],
    [fundStorageKey(userId), backup.extras.funds],
  ]
  for (const [key, value] of pairs) {
    if (!value) continue
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ข้ามรายการที่เขียนไม่ได้ */
    }
  }
}
