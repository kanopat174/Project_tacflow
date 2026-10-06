<script setup lang="ts">
/**
 * โดนัทสัดส่วน วาดด้วยเส้นรอบวงของ SVG circle และ stroke-dasharray
 * ใช้แสดงว่าเงินทุนหรือรายจ่ายกระจายอยู่ตรงไหนบ้าง
 */
import { computed } from 'vue'
import { formatBaht } from '@/services/taxEngine'

export interface Slice {
  label: string
  value: number
}

const props = defineProps<{ slices: Slice[]; centerLabel: string; centerValue: string }>()

/** สีตามชุดสีที่ผู้ใช้เลือก (กำหนดใน style.css) — เปลี่ยนชุดสีแล้วกราฟเปลี่ยนตามทันที */
const PALETTE = Array.from({ length: 7 }, (_, i) => `var(--chart-${i + 1})`)
const R = 60
const C = 2 * Math.PI * R

const total = computed(() => props.slices.reduce((sum, s) => sum + Math.max(0, s.value), 0))

/** แปลงแต่ละส่วนเป็นความยาวเส้นประและจุดเริ่ม เพื่อวางต่อกันรอบวง */
const arcs = computed(() => {
  let offset = 0
  return props.slices
    .filter((s) => s.value > 0)
    .map((slice, index) => {
      const share = total.value > 0 ? slice.value / total.value : 0
      const length = share * C
      const arc = {
        ...slice,
        share,
        color: PALETTE[index % PALETTE.length]!,
        dash: `${length} ${C - length}`,
        offset: -offset,
      }
      offset += length
      return arc
    })
})
</script>

<template>
  <div class="donut">
    <svg viewBox="0 0 160 160" role="img" :aria-label="`สัดส่วน${centerLabel}`">
      <circle cx="80" cy="80" :r="R" fill="none" stroke="var(--surface-2)" stroke-width="20" />
      <circle
        v-for="arc in arcs"
        :key="arc.label"
        cx="80"
        cy="80"
        :r="R"
        fill="none"
        :style="{ stroke: arc.color }"
        stroke-width="20"
        :stroke-dasharray="arc.dash"
        :stroke-dashoffset="arc.offset"
        transform="rotate(-90 80 80)"
      >
        <title>{{ arc.label }} {{ formatBaht(arc.value) }}</title>
      </circle>
      <text x="80" y="74" text-anchor="middle" class="donut-label">{{ centerLabel }}</text>
      <text x="80" y="95" text-anchor="middle" class="donut-value">{{ centerValue }}</text>
    </svg>

    <ul class="donut-legend">
      <li v-for="arc in arcs" :key="arc.label">
        <i class="swatch" :style="{ background: arc.color }"></i>
        <span class="name">{{ arc.label }}</span>
        <span class="num">{{ formatBaht(arc.value) }}</span>
        <span class="muted small">{{ (arc.share * 100).toFixed(0) }}%</span>
      </li>
    </ul>
  </div>
</template>
