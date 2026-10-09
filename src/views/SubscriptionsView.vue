<script setup lang="ts">
/**
 * ค่าบริการรายเดือน — หาจากรายการที่จดไว้ทุกสมุด บอกรอบตัดเงินครั้งหน้า ราคาที่ขึ้น และรวมต่อปี
 * ผู้ใช้ติดป้ายได้ว่ายังใช้ ไม่ค่อยได้ใช้ (เสนอให้ยกเลิก) หรือยกเลิกแล้ว
 */
import { computed, ref } from 'vue'
import {
  detectSubscriptions,
  loadSubStatuses,
  saveSubStatuses,
  summarize,
  type SubStatus,
  type Subscription,
} from '@/services/subscriptions'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const game = useGameStore()
const toast = useToastStore()
const today = localToday()

const statuses = ref<Record<string, SubStatus>>(auth.user ? loadSubStatuses(auth.user.id) : {})
const subs = computed(() => detectSubscriptions(game.entries, today))
const summary = computed(() => summarize(subs.value, statuses.value))

const groups = computed(() => ({
  active: subs.value.filter((s) => statuses.value[s.key] !== 'cancelled' && !s.stale),
  stale: subs.value.filter((s) => statuses.value[s.key] !== 'cancelled' && s.stale),
  cancelled: subs.value.filter((s) => statuses.value[s.key] === 'cancelled'),
}))

function setStatus(sub: Subscription, status: SubStatus) {
  statuses.value = { ...statuses.value, [sub.key]: status }
  if (auth.user && !saveSubStatuses(auth.user.id, statuses.value)) toast.error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม')
  if (status === 'cancelled') toast.success(`ยกเลิก ${sub.name} — ประหยัด ${formatBaht(sub.yearlyCost)} ต่อปี`)
}

function when(sub: Subscription): string {
  if (sub.daysUntil < 0) return `เลยรอบมา ${-sub.daysUntil} วัน`
  if (sub.daysUntil === 0) return 'ตัดเงินวันนี้'
  return `อีก ${sub.daysUntil} วัน`
}

const STATUS_LABELS: Record<SubStatus, string> = { keep: 'ยังใช้', unused: 'ไม่ค่อยได้ใช้', cancelled: 'ยกเลิกแล้ว' }
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">วางแผนการเงิน</span>
        <h2>ค่าบริการรายเดือน</h2>
        <p>ระบบหาค่าสมาชิกและบริการที่ตัดเงินเป็นรอบจากรายการที่คุณจด เตือนก่อนตัดเงิน และชี้ตัวที่ควรยกเลิก</p>
      </div>

      <section class="card mb-3">
        <dl class="sub-summary">
          <div>
            <dt>จ่ายอยู่ต่อเดือน</dt>
            <dd>{{ formatBaht(summary.monthly) }}</dd>
          </div>
          <div>
            <dt>ต่อปี</dt>
            <dd>{{ formatBaht(summary.yearly) }}</dd>
          </div>
          <div>
            <dt>ถ้ายกเลิกที่ไม่ค่อยได้ใช้</dt>
            <dd class="text-ok">ประหยัด {{ formatBaht(summary.unusedYearly) }}/ปี</dd>
          </div>
          <div v-if="summary.cancelledYearly">
            <dt>ยกเลิกไปแล้ว</dt>
            <dd class="text-ok">ประหยัด {{ formatBaht(summary.cancelledYearly) }}/ปี</dd>
          </div>
        </dl>
      </section>

      <section class="card mb-3">
        <div class="card-head">
          <div>
            <h3>กำลังจ่ายอยู่</h3>
            <p>เรียงจากแพงสุดต่อปี · ระบบเตือนที่กระดิ่งก่อนตัดเงิน 3 วัน</p>
          </div>
        </div>
        <p v-if="!groups.active.length" class="muted">
          ยังไม่พบ — ระบบจะเจอเมื่อจ่ายให้ที่เดิมยอดใกล้กันอย่างน้อย 2 เดือน หรือจดชื่อบริการอย่าง Netflix, Spotify, YouTube
        </p>
        <ul v-else class="sub-list">
          <li v-for="sub in groups.active" :key="sub.key" :class="{ unused: statuses[sub.key] === 'unused' }">
            <div class="sub-main">
              <strong>{{ sub.name }}</strong>
              <span class="small muted">
                {{ formatBaht(sub.amount) }}/{{ sub.cycle === 'monthly' ? 'เดือน' : 'ปี' }} · ปีละ {{ formatBaht(sub.yearlyCost) }}
              </span>
              <span class="small">
                รอบหน้า {{ thaiDate(sub.nextDate) }}
                <span class="badge" :class="sub.daysUntil >= 0 && sub.daysUntil <= 3 ? 'badge-warn' : 'badge-muted'">{{ when(sub) }}</span>
              </span>
              <span v-if="sub.priceChange" class="small" :class="sub.priceChange.to > sub.priceChange.from ? 'text-bad' : 'text-ok'">
                ราคา{{ sub.priceChange.to > sub.priceChange.from ? 'ขึ้น' : 'ลง' }}จาก {{ formatBaht(sub.priceChange.from) }} เป็น
                {{ formatBaht(sub.priceChange.to) }}
              </span>
            </div>
            <div class="sub-actions" role="group" :aria-label="`สถานะของ ${sub.name}`">
              <button
                v-for="s in (['keep', 'unused', 'cancelled'] as SubStatus[])"
                :key="s"
                type="button"
                class="chip"
                :class="{ selected: (statuses[sub.key] ?? 'keep') === s }"
                :aria-pressed="(statuses[sub.key] ?? 'keep') === s"
                @click="setStatus(sub, s)"
              >
                {{ STATUS_LABELS[s] }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="groups.stale.length" class="card mb-3">
        <div class="card-head">
          <div>
            <h3>ไม่พบการจ่ายรอบล่าสุด</h3>
            <p>อาจยกเลิกไปแล้ว หรือยังไม่ได้จด — ถ้ายกเลิกแล้วกด "ยกเลิกแล้ว"</p>
          </div>
        </div>
        <ul class="sub-list">
          <li v-for="sub in groups.stale" :key="sub.key">
            <div class="sub-main">
              <strong>{{ sub.name }}</strong>
              <span class="small muted">จ่ายล่าสุด {{ thaiDate(sub.lastDate) }} · {{ formatBaht(sub.amount) }}</span>
            </div>
            <div class="sub-actions">
              <button type="button" class="chip" @click="setStatus(sub, 'cancelled')">ยกเลิกแล้ว</button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="groups.cancelled.length" class="card">
        <div class="card-head">
          <div>
            <h3>ยกเลิกแล้ว</h3>
          </div>
        </div>
        <ul class="sub-list">
          <li v-for="sub in groups.cancelled" :key="sub.key">
            <div class="sub-main">
              <strong>{{ sub.name }}</strong>
              <span class="small text-ok">ประหยัด {{ formatBaht(sub.yearlyCost) }}/ปี</span>
            </div>
            <div class="sub-actions">
              <button type="button" class="chip" @click="setStatus(sub, 'keep')">กลับมาใช้</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.sub-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
}
.sub-summary dt {
  font-size: 13px;
  color: var(--text-dim);
}
.sub-summary dd {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 700;
}
.sub-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.sub-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.sub-list li.unused {
  border-color: var(--warn);
}
.sub-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.sub-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
