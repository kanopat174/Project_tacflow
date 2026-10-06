<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { DOCUMENT_TYPES, TAX_YEARS } from '@/data/taxData'
import DocumentChecklist from '@/components/DocumentChecklist.vue'
import { ApiError, api, type DocumentRecord } from '@/services/api'
import { thaiDate } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'
import LockedFeature from '@/components/LockedFeature.vue'
import StagedFileList from '@/components/StagedFileList.vue'
import { useAuthGate } from '@/composables/useAuthGate'

const toast = useToastStore()
const gate = useAuthGate()

const documents = ref<DocumentRecord[]>([])
const loading = ref(true)
const dragging = ref(false)
const selectedYear = ref<string>(TAX_YEARS[0])
const selectedType = ref<string>(DOCUMENT_TYPES[0].value)
const fileInput = ref<HTMLInputElement | null>(null)

/* เลือกไฟล์แล้วพักไว้ก่อน ต้องกดยืนยันอีกครั้งจึงบันทึก */
const staged = ref<File[]>([])
const showConfirm = ref(false)
const saving = ref(false)
const stagedSize = computed(() => staged.value.reduce((sum, f) => sum + f.size, 0))

const MAX_SIZE = 10 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']

const filtered = computed(() => documents.value.filter((doc) => doc.taxYear === selectedYear.value))

const totalSize = computed(() => filtered.value.reduce((sum, doc) => sum + doc.size, 0))

