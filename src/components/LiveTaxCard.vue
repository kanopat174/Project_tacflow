<script setup lang="ts">
/**
 * ภาษีของปีนี้แบบสด — จากรายรับที่จดในสมุดตั้งแต่ ม.ค. ถึงวันนี้ คาดการณ์ถึงสิ้นปี
 * ว่าจะได้เงินคืนหรือต้องจ่ายเพิ่ม และแปลงเป็นของที่จับต้องได้ให้เห็นภาพ
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import TermTip from './TermTip.vue'
import { shareCard } from '@/services/shareCard'
import { toTangible } from '@/services/tangible'
import { formatBaht, formatPercent } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'
import { useToastStore } from '@/stores/toast'

const game = useGameStore()
const toast = useToastStore()

const live = computed(() => game.live)
const balance = computed(() => live.value?.projected.balance ?? 0)
const isRefund = computed(() => balance.value < 0)
const fun = computed(() => toTangible(Math.abs(balance.value), live.value?.month ?? 0))
const monthName = computed(() =>
  live.value ? new Date(2000, live.value.month - 1, 1).toLocaleDateString('th-TH', { month: 'long' }) : '',
)

const sharing = ref(false)
async function share() {
  if (!live.value || !fun.value) return
  sharing.value = true
  try {
    const result = await shareCard({
      emoji: fun.value.item.emoji,
      title: `ภาษีปี ${live.value.taxYear} ของฉัน`,
      headline: isRefund.value ? `คาดว่าได้เงินคืน ${formatBaht(-balance.value)}` : `ต้องเตรียมจ่ายเพิ่ม ${formatBaht(balance.value)}`,
      sub: `= ${fun.value.text}`,
      filename: `taxflow-${live.value.taxYear}.png`,
    })
    if (result === 'saved') toast.success('บันทึกรูปแล้ว')
  } catch {
    toast.error('สร้างรูปไม่สำเร็จ')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <section v-if="live" class="card live-tax">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="chart" :size="19" />
          ภาษีปี {{ live.taxYear }} ของคุณตอนนี้
        </h3>
        <p>คิดจากรายรับในสมุดถึง{{ monthName }} แล้วคาดการณ์ถึงสิ้นปี ด้วยค่าลดหย่อนในแบบร่าง</p>
      </div>
      <RouterLink class="btn btn-ghost btn-sm" to="/filing">ปรับค่าลดหย่อน</RouterLink>
    </div>

    <div class="live-hero" :class="isRefund ? 'refund' : balance > 0 ? 'due' : ''">
      <span>{{ isRefund ? 'คาดว่าจะได้เงินคืน' : balance > 0 ? 'คาดว่าต้องจ่ายเพิ่มตอนยื่น' : 'ภาษีที่ถูกหักไว้พอดี' }}</span>
      <strong>{{ formatBaht(Math.abs(balance)) }}</strong>
      <small v-if="fun && balance !== 0">{{ fun.item.emoji }} เท่ากับ{{ fun.text }}</small>
    </div>

    <div class="live-grid">
      <div>
        <small class="muted">รายรับถึงตอนนี้</small>
        <b>{{ formatBaht(live.ytdIncome) }}</b>
      </div>
      <div>
        <small class="muted">คาดการณ์ทั้งปี</small>
        <b>{{ formatBaht(live.projectedIncome) }}</b>
      </div>
      <div>
        <small class="muted">ภาษีทั้งปี (คาดการณ์)</small>
        <b>{{ formatBaht(live.projected.tax) }}</b>
      </div>
      <div>
        <small class="muted"><TermTip term="withholding">ถูกหักไว้</TermTip> (คาดการณ์)</small>
        <b>{{ formatBaht(live.projectedWithholding) }}</b>
      </div>
      <div>
        <small class="muted"><TermTip term="marginalRate">ขั้นภาษีสูงสุด</TermTip></small>
        <b>{{ formatPercent(live.projected.marginalRate, 0) }}</b>
      </div>
    </div>

    <div class="row mt-2" style="justify-content: space-between; gap: 8px; flex-wrap: wrap">
      <p class="small muted" style="margin: 0">
        <template v-if="!live.confident">มีข้อมูลเดือนเดียว ตัวเลขยังหยาบ จดต่ออีกเดือนจะแม่นขึ้น · </template>
        ไม่รวมรายรับที่ไม่ได้จดในสมุด
      </p>
      <button v-if="fun && balance !== 0" class="btn btn-ghost btn-sm" type="button" :disabled="sharing" @click="share">
        <AppIcon name="download" :size="15" />
        แชร์เป็นรูป
      </button>
    </div>
  </section>
</template>

<style scoped>
.live-hero {
  display: grid;
  gap: 2px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--surface-2);
  margin-bottom: 14px;
}
.live-hero strong {
  font-size: 2rem;
  line-height: 1.2;
  font-family: var(--font-data);
}
.live-hero.refund strong {
  color: var(--refund);
}
.live-hero.due strong {
  color: var(--warn);
}
.live-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}
.live-grid > div {
  display: grid;
  gap: 2px;
}
</style>
