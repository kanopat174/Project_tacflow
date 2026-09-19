<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { ApiError, api, type Filing } from '@/services/api'
import { STATUS_META } from '@/data/filingStatus'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'
import LockedFeature from '@/components/LockedFeature.vue'
import { useAuthGate } from '@/composables/useAuthGate'

const toast = useToastStore()
const gate = useAuthGate()

const filings = ref<Filing[]>([])
const loading = ref(true)

const totals = computed(() => ({
  count: filings.value.length,
  refund: filings.value.reduce((sum, f) => sum + (f.balance < 0 ? -f.balance : 0), 0),
  due: filings.value.reduce((sum, f) => sum + (f.balance > 0 ? f.balance : 0), 0),
}))

onMounted(async () => {
  if (gate.isGuest.value) {
    loading.value = false
    return
  }
  try {
    filings.value = await api.filings()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดประวัติการยื่นไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ขั้นตอนที่ 4 — ติดตามผล</span>
        <h2>ประวัติการยื่นแบบภาษี</h2>
        <p>แบบภาษีทุกชุดที่ยื่นผ่าน TaxFlow พร้อมสถานะล่าสุดและยอดที่ต้องชำระหรือขอคืน</p>
      </div>

      <LockedFeature
        v-if="gate.isGuest.value"
        title="ประวัติการยื่นต้องมีบัญชี"
        description="ระบบเก็บแบบภาษีทุกฉบับที่ยื่นผ่าน TaxFlow พร้อมสถานะล่าสุดและยอดคืนภาษีสะสม"
        :benefits="[
          'ดูย้อนหลังได้ทุกปีภาษี',
          'ติดตามสถานะการตรวจสอบ',
          'สรุปยอดขอคืนและยอดค้างชำระ',
          'เปิดใบยืนยันเป็น PDF ได้ทุกเมื่อ',
        ]"
      />

      <div v-if="loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดประวัติการยื่น</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <div v-else-if="!filings.length" class="empty-state">
        <span class="ico-big"><AppIcon name="history" :size="26" /></span>
        <h3>ยังไม่มีประวัติการยื่น</h3>
        <p>เมื่อยื่นแบบภาษีชุดแรกเสร็จ รายการจะมาแสดงที่นี่พร้อมสถานะการตรวจสอบ</p>
        <RouterLink class="btn btn-primary" to="/filing">เริ่มยื่นแบบภาษี</RouterLink>
      </div>

      <template v-else>
        <div class="grid grid-3 mb-3">
          <div class="card">
            <span class="eyebrow">ยื่นไปแล้ว</span>
            <strong class="num" style="font-size: 28px">{{ totals.count }} ฉบับ</strong>
          </div>
          <div class="card">
            <span class="eyebrow">ยอดขอคืนสะสม</span>
            <strong class="num text-ok" style="font-size: 28px">{{ formatBaht(totals.refund) }}</strong>
          </div>
          <div class="card">
            <span class="eyebrow">ยอดที่ต้องชำระเพิ่มสะสม</span>
            <strong class="num" style="font-size: 28px">{{ formatBaht(totals.due) }}</strong>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เลขอ้างอิง</th>
                <th>ปีภาษี</th>
                <th>วันที่ยื่น</th>
                <th class="right">เงินได้สุทธิ</th>
                <th class="right">ภาษี</th>
                <th class="right">ชำระเพิ่ม / ขอคืน</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="filing in filings" :key="filing.id">
                <td class="num">{{ filing.reference }}</td>
                <td>{{ filing.taxYear }}</td>
                <td>{{ thaiDate(filing.submittedAt) }}</td>
                <td class="money">{{ formatBaht(filing.netIncome) }}</td>
                <td class="money">{{ formatBaht(filing.tax) }}</td>
                <td class="money" :class="filing.balance < 0 ? 'text-ok' : ''">
                  <template v-if="filing.balance < 0">
                    ขอคืน {{ formatBaht(-filing.balance) }}
                  </template>
                  <template v-else-if="filing.balance > 0">
                    ชำระเพิ่ม {{ formatBaht(filing.balance) }}
                  </template>
                  <template v-else>ไม่มียอดคงเหลือ</template>
                </td>
                <td>
                  <span class="badge" :class="STATUS_META[filing.status].badge">
                    {{ STATUS_META[filing.status].label }}
                  </span>
                </td>
                <td>
                  <RouterLink class="btn btn-ghost btn-sm" :to="`/status/${filing.reference}`">
                    ดูสถานะ
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </main>
</template>
