<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import EvidenceThumb from '@/components/EvidenceThumb.vue'
import StagedFileList from '@/components/StagedFileList.vue'
import {
  ACCEPTED_EVIDENCE_TYPES,
  EVIDENCE_DIRECTIONS,
  EVIDENCE_KINDS,
  MAX_EVIDENCE_BYTES,
  type EvidenceDirection,
  type EvidenceKind,
} from '@/data/evidenceTypes'
import { ApiError } from '@/services/api'
import { compressImage, formatBytes } from '@/services/imageCompress'
import { thaiDate } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()

const today = new Date().toISOString().slice(0, 10)
const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const lightbox = ref<string | null>(null)

/* เลือกไฟล์แล้วยังไม่อัปโหลดทันที ต้องกดยืนยันอีกครั้ง จะได้ทันตรวจก่อนว่าหยิบไฟล์ถูกใบ */
const staged = ref<File[]>([])
const showConfirm = ref(false)
const stagedSize = computed(() => staged.value.reduce((sum, f) => sum + f.size, 0))

const form = ref({
  date: today,
  direction: 'expense' as EvidenceDirection,
  kind: 'receipt' as EvidenceKind,
  note: '',
  entryId: '' as string,
})

const filterDirection = ref<'all' | EvidenceDirection>('all')

/** รายการในสมุดเล่มนี้ ให้เลือกผูกหลักฐานเข้ากับรายการได้ */
const entryOptions = computed(() =>
  ledger.entries.slice(0, 60).map((e) => ({
    id: e.id,
    label: `${thaiDate(e.date)} · ${e.type === 'income' ? 'รับ' : 'จ่าย'} ${e.amount.toLocaleString('th-TH')} · ${e.note || '-'}`,
  })),
)

const groups = computed(() =>
  ledger.evidenceByDate
    .map((day) => ({
      ...day,
      directions: day.directions.filter(
        (d) => filterDirection.value === 'all' || d.direction === filterDirection.value,
      ),
    }))
    .filter((day) => day.directions.length > 0),
)

const totalSize = computed(() => ledger.evidence.reduce((sum, e) => sum + e.size, 0))

/** เลือกไฟล์ = แค่พักไว้ในรายการ ยังไม่เขียนอะไรลงเครื่อง */
function stageFiles(files: FileList | null) {
  if (!files?.length) return
  for (const file of Array.from(files)) {
    if (!ACCEPTED_EVIDENCE_TYPES.includes(file.type)) {
      toast.error(`${file.name} — รองรับเฉพาะ JPG, PNG, WebP และ PDF`)
      continue
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`${file.name} — ไฟล์ใหญ่เกิน ${formatBytes(MAX_EVIDENCE_BYTES)}`)
      continue
    }
    const duplicate = staged.value.some((f) => f.name === file.name && f.size === file.size)
    if (duplicate) {
      toast.error(`${file.name} — เลือกไฟล์นี้ไว้แล้ว`)
      continue
    }
    staged.value.push(file)
  }
  if (fileInput.value) fileInput.value.value = ''
}

/** อัปโหลดจริงหลังผู้ใช้ยืนยันในกล่องสรุปแล้วเท่านั้น */
async function confirmUpload() {
  showConfirm.value = false
  uploading.value = true
  let done = 0

  try {
    for (const file of staged.value) {
      // ย่อภาพก่อนเก็บ สลิปจากมือถือมักใหญ่หลายเมกะไบต์
      const { blob } = await compressImage(file)
      try {
        await ledger.addEvidence(
          {
            entryId: form.value.entryId || null,
            date: form.value.date,
            direction: form.value.direction,
            kind: form.value.kind,
            name: file.name,
            size: blob.size,
            mimeType: blob.type || file.type,
            note: form.value.note,
          },
          blob,
        )
        done += 1
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : `แนบ ${file.name} ไม่สำเร็จ`)
      }
    }

    if (done > 0) {
      toast.success(`อัปโหลดหลักฐาน ${done} ไฟล์เรียบร้อย`)
      staged.value = []
      form.value.note = ''
    }
  } finally {
    uploading.value = false
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  stageFiles(event.dataTransfer?.files ?? null)
}

