<script setup lang="ts">
/** ภารกิจหน้ายื่นภาษี (1 ม.ค. – 8 เม.ย.) — เช็กลิสต์ทีละขั้นจนยื่นเสร็จ ทำครบแล้วฉลอง */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const doneCount = computed(() => game.mission?.filter((s) => s.done).length ?? 0)
const total = computed(() => game.mission?.length ?? 0)
const next = computed(() => game.mission?.find((s) => !s.done) ?? null)
</script>

<template>
  <section v-if="game.season && game.mission" class="card tax-season">
    <div class="card-head">
      <div>
        <h3>🧾 ภารกิจยื่นภาษีปี {{ game.season.taxYear }}</h3>
        <p>
          เหลือ {{ game.season.daysLeft }} วัน (ถึง {{ thaiDate(game.season.deadline) }}) ·
          ทำแล้ว {{ doneCount }}/{{ total }} ขั้น · บันทึกสรุปก่อน 1 มี.ค. แล้วยื่นจริง ได้เหรียญ "นักยื่นไว" ⚡
        </p>
      </div>
      <RouterLink v-if="next" class="btn btn-primary btn-sm" :to="next.to">
        ทำขั้นถัดไป
        <AppIcon name="arrowRight" :size="15" />
      </RouterLink>
    </div>

    <div class="cap-bar mb-2"><span :style="{ width: `${(doneCount / Math.max(1, total)) * 100}%` }"></span></div>

    <ol class="mission-list">
      <li v-for="step in game.mission" :key="step.key" :class="{ done: step.done }">
        <span class="mission-dot" aria-hidden="true">
          <AppIcon v-if="step.done" name="check" :size="14" />
        </span>
        <RouterLink :to="step.to">{{ step.title }}</RouterLink>
        <span class="sr-only">{{ step.done ? '(เสร็จแล้ว)' : '(ยังไม่ทำ)' }}</span>
      </li>
    </ol>
    <p v-if="!next" class="mt-1" style="margin-bottom: 0">ยื่นภาษีปีนี้เสร็จครบทุกขั้นแล้ว 🎉</p>
  </section>
</template>

<style scoped>
.mission-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.mission-list li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mission-list li.done a {
  text-decoration: line-through;
  color: var(--text-dim);
}
.mission-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  display: grid;
  place-items: center;
  flex: none;
}
li.done .mission-dot {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
}
</style>