function typeLabel(value: string): string {
  return DOCUMENT_TYPES.find((type) => type.value === value)?.label ?? value
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function load() {
  // ผู้เยี่ยมชมยังไม่มีบัญชี จึงไม่ต้องยิง API ให้ได้ 401 กลับมา
  if (gate.isGuest.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    documents.value = await api.documents()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดรายการเอกสารไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

/** เลือกไฟล์ = แค่พักไว้ ยังไม่บันทึก */
function stageFiles(files: FileList | null) {
  if (!files?.length) return
  if (!gate.requireAuth('ต้องเข้าสู่ระบบก่อนแนบเอกสาร')) return

  for (const file of Array.from(files)) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error(`${file.name} — รองรับเฉพาะไฟล์ PDF, JPG และ PNG`)
      continue
    }
    if (file.size > MAX_SIZE) {
      toast.error(`${file.name} — ไฟล์ใหญ่เกิน 10 MB`)
      continue
    }
    if (staged.value.some((f) => f.name === file.name && f.size === file.size)) {
      toast.error(`${file.name} — เลือกไฟล์นี้ไว้แล้ว`)
      continue
    }
    staged.value.push(file)
  }

  if (fileInput.value) fileInput.value.value = ''
}

/** บันทึกจริงหลังยืนยันเท่านั้น */
async function confirmUpload() {
  showConfirm.value = false
  saving.value = true
  let done = 0

  try {
    for (const file of staged.value) {
      try {
        const record = await api.addDocument({
          taxYear: selectedYear.value,
          type: selectedType.value,
          name: file.name,
          size: file.size,
        })
        documents.value.unshift(record)
        done += 1
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : `แนบ ${file.name} ไม่สำเร็จ`)
      }
    }
    if (done > 0) {
      toast.success(`แนบเอกสาร ${done} ไฟล์เรียบร้อย`)
      staged.value = []
    }
  } finally {
    saving.value = false
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  stageFiles(event.dataTransfer?.files ?? null)
}

async function remove(doc: DocumentRecord) {
  try {
    await api.removeDocument(doc.id)
    documents.value = documents.value.filter((item) => item.id !== doc.id)
    toast.success('ลบเอกสารแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบเอกสารไม่สำเร็จ')
  }
}

onMounted(load)
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ขั้นตอนที่ 3 — เตรียมเอกสาร</span>
        <h2>เอกสารประกอบการยื่นภาษี</h2>
        <p>
          เก็บหนังสือรับรองการหักภาษี ณ ที่จ่าย ใบเสร็จเบี้ยประกัน และหนังสือรับรองกองทุนไว้ที่เดียว
          แยกตามปีภาษีเพื่อหยิบใช้ตอนกรอกค่าลดหย่อน
        </p>
      </div>

      <!-- เช็กลิสต์ตามรายการที่กรอกในแบบ โหลดใหม่ทุกครั้งที่จำนวนเอกสารเปลี่ยน -->
      <DocumentChecklist :key="documents.length" class="mb-3" />

      <LockedFeature
        v-if="gate.isGuest.value"
        title="เก็บเอกสารต้องมีบัญชี"
        description="เอกสารผูกกับบัญชีของคุณและแยกตามปีภาษี จึงต้องเข้าสู่ระบบก่อนแนบไฟล์"
        :benefits="[
          'แยกเก็บตามปีภาษีอัตโนมัติ',
          'จัดหมวดตามประเภทเอกสาร',
          'ลากไฟล์มาวางได้ทีละหลายไฟล์',
          'หยิบไปใช้ตอนกรอกค่าลดหย่อนได้ทันที',
        ]"
      />

      <div class="notice notice-warn mb-3">
        <strong>ระบบต้นแบบยังไม่เก็บตัวไฟล์จริง</strong>
        ตอนนี้บันทึกเฉพาะชื่อไฟล์ ประเภท และขนาดไว้ในเบราว์เซอร์ของคุณเท่านั้น
        เมื่อเชื่อมต่อ backend แล้วจึงจะอัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์ได้จริง
      </div>

      <section class="card">
        <div class="field-grid mb-2">
          <div class="field">
            <label for="doc-year">ปีภาษีของเอกสาร</label>
            <select id="doc-year" v-model="selectedYear">
              <option v-for="year in TAX_YEARS" :key="year" :value="year">{{ year }}</option>
            </select>
          </div>
          <div class="field">
            <label for="doc-type">ประเภทเอกสาร</label>
            <select id="doc-type" v-model="selectedType">
              <option v-for="type in DOCUMENT_TYPES" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </div>
        </div>

        <div
          class="upload-zone"
          :class="{ dragging }"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <span><AppIcon name="upload" :size="28" /></span>
          <div class="txt">
            <strong>ลากไฟล์มาวางที่นี่ หรือเลือกจากเครื่อง</strong>
            <span>รองรับ PDF, JPG, PNG ขนาดไม่เกิน 10 MB ต่อไฟล์</span>
          </div>
          <button class="btn btn-ghost" type="button" @click="fileInput?.click()">เลือกไฟล์</button>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            class="hidden"
            @change="stageFiles(($event.target as HTMLInputElement).files)"
          />
        </div>

        <StagedFileList :files="staged" @remove="staged.splice($event, 1)" @clear="staged = []" />

        <button
          class="btn btn-primary btn-block mt-2"
          type="button"
          :disabled="!staged.length || saving"
          @click="showConfirm = true"
        >
          <AppIcon name="upload" :size="17" />
          {{
            saving
              ? 'กำลังบันทึก...'
              : staged.length
                ? `ตรวจสอบและแนบ ${staged.length} ไฟล์`
                : 'ยังไม่ได้เลือกไฟล์'
          }}
        </button>
      </section>

      <!-- ยืนยันก่อนแนบ -->
      <div v-if="showConfirm" class="modal-backdrop" @click.self="showConfirm = false">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="doc-confirm-title">
          <span class="ico-big"><AppIcon name="alert" :size="26" /></span>
          <h3 id="doc-confirm-title">ตรวจสอบก่อนแนบเอกสาร</h3>
          <p>เอกสารจะถูกบันทึกด้วยข้อมูลชุดนี้ ตรวจให้ตรงก่อนกดยืนยัน</p>

          <ul class="confirm-list">
            <li>
              <span class="k">จำนวนไฟล์</span>
              <span class="v">{{ staged.length }} ไฟล์ · {{ formatSize(stagedSize) }}</span>
            </li>
            <li>
              <span class="k">ปีภาษี</span>
              <span class="v">{{ selectedYear }}</span>
            </li>
            <li>
              <span class="k">ประเภทเอกสาร</span>
              <span class="v">{{ typeLabel(selectedType) }}</span>
            </li>
          </ul>

          <div class="notice notice-warn">
            <strong>ระบบต้นแบบยังไม่เก็บตัวไฟล์จริง</strong>
            บันทึกเฉพาะชื่อไฟล์ ประเภท และขนาดไว้ในเบราว์เซอร์เท่านั้น
            ถ้าต้องการเก็บไฟล์จริงให้เปิดดูได้ ใช้หน้าหลักฐานในสมุดบัญชีแทน
          </div>

          <div class="actions">
            <button class="btn btn-ghost" type="button" @click="showConfirm = false">
              กลับไปแก้ไข
            </button>
            <button class="btn btn-primary" type="button" :disabled="saving" @click="confirmUpload">
              ยืนยันแนบ {{ staged.length }} ไฟล์
            </button>
          </div>
        </div>
      </div>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>เอกสารปีภาษี {{ selectedYear }}</h3>
            <p>{{ filtered.length }} ไฟล์ · รวม {{ formatSize(totalSize) }}</p>
          </div>
        </div>

        <div v-if="loading" aria-busy="true">
          <span class="sr-only">กำลังโหลดรายการเอกสาร</span>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
        </div>

        <div v-else-if="!filtered.length" class="empty-state">
          <span class="ico-big"><AppIcon name="folder" :size="26" /></span>
          <h3>ยังไม่มีเอกสารของปีภาษีนี้</h3>
          <p>แนบหนังสือรับรอง 50 ทวิ และใบเสร็จค่าลดหย่อนไว้ล่วงหน้า จะกรอกแบบยื่นได้เร็วขึ้นมาก</p>
        </div>

        <div v-else>
          <div v-for="doc in filtered" :key="doc.id" class="file-row">
            <span class="avatar"><AppIcon name="file" :size="17" /></span>
            <div class="meta">
              <strong>{{ doc.name }}</strong>
              <span>{{ typeLabel(doc.type) }} · {{ formatSize(doc.size) }} · แนบเมื่อ {{ thaiDate(doc.uploadedAt) }}</span>
            </div>
            <button class="btn btn-danger btn-sm" type="button" @click="remove(doc)">
              <AppIcon name="trash" :size="16" />
              ลบ
            </button>
          </div>
        </div>
      </section>

      <div class="actions-bar">
        <RouterLink class="btn btn-ghost" to="/deductions">
          <AppIcon name="arrowLeft" :size="18" />
          กลับไปกรอกค่าลดหย่อน
        </RouterLink>
        <RouterLink class="btn btn-primary" to="/filing">
          ไปยื่นแบบภาษี
          <AppIcon name="arrowRight" :size="18" />
        </RouterLink>
      </div>
    </div>
  </main>
</template>