async function remove(id: string) {
  try {
    await ledger.removeEvidence(id)
    toast.success('ลบหลักฐานแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}
</script>

<template>
  <div class="work-layout">
    <div>
      <section class="card">
        <div class="card-head">
          <div>
            <h3>หลักฐานทั้งหมด</h3>
            <p>{{ ledger.evidence.length }} ไฟล์ · รวม {{ formatBytes(totalSize) }}</p>
          </div>
          <div class="chip-row">
            <button
              v-for="option in [
                { value: 'all', label: 'ทั้งหมด' },
                ...EVIDENCE_DIRECTIONS.map((d) => ({ value: d.value, label: d.label })),
              ]"
              :key="option.value"
              type="button"
              class="chip"
              :class="{ selected: filterDirection === option.value }"
              @click="filterDirection = option.value as 'all' | EvidenceDirection"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="!groups.length" class="empty-state">
          <span class="ico-big"><AppIcon name="folder" :size="24" /></span>
          <h3>ยังไม่มีหลักฐาน</h3>
          <p>แนบใบเสร็จ สลิปโอนเงิน หรือเอกสารจากแผงด้านขวา ระบบจะจัดกลุ่มตามวันที่ให้เอง</p>
        </div>

        <!-- วันที่ → รับเงิน/จ่ายเงิน → ชนิดหลักฐาน -->
        <section v-for="day in groups" :key="day.date" class="evidence-day">
          <h4 class="evidence-date">
            {{ thaiDate(day.date) }}
            <span class="badge badge-muted">{{ day.count }} ไฟล์</span>
          </h4>

          <div v-for="dir in day.directions" :key="dir.direction" class="evidence-direction">
            <h5>
              <AppIcon
                :name="dir.direction === 'income' ? 'download' : 'upload'"
                :size="16"
              />
              {{ dir.label }}
              <span class="muted small">{{ dir.count }} ไฟล์</span>
            </h5>

            <div v-for="group in dir.kinds" :key="group.kind" class="evidence-kind">
              <span class="kind-label">หมวด{{ group.label }}</span>
              <div class="evidence-grid">
                <EvidenceThumb
                  v-for="item in group.items"
                  :key="item.id"
                  :item="item"
                  @open="lightbox = $event"
                  @remove="remove"
                />
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>

    <aside class="card" style="position: sticky; top: 88px">
      <div class="card-head">
        <div>
          <h3>แนบหลักฐาน</h3>
          <p>ตั้งค่าให้ครบก่อน แล้วค่อยเลือกไฟล์</p>
        </div>
      </div>

      <div class="field">
        <label for="ev-date">วันที่ของหลักฐาน</label>
        <input id="ev-date" v-model="form.date" type="date" :max="today" />
      </div>

      <div class="field">
        <label>ประเภท</label>
        <div class="chip-row" role="radiogroup" aria-label="ประเภทหลักฐาน">
          <button
            v-for="d in EVIDENCE_DIRECTIONS"
            :key="d.value"
            type="button"
            class="chip"
            role="radio"
            :aria-checked="form.direction === d.value"
            :class="{ selected: form.direction === d.value }"
            @click="form.direction = d.value"
          >
            {{ d.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <label for="ev-kind">หมวดหลักฐาน</label>
        <select id="ev-kind" v-model="form.kind">
          <option v-for="k in EVIDENCE_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
        <p class="hint">{{ EVIDENCE_KINDS.find((k) => k.value === form.kind)?.hint }}</p>
      </div>

      <div v-if="entryOptions.length" class="field">
        <label for="ev-entry">ผูกกับรายการ</label>
        <select id="ev-entry" v-model="form.entryId">
          <option value="">ไม่ผูกกับรายการใด</option>
          <option v-for="e in entryOptions" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </div>

      <div class="field">
        <label for="ev-note">บันทึกช่วยจำ</label>
        <input id="ev-note" v-model="form.note" type="text" placeholder="ไม่บังคับ" />
      </div>

      <div
        class="upload-zone"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <span><AppIcon name="upload" :size="24" /></span>
        <div class="txt">
          <strong>ลากไฟล์มาวาง หรือเลือกจากเครื่อง</strong>
          <span>JPG, PNG, WebP, PDF ไม่เกิน {{ formatBytes(MAX_EVIDENCE_BYTES) }} ต่อไฟล์</span>
        </div>
        <button class="btn btn-ghost btn-block" type="button" @click="fileInput?.click()">
          เลือกไฟล์
        </button>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          class="hidden"
          @change="stageFiles(($event.target as HTMLInputElement).files)"
        />
      </div>

      <StagedFileList
        :files="staged"
        @remove="staged.splice($event, 1)"
        @clear="staged = []"
      />

      <button
        class="btn btn-primary btn-block mt-2"
        type="button"
        :disabled="!staged.length || uploading"
        @click="showConfirm = true"
      >
        <AppIcon name="upload" :size="17" />
        {{
          uploading
            ? 'กำลังอัปโหลด...'
            : staged.length
              ? `ตรวจสอบและอัปโหลด ${staged.length} ไฟล์`
              : 'ยังไม่ได้เลือกไฟล์'
        }}
      </button>

      <p class="hint mt-2">
        ภาพจะถูกย่อให้เล็กลงก่อนเก็บ เพื่อไม่ให้กินพื้นที่เบราว์เซอร์เกินจำเป็น
        ตัวไฟล์เก็บอยู่ในเครื่องของคุณเท่านั้น ไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์
      </p>
    </aside>

    <!-- ยืนยันก่อนอัปโหลด -->
    <div v-if="showConfirm" class="modal-backdrop" @click.self="showConfirm = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="upload-confirm-title">
        <span class="ico-big"><AppIcon name="alert" :size="26" /></span>
        <h3 id="upload-confirm-title">ตรวจสอบก่อนอัปโหลด</h3>
        <p>ไฟล์จะถูกบันทึกด้วยข้อมูลชุดนี้ ตรวจให้ตรงก่อนกดยืนยัน</p>

        <ul class="confirm-list">
          <li>
            <span class="k">จำนวนไฟล์</span>
            <span class="v">{{ staged.length }} ไฟล์ · {{ formatBytes(stagedSize) }}</span>
          </li>
          <li>
            <span class="k">วันที่ของหลักฐาน</span>
            <span class="v">{{ thaiDate(form.date) }}</span>
          </li>
          <li>
            <span class="k">ประเภท</span>
            <span class="v">
              {{ EVIDENCE_DIRECTIONS.find((d) => d.value === form.direction)?.label }}
            </span>
          </li>
          <li>
            <span class="k">หมวดหลักฐาน</span>
            <span class="v">{{ EVIDENCE_KINDS.find((k) => k.value === form.kind)?.label }}</span>
          </li>
          <li>
            <span class="k">ผูกกับรายการ</span>
            <span class="v">
              {{ form.entryId ? entryOptions.find((e) => e.id === form.entryId)?.label : 'ไม่ผูก' }}
            </span>
          </li>
        </ul>

        <div class="notice notice-warn">
          <strong>ไฟล์เก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น</strong>
          ยังไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์ ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ไฟล์จะหายถาวร
          และภาพจะถูกย่อขนาดลงก่อนบันทึก
        </div>

        <div class="actions">
          <button class="btn btn-ghost" type="button" @click="showConfirm = false">
            กลับไปแก้ไข
          </button>
          <button class="btn btn-primary" type="button" :disabled="uploading" @click="confirmUpload">
            ยืนยันอัปโหลด {{ staged.length }} ไฟล์
          </button>
        </div>
      </div>
    </div>

    <!-- ดูภาพเต็ม -->
    <div v-if="lightbox" class="modal-backdrop" @click.self="lightbox = null">
      <div class="lightbox">
        <button class="btn btn-ghost btn-sm" type="button" @click="lightbox = null">
          <AppIcon name="close" :size="16" />
          ปิด
        </button>
        <img :src="lightbox" alt="หลักฐานขนาดเต็ม" />
        <a class="btn btn-ghost btn-sm" :href="lightbox" target="_blank" rel="noopener">
          เปิดในแท็บใหม่
        </a>
      </div>
    </div>
  </div>
</template>
