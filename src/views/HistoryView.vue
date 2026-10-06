<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { ApiError, api, type Filing } from '@/services/api'
import { STATUS_META } from '@/data/filingStatus'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'
import LockedFeature from '@/components/LockedFeature.vue'
import YearComparisonCard from '@/components/YearComparisonCard.vue'
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
    toast.error(error instanceof ApiError ? error.message : 'โหลดประวัติแบบภาษีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ขั้นตอนที่ 4 — เก็บสรุปและติดตามผล</span>
        <h2>ประวัติแบบภาษี</h2>
        <p>สรุปแบบภาษีทุกชุดที่บันทึกไว้ใน TaxFlow พร้อมความคืบหน้าที่คุณอัปเดต และยอดที่ต้องชำระหรือขอคืน</p>
      </div>

      <LockedFeature
        v-if="gate.isGuest.value"
        title="ประวัติแบบภาษีต้องมีบัญชี"
        description="ระบบเก็บสรุปแบบภาษีทุกฉบับที่บันทึกไว้ พร้อมความคืบหน้าและยอดคืนภาษีสะสม"
        :benefits="[
          'ดูย้อนหลังได้ทุกปีภาษี',
          'จดความคืบหน้าหลังยื่นที่ e-Filing',
          'สรุปยอดขอคืนและยอดค้างชำระ',
          'เปิดใบยืนยันเป็น PDF ได้ทุกเมื่อ',
        ]"
      />

      <div v-if="loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดประวัติแบบภาษี</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <div v-else-if="!filings.length" class="empty-state">
        <span class="ico-big"><AppIcon name="history" :size="26" /></span>
        <h3>ยังไม่มีสรุปแบบภาษี</h3>
        <p>เมื่อบันทึกสรุปแบบภาษีชุดแรก รายการจะมาแสดงที่นี่</p>
        <RouterLink class="btn btn-primary" to="/filing">เริ่มเตรียมแบบภาษี</RouterLink>
      </div>

      <template v-else>
        <div class="grid grid-3 mb-3">
          <div class="card stat">
            <span class="eyebrow">บันทึกไว้</span>
            <strong class="num">{{ totals.count }} ฉบับ</strong>
            <span class="muted small">สรุปแบบภาษีทุกปี</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">ยอดขอคืนสะสม</span>
            <strong class="num text-ok">{{ formatBaht(totals.refund) }}</strong>
            <span class="muted small">รวมทุกปีที่ขอคืนได้</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">ยอดที่ต้องชำระเพิ่มสะสม</span>
            <strong class="num">{{ formatBaht(totals.due) }}</strong>
            <span class="muted small">รวมทุกปีที่ต้องชำระเพิ่ม</span>
          </div>
        </div>

        <YearComparisonCard :filings="filings" class="mb-3" />

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เลขอ้างอิง</th>
                <th>ปีภาษี</th>
                <th>วันที่บันทึก</th>
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
                    ดูสรุป
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
