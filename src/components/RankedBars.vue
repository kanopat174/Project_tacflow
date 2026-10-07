<script setup lang="ts">
/**
 * แท่งแนวนอนเรียงจากมากไปน้อย — ใช้แทนโดนัท เพราะเทียบขนาดด้วยความยาวได้แม่นกว่ามุมของวง
 * และป้ายชื่ออยู่บนแท่งของตัวเองเลย ไม่ต้องจับคู่สีกับคำอธิบาย
 * แถว "อื่น ๆ" (muted) แสดงท้ายสุดด้วยสีจาง ไม่นับเป็นอันดับ
 */
import { computed } from 'vue'
import { formatBaht } from '@/services/taxEngine'

export interface RankedRow {
  label: string
  value: number
  /** ข้อความเล็กใต้ชื่อ */
  sub?: string
  /** แถวรวมเศษ เช่น "หมวดอื่น ๆ" */
  muted?: boolean
}

const props = defineProps<{ rows: RankedRow[]; total?: number }>()

const visible = computed(() => props.rows.filter((r) => r.value > 0))
const sum = computed(() => props.total ?? visible.value.reduce((s, r) => s + r.value, 0))
const max = computed(() => Math.max(1, ...visible.value.map((r) => r.value)))
</script>

<template>
  <ol class="ranked">
    <li v-for="(row, i) in visible" :key="row.label" :class="{ muted: row.muted }">
      <div class="rk-head">
        <span class="rk-rank" aria-hidden="true">{{ row.muted ? '·' : i + 1 }}</span>
        <span class="rk-label">
          {{ row.label }}
          <small v-if="row.sub" class="muted">{{ row.sub }}</small>
        </span>
        <span class="rk-num">
          {{ formatBaht(row.value) }}
          <small>{{ sum > 0 ? Math.round((row.value / sum) * 100) : 0 }}%</small>
        </span>
      </div>
      <div class="rk-track" aria-hidden="true">
        <span class="rk-bar" :style="{ width: `${(row.value / max) * 100}%` }"></span>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.ranked {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.rk-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.rk-rank {
  width: 22px;
  height: 22px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 700;
  align-self: center;
}
.rk-label {
  flex: 1;
  min-width: 0;
  display: grid;
  font-weight: 500;
}
.rk-label small {
  font-weight: 400;
  font-size: 12.5px;
}
.rk-num {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}
.rk-num small {
  display: inline-block;
  min-width: 3.2em;
  color: var(--text-dim);
  font-size: 12px;
}
.rk-track {
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  margin-left: 32px;
  overflow: hidden;
}
.rk-bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.6s var(--ease-out);
}
li.muted .rk-bar {
  background: var(--line-strong);
}
li.muted .rk-rank {
  background: var(--surface-2);
  color: var(--text-dim);
}
@media (prefers-reduced-motion: reduce) {
  .rk-bar {
    transition: none;
  }
}
</style>
