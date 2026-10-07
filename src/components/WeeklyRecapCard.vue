<script setup lang="ts">
/** สรุปสัปดาห์ที่แล้วแบบสั้น ๆ — ใช้ไปเท่าไร เทียบสัปดาห์ก่อน หมวดไหนพุ่ง */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const w = computed(() => game.weekly)

const verdict = computed(() => {
  const r = w.value
  if (!r) return ''
  if (r.expenseChange === null) return 'สัปดาห์แรกที่มีข้อมูล จดต่อไปจะได้เห็นการเปรียบเทียบ'
  if (r.expenseChange <= -0.1) return `ใช้น้อยลง ${Math.round(-r.expenseChange * 100)}% เก่งมาก! 🎉`
  if (r.expenseChange >= 0.1) return `ใช้มากขึ้น ${Math.round(r.expenseChange * 100)}% ลองดูหมวดที่พุ่งขึ้น`
  return 'ใกล้เคียงสัปดาห์ก่อน คุมได้ดี'
})
</script>

<template>
  <section v-if="w" class="card weekly-recap">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="history" :size="19" />
          สรุปสัปดาห์ที่แล้ว
        </h3>
        <p>{{ thaiDate(w.from) }} – {{ thaiDate(w.to) }} · จด {{ w.entryCount }} รายการ ใน {{ w.daysLogged }} วัน</p>
      </div>
    </div>

    <div class="weekly-grid">
      <div>
        <small class="muted">ใช้ไป</small>
        <b>{{ formatBaht(w.expense) }}</b>
      </div>
      <div>
        <small class="muted">รับเข้า</small>
        <b>{{ formatBaht(w.income) }}</b>
      </div>
      <div>
        <small class="muted">ใช้มากสุด</small>
        <b>{{ w.topCategory ? `${w.topCategory.label} ${formatBaht(w.topCategory.amount)}` : '-' }}</b>
      </div>
      <div v-if="w.biggestRise">
        <small class="muted">พุ่งขึ้นมากสุด</small>
        <b>{{ w.biggestRise.label }} +{{ formatBaht(w.biggestRise.amount) }}</b>
      </div>
    </div>
    <p class="mt-2" style="margin-bottom: 0">{{ verdict }}</p>
  </section>
</template>

<style scoped>
.weekly-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
.weekly-grid > div {
  display: grid;
  gap: 2px;
}
</style>
