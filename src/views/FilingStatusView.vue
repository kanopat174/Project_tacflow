<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import { E_FILING_URL, STATUS_FLOW, STATUS_META } from '@/data/filingStatus'
import { ApiError, api, type Filing, type FilingStatus } from '@/services/api'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'

const route = useRoute()
const toast = useToastStore()

const filing = ref<Filing | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const updating = ref(false)

/** สถานะถัดไปที่ผู้ใช้กดเลื่อนได้ — ไม่มีเมื่อปิดเรื่องแล้ว */
const nextStatus = computed<FilingStatus | null>(() => {
  const index = currentIndex.value
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1]! : null
})
const previousStatus = computed<FilingStatus | null>(() => {
  const index = currentIndex.value
  return index > 0 ? STATUS_FLOW[index - 1]! : null
})

async function setStatus(status: FilingStatus) {
  if (!filing.value) return
  updating.value = true
  try {
    filing.value = await api.updateFilingStatus(filing.value.reference, status)
    toast.success(`อัปเดตเป็น "${STATUS_META[status].label}" แล้ว`)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'อัปเดตสถานะไม่สำเร็จ')
  } finally {
    updating.value = false
  }
}

const reference = computed(() => String(route.params.reference))

const currentIndex = computed(() =>
  filing.value ? STATUS_FLOW.indexOf(filing.value.status) : -1,
)

const isRefund = computed(() => (filing.value?.balance ?? 0) < 0)
const isDue = computed(() => (filing.value?.balance ?? 0) > 0)

const documentSections = computed<DocumentSection[]>(() => {
  const f = filing.value
  if (!f) return []
  return [
    {
      title: 'ข้อมูลแบบภาษี',
      rows: [
        { label: 'เลขอ้างอิง', value: f.reference },
        { label: 'ปีภาษี', value: f.taxYear },
        { label: 'ประเภทแบบ', value: f.formType },
        { label: 'วันที่บันทึกสรุป', value: thaiDate(f.submittedAt) },
        { label: 'สถานะล่าสุด', value: STATUS_META[f.status].label },
      ],
    },
    {
      title: 'สรุปการคำนวณ',
      rows: [
        { label: 'เงินได้พึงประเมิน', value: formatBaht(f.grossIncome) },
        { label: 'เงินได้สุทธิ', value: formatBaht(f.netIncome), strong: true },
        { label: 'ภาษีที่คำนวณได้', value: formatBaht(f.tax) },
        { label: 'หัก ภาษีหัก ณ ที่จ่าย', value: `− ${formatBaht(f.withholdingTax)}`, muted: true },
        {
          label: f.balance < 0 ? 'ยอดที่ขอคืนได้' : 'ยอดที่ต้องชำระเพิ่ม',
          value: formatBaht(Math.abs(f.balance)),
          strong: true,
        },
      ],
    },
  ]
})

function exportPdf() {
  window.print()
}

