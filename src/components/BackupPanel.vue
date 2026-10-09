<script setup lang="ts">
/**
 * สำรองและกู้คืนข้อมูลของบัญชีที่ล็อกอินอยู่เป็นไฟล์ JSON
 * ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์เครื่องเดียว ไฟล์นี้คือทางย้ายเครื่องและกันข้อมูลหาย
 *  - ตั้งรหัสผ่านได้: ไฟล์ถูกเข้ารหัส AES-GCM ส่งต่อทาง LINE/Drive แล้วคนอื่นเปิดอ่านไม่ได้
 *  - Chrome/Edge บนคอมพิวเตอร์: เลือกโฟลเดอร์ให้สำรองอัตโนมัติทุกสัปดาห์
 */
import { onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { ApiError, backupApi } from '@/services/api'
import { BackupError, backupCounts, parseBackup, type BackupFile } from '@/services/backup'
import {
  BACKUP_PASSWORD_MIN,
  BackupPasswordError,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
} from '@/services/backupCrypto'
import { buildBackup, restoreExtras } from '@/services/backupExport'
import {
  AUTO_BACKUP_DAYS,
  autoBackupStatus,
  autoBackupSupported,
  disableAutoBackup,
  enableAutoBackup,
  runAutoBackup,
  type AutoBackupStatus,
} from '@/services/autoBackup'
import { downloadText, safeFilename } from '@/services/download'
import { thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { markBackedUp } from '@/services/storageSafety'

const auth = useAuthStore()
const toast = useToastStore()

const busy = ref(false)
const input = ref<HTMLInputElement | null>(null)
/** รหัสผ่านสำหรับเข้ารหัสไฟล์ที่ดาวน์โหลด — ว่างคือไม่เข้ารหัส */
const password = ref('')
/** ไฟล์เข้ารหัสที่เลือกมากู้คืน รอผู้ใช้ใส่รหัสผ่าน */
const pendingEncrypted = ref<string | null>(null)
const unlockPassword = ref('')

async function exportBackup() {
  if (!auth.user) return
  if (password.value && password.value.length < BACKUP_PASSWORD_MIN) {
    toast.error(`รหัสผ่านไฟล์สำรองต้องยาวอย่างน้อย ${BACKUP_PASSWORD_MIN} ตัวอักษร`)
    return
  }
  busy.value = true
  try {
    const backup = await buildBackup(auth.user.id)
    const plain = JSON.stringify(backup)
    const encrypted = !!password.value
    const text = encrypted ? await encryptBackup(plain, password.value) : plain
    downloadText(
      `${safeFilename(`taxflow-${backup.account.username}-${localToday()}`)}${encrypted ? '-encrypted' : ''}.json`,
      text,
      'application/json',
    )
    markBackedUp(auth.user.id, localToday())
    const c = backupCounts(backup.data)
    toast.success(
      `สำรองแล้ว${encrypted ? 'แบบเข้ารหัส' : ''}: สมุด ${c.workspaces} เล่ม รายการ ${c.entries} รายการ แบบภาษี ${c.filings} ฉบับ`,
    )
    password.value = ''
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'สำรองข้อมูลไม่สำเร็จ')
  } finally {
    busy.value = false
  }
}

async function pickBackup(files: FileList | null) {
  const file = files?.[0]
  if (input.value) input.value.value = ''
  if (!file || !auth.user) return
  const text = await file.text()
  if (isEncryptedBackup(text)) {
    // ไฟล์เข้ารหัส: รอรหัสผ่านจากช่องในหน้า ไม่ใช้ prompt() เพราะแสดงรหัสเป็นตัวอักษร
    pendingEncrypted.value = text
    unlockPassword.value = ''
    return
  }
  await restore(text)
}

async function unlockAndRestore() {
  if (!pendingEncrypted.value) return
  busy.value = true
  try {
    const plain = await decryptBackup(pendingEncrypted.value, unlockPassword.value)
    pendingEncrypted.value = null
    unlockPassword.value = ''
    busy.value = false
    await restore(plain)
  } catch (error) {
    toast.error(error instanceof BackupPasswordError ? error.message : 'ถอดรหัสไฟล์สำรองไม่สำเร็จ')
    busy.value = false
  }
}

async function restore(text: string) {
  if (!auth.user) return
  let backup: BackupFile
  try {
    backup = parseBackup(text)
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
    restoreExtras(backup, auth.user.id)
    toast.success('กู้คืนข้อมูลแล้ว กำลังโหลดหน้าใหม่')
    // ทุก store ถือข้อมูลชุดเก่าไว้ในหน่วยความจำ โหลดหน้าใหม่ให้อ่านจากที่เก็บอีกรอบ
    setTimeout(() => window.location.reload(), 600)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'กู้คืนข้อมูลไม่สำเร็จ')
    busy.value = false
  }
}

/* ---------- สำรองอัตโนมัติลงโฟลเดอร์ ---------- */

const autoSupported = autoBackupSupported()
const auto = ref<AutoBackupStatus | null>(null)
const autoPassword = ref('')

async function refreshAuto() {
  if (autoSupported && auth.user) auto.value = await autoBackupStatus(auth.user.id)
}
onMounted(refreshAuto)

