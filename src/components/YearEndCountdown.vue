<script setup lang="ts">
/** นับถอยหลังสิ้นปีภาษี พร้อมบอกว่ายังซื้ออะไรลดหย่อนได้อีกเท่าไร — แสดงเฉพาะช่วงท้ายปี */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { toTangible } from '@/services/tangible'
import { formatBaht } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const fun = computed(() => (game.yearEndAdvice ? toTangible(game.yearEndAdvice.saving, 2) : null))
</script>

<template>
  <section v-if="game.yearEndAdvice" class="card year-end">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="clock" :size="19" />
          เหลือ {{ game.yearEndAdvice.daysLeft }} วันก่อนหมดเขตลดหย่อนปี {{ game.yearEndAdvice.taxYear }}
        </h3>
        <p>
          กองทุนและเบี้ยประกันต้องจ่ายภายใน 31 ธันวาคม ถ้าซื้อครบตามนี้
          ประหยัดภาษีได้ราว <strong>{{ formatBaht(game.yearEndAdvice.saving) }}</strong>
          <template v-if="fun"> — {{ fun.item.emoji }} เท่ากับ{{ fun.text }}</template>
        </p>
      </div>
      <RouterLink class="btn btn-ghost btn-sm" to="/deductions">
        วางแผนลดหย่อน
        <AppIcon name="arrowRight" :size="15" />
      </RouterLink>
    </div>

    <ul class="year-end-list">
      <li v-for="s in game.yearEndAdvice.suggestions" :key="s.key">
        <span>
          <b>{{ s.label }}</b>
          <small class="muted">{{ s.note }}</small>
        </span>
        <span class="money">
          {{ formatBaht(s.amount) }}
          <small class="text-ok">ประหยัด {{ formatBaht(s.saving) }}</small>
        </span>
      </li>
    </ul>
    <p class="small muted mt-1">ประมาณจากตัวเลขในแบบร่างที่กรอกไว้ ถ้ารายได้ปีนี้ต่างไปให้แก้ที่หน้าเตรียมแบบภาษี</p>
  </section>
</template>

<style scoped>
.year-end-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.year-end-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-2);
}
.year-end-list li > span {
  display: grid;
  gap: 2px;
}
.year-end-list .money {
  text-align: right;
  white-space: nowrap;
}
</style>