async function load() {
  try {
    filing.value = await api.filing(reference.value)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'โหลดข้อมูลแบบภาษีไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div v-if="loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดสถานะแบบภาษี</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-line w80"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <div v-else-if="errorMessage" class="empty-state">
        <span class="ico-big"><AppIcon name="alert" :size="26" /></span>
        <h3>{{ errorMessage }}</h3>
        <p>ตรวจสอบเลขอ้างอิงอีกครั้ง หรือเลือกแบบภาษีจากหน้าประวัติการยื่น</p>
        <RouterLink class="btn btn-primary" to="/history">ไปหน้าประวัติการยื่น</RouterLink>
      </div>

      <template v-else-if="filing">
        <div class="section-head">
          <span class="eyebrow">เลขอ้างอิง {{ filing.reference }}</span>
          <h2>สรุปแบบภาษีปี {{ filing.taxYear }}</h2>
          <p>
            บันทึกเมื่อ {{ thaiDate(filing.submittedAt) }} · แบบ {{ filing.formType }} ·
            สถานะปัจจุบัน
            <span class="badge" :class="STATUS_META[filing.status].badge">
              {{ STATUS_META[filing.status].label }}
            </span>
          </p>
        </div>

        <div class="work-layout">
          <div>
            <section class="card">
              <div class="card-head">
                <div>
                  <h3>ความคืบหน้า</h3>
                  <p>
                    TaxFlow ไม่ได้ส่งแบบให้กรมสรรพากร สถานะจะเปลี่ยนเมื่อคุณกดอัปเดตเองหลังยื่นที่ e-Filing
                  </p>
                </div>
              </div>

              <div v-if="filing.status === 'submitted'" class="notice notice-warn mb-2">
                <strong>ยังไม่ได้ยื่นจริง</strong>
                นำตัวเลขด้านขวาไปกรอกที่
                <a :href="E_FILING_URL" target="_blank" rel="noopener noreferrer">efiling.rd.go.th</a>
                ภายในกำหนดเวลา แล้วกลับมากดอัปเดตด้านล่าง
              </div>

              <div class="timeline">
                <div
                  v-for="(status, index) in STATUS_FLOW"
                  :key="status"
                  class="tl-step"
                  :class="{ done: index < currentIndex, active: index === currentIndex }"
                >
                  <span class="dot">
                    <AppIcon v-if="index < currentIndex" name="check" :size="16" />
                    <template v-else>{{ index + 1 }}</template>
                  </span>
                  <div class="content">
                    <h4>{{ STATUS_META[status].label }}</h4>
                    <p class="desc">{{ STATUS_META[status].description }}</p>
                  </div>
                </div>
              </div>

              <div class="row mt-2 no-print" style="gap: 8px">
                <button
                  v-if="nextStatus"
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="updating"
                  @click="setStatus(nextStatus)"
                >
                  <AppIcon name="check" :size="16" />
                  {{ STATUS_META[nextStatus].action }}
                </button>
                <button
                  v-if="previousStatus"
                  class="btn btn-ghost btn-sm"
                  type="button"
                  :disabled="updating"
                  @click="setStatus(previousStatus)"
                >
                  <AppIcon name="arrowLeft" :size="16" />
                  ย้อนสถานะ
                </button>
                <a
                  class="btn btn-ghost btn-sm"
                  :href="E_FILING_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  เปิด e-Filing กรมสรรพากร
                </a>
              </div>
            </section>

            <section v-if="filing.status === 'completed'" class="card">
              <div class="card-head">
                <div>
                  <h3>{{ isRefund ? 'การคืนภาษี' : 'การชำระภาษี' }}</h3>
                  <p>ข้อมูลทั่วไปหลังกรมสรรพากรพิจารณาเสร็จ</p>
                </div>
              </div>

              <div v-if="isRefund" class="notice notice-accent">
                <strong>ขอคืนภาษีได้ {{ formatBaht(-filing.balance) }}</strong>
                กรมสรรพากรจะโอนเงินเข้าบัญชีพร้อมเพย์ที่ผูกกับเลขประจำตัวประชาชนของคุณ
                โดยปกติใช้เวลา 7–15 วันทำการนับจากวันที่อนุมัติ
              </div>
              <div v-else-if="isDue" class="notice notice-warn">
                <strong>ต้องชำระภาษีเพิ่ม {{ formatBaht(filing.balance) }}</strong>
                ชำระได้ที่แอปธนาคาร เคาน์เตอร์เซอร์วิส หรือสำนักงานสรรพากรพื้นที่
                หากยอดเกิน 3,000 บาท สามารถขอผ่อนชำระได้ 3 งวดโดยไม่มีดอกเบี้ย
              </div>
              <div v-else class="notice">
                <strong>ไม่มียอดคงเหลือ</strong>
                ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ตลอดปีพอดีกับภาษีที่ต้องเสีย
              </div>
            </section>

            <div class="actions-bar no-print">
              <RouterLink class="btn btn-ghost" to="/history">
                <AppIcon name="arrowLeft" :size="18" />
                กลับไปหน้าประวัติ
              </RouterLink>
              <button class="btn btn-primary" type="button" @click="exportPdf">
                <AppIcon name="download" :size="18" />
                บันทึกใบสรุปเป็น PDF
              </button>
            </div>
          </div>

          <aside class="summary-card">
            <div class="row" style="justify-content: space-between">
              <span class="eyebrow" style="margin: 0">สรุปแบบภาษี</span>
            </div>

            <div class="headline-amount" aria-live="polite" aria-atomic="true">
              <span>
                {{ isRefund ? 'ยอดที่ขอคืน' : isDue ? 'ยอดที่ต้องชำระเพิ่ม' : 'ยอดคงเหลือ' }}
              </span>
              <strong :class="{ refund: isRefund }">{{ formatBaht(Math.abs(filing.balance)) }}</strong>
            </div>

            <div class="price-lines">
              <div class="price-line">
                <span class="lbl">เงินได้พึงประเมิน</span>
                <span class="val">{{ formatBaht(filing.grossIncome) }}</span>
              </div>
              <div class="price-line">
                <span class="lbl">เงินได้สุทธิ</span>
                <span class="val">{{ formatBaht(filing.netIncome) }}</span>
              </div>
              <div class="price-line">
                <span class="lbl">ภาษีที่คำนวณได้</span>
                <span class="val">{{ formatBaht(filing.tax) }}</span>
              </div>
              <div class="price-line">
                <span class="lbl">ภาษีหัก ณ ที่จ่าย</span>
                <span class="val">− {{ formatBaht(filing.withholdingTax) }}</span>
              </div>
            </div>

            <div class="notice mt-3">
              <strong>เลขอ้างอิงนี้ใช้ใน TaxFlow เท่านั้น</strong>
              {{ filing.reference }} ไม่ใช่เลขรับแบบของกรมสรรพากร
              เลขรับแบบจริงจะได้จากระบบ e-Filing หลังยื่นสำเร็จ
            </div>
          </aside>
        </div>

        <TaxDocument
          title="ใบสรุปแบบแสดงรายการภาษี"
          :subtitle="`แบบ ${filing.formType} ปีภาษี ${filing.taxYear}`"
          :reference="filing.reference"
          :headline-label="filing.balance < 0 ? 'ยอดที่ขอคืนได้' : 'ยอดที่ต้องชำระเพิ่ม'"
          :headline-value="formatBaht(Math.abs(filing.balance))"
          :sections="documentSections"
        />
      </template>
    </div>
  </main>
</template>