async function turnOnAuto() {
  if (!auth.user) return
  if (autoPassword.value && autoPassword.value.length < BACKUP_PASSWORD_MIN) {
    toast.error(`รหัสผ่านไฟล์สำรองต้องยาวอย่างน้อย ${BACKUP_PASSWORD_MIN} ตัวอักษร`)
    return
  }
  busy.value = true
  try {
    await enableAutoBackup(auth.user.id, autoPassword.value)
    autoPassword.value = ''
    toast.success(`เปิดสำรองอัตโนมัติแล้ว จะสำรองให้ทุก ${AUTO_BACKUP_DAYS} วันตอนเปิดเว็บ`)
  } catch (error) {
    // ปิดหน้าต่างเลือกโฟลเดอร์เอง ไม่ต้องแจ้ง error
    if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('เปิดสำรองอัตโนมัติไม่สำเร็จ')
  } finally {
    busy.value = false
    await refreshAuto()
  }
}

async function backupNow() {
  if (!auth.user) return
  busy.value = true
  const result = await runAutoBackup(auth.user.id, { force: true, interactive: true })
  busy.value = false
  if (result === 'done') toast.success('สำรองลงโฟลเดอร์แล้ว')
  else if (result === 'no-permission') toast.error('เบราว์เซอร์ไม่อนุญาตให้เขียนโฟลเดอร์ กดอนุญาตแล้วลองอีกครั้ง')
  else toast.error('สำรองลงโฟลเดอร์ไม่สำเร็จ')
  await refreshAuto()
}

async function turnOffAuto() {
  if (!auth.user) return
  await disableAutoBackup(auth.user.id)
  toast.success('ปิดสำรองอัตโนมัติแล้ว ไฟล์เดิมในโฟลเดอร์ยังอยู่')
  await refreshAuto()
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
      <div class="field">
        <label for="backup-password">รหัสผ่านไฟล์สำรอง (แนะนำ)</label>
        <input
          id="backup-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          :placeholder="`อย่างน้อย ${BACKUP_PASSWORD_MIN} ตัวอักษร — ว่างไว้คือไม่เข้ารหัส`"
        />
        <p class="hint">ตั้งรหัสแล้วคนที่ได้ไฟล์ไปเปิดอ่านไม่ได้ ลืมรหัสจะกู้คืนไฟล์นั้นไม่ได้เลย</p>
      </div>
      <button class="btn btn-primary btn-block" type="button" :disabled="busy" @click="exportBackup">
        <AppIcon :name="password ? 'lock' : 'download'" :size="17" />
        ดาวน์โหลดไฟล์สำรอง{{ password ? 'แบบเข้ารหัส' : '' }} (.json)
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
          @change="pickBackup(($event.target as HTMLInputElement).files)"
        />
      </label>

      <form v-if="pendingEncrypted" class="notice" novalidate @submit.prevent="unlockAndRestore">
        <strong>ไฟล์นี้เข้ารหัสไว้</strong>
        <div class="field mt-1">
          <label for="backup-unlock">รหัสผ่านไฟล์สำรอง</label>
          <input id="backup-unlock" v-model="unlockPassword" type="password" autocomplete="off" />
        </div>
        <div class="row" style="gap: 8px">
          <button class="btn btn-primary btn-sm" type="submit" :disabled="busy || !unlockPassword">ถอดรหัสและกู้คืน</button>
          <button class="btn btn-ghost btn-sm" type="button" @click="pendingEncrypted = null">ยกเลิก</button>
        </div>
      </form>
    </div>
    <p class="small muted mt-1">
      ไฟล์มีข้อมูลส่วนตัวและรูปหลักฐานทั้งหมด (ไม่มีรหัสผ่านเข้าระบบ) เก็บไว้ในที่ปลอดภัย
    </p>

    <div v-if="autoSupported" class="auto-backup mt-2" data-test="auto-backup">
      <h4>สำรองอัตโนมัติลงโฟลเดอร์</h4>
      <template v-if="auto?.enabled">
        <p class="small">
          โฟลเดอร์ <strong>{{ auto.folder }}</strong>{{ auto.encrypted ? ' · เข้ารหัส' : '' }}
          · สำรองทุก {{ AUTO_BACKUP_DAYS }} วันตอนเปิดเว็บ
          <template v-if="auto.lastRun"> · ล่าสุด {{ thaiDate(auto.lastRun) }}</template>
        </p>
        <p v-if="auto.permission !== 'granted'" class="small text-warn">
          เบราว์เซอร์ต้องขออนุญาตเขียนโฟลเดอร์อีกครั้ง กด "สำรองตอนนี้" เพื่ออนุญาต
        </p>
        <div class="row" style="gap: 8px">
          <button class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="backupNow">สำรองตอนนี้</button>
          <button class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="turnOffAuto">ปิด</button>
        </div>
      </template>
      <template v-else>
        <p class="small muted">
          เลือกโฟลเดอร์ครั้งเดียว เช่นโฟลเดอร์ Google Drive หรือ OneDrive ในเครื่อง แล้วเว็บจะเขียนไฟล์สำรองให้ทุกสัปดาห์
        </p>
        <div class="field">
          <label for="auto-password">รหัสผ่านไฟล์สำรองอัตโนมัติ (แนะนำ)</label>
          <input
            id="auto-password"
            v-model="autoPassword"
            type="password"
            autocomplete="new-password"
            placeholder="ว่างไว้คือไม่เข้ารหัส"
          />
        </div>
        <button class="btn btn-ghost btn-block" type="button" :disabled="busy" @click="turnOnAuto">
          <AppIcon name="folder" :size="17" />
          เลือกโฟลเดอร์และเปิดสำรองอัตโนมัติ
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.auto-backup {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.auto-backup h4 {
  margin: 0 0 4px;
}
</style>
