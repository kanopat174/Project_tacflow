<script setup lang="ts">
/**
 * สำรองและกู้คืนข้อมูลของบัญชีที่ล็อกอินอยู่เป็นไฟล์ JSON
 * ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์เครื่องเดียว ไฟล์นี้คือทางย้ายเครื่องและกันข้อมูลหาย
 */
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { ApiError, backupApi } from '@/services/api'
import {
  BACKUP_APP,
  BACKUP_VERSION,
  BackupError,
  backupCounts,
  parseBackup,
  type BackupFile,
} from '@/services/backup'
import { downloadText, safeFilename } from '@/services/download'
import { thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { DRAFT_KEY } from '@/stores/filing'
import { gameStorageKey } from '@/stores/game'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()

const busy = ref(false)
const input = ref<HTMLInputElement | null>(null)

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function exportBackup() {
  if (!auth.user) return
  busy.value = true
  try {
    const { account, data, files } = await backupApi.exportData()
    const backup: BackupFile = {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      account,
      data,
      files,
      extras: { draft: readLocal(DRAFT_KEY), game: readLocal(gameStorageKey(auth.user.id)) },
    }
    downloadText(
      `${safeFilename(`taxflow-${account.username}-${localToday()}`)}.json`,
      JSON.stringify(backup),
      'application/json',
    )
    const c = backupCounts(data)
    toast.success(`สำรองแล้ว: สมุด ${c.workspaces} เล่ม รายการ ${c.entries} รายการ แบบภาษี ${c.filings} ฉบับ`)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'สำรองข้อมูลไม่สำเร็จ')
  } finally {
    busy.value = false
  }
}

async function importBackup(files: FileList | null) {
  const file = files?.[0]
  if (input.value) input.value.value = ''
  if (!file || !auth.user) return

  let backup: BackupFile
  try {
    backup = parseBackup(await file.text())
  } catch (error) {
    toast.error(error instanceof BackupError ? error.message : 'อ่านไฟล์สำรองไม่สำเร็จ')
    return
  }

  const c = backupCounts(backup.data)
  const from = backup.account.username ? ` ของบัญชี ${backup.account.username}` : ''
  const when = backup.exportedAt ? ` (สำรองเมื่อ ${thaiDate(backup.exportedAt)})` : ''
  const ok = confirm(
    `กู้คืนไฟล์สำรอง${from}${when}\n\n` +
      `สมุด ${c.workspaces} เล่ม · รายการ ${c.entries} · หลักฐาน ${c.evidence} · แบบภาษี ${c.filings}\n\n` +
      `ข้อมูลเดิมของบัญชี ${auth.user.username} ในเครื่องนี้จะถูกแทนที่ทั้งหมด ยืนยันหรือไม่?`,
  )
  if (!ok) return

  busy.value = true
  try {
    await backupApi.importData(backup)
    try {
      if (backup.extras.draft) localStorage.setItem(DRAFT_KEY, backup.extras.draft)
      if (backup.extras.game) localStorage.setItem(gameStorageKey(auth.user.id), backup.extras.game)
    } catch {
      /* พื้นที่เต็ม — ข้อมูลหลักกู้คืนแล้ว แบบร่างกับความคืบหน้าเกมไม่ใช่ข้อมูลสำคัญ */
    }
    toast.success('กู้คืนข้อมูลแล้ว กำลังโหลดหน้าใหม่')
    // ทุก store ถือข้อมูลชุดเก่าไว้ในหน่วยความจำ โหลดหน้าใหม่ให้อ่านจากที่เก็บอีกรอบ
    setTimeout(() => window.location.reload(), 600)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'กู้คืนข้อมูลไม่สำเร็จ')
    busy.value = false
  }
}
</script>

<template>
  <section class="card backup-panel">
    <div class="card-head">
      <div>
        <h3>สำรองและกู้คืนข้อมูล</h3>
        <p>
          ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ล้างเบราว์เซอร์หรือเปลี่ยนเครื่องแล้วจะหาย
          สำรองเป็นไฟล์ไว้เป็นระยะ แล้วกู้คืนในเครื่องใหม่ได้
        </p>
      </div>
    </div>
    <div class="stack" style="display: grid; gap: 8px">
      <button class="btn btn-primary btn-block" type="button" :disabled="busy" @click="exportBackup">
        <AppIcon name="download" :size="17" />
        ดาวน์โหลดไฟล์สำรอง (.json)
      </button>
      <label class="btn btn-ghost btn-block" :class="{ disabled: busy }">
        <AppIcon name="upload" :size="17" />
        กู้คืนจากไฟล์สำรอง
        <input
          ref="input"
          type="file"
          accept=".json,application/json"
          class="sr-only"
          :disabled="busy"
          @change="importBackup(($event.target as HTMLInputElement).files)"
        />
      </label>
    </div>
    <p class="small muted mt-1">
      ไฟล์มีข้อมูลส่วนตัวและรูปหลักฐานทั้งหมด (ไม่มีรหัสผ่าน) เก็บไว้ในที่ปลอดภัย
    </p>
  </section>
</template>
