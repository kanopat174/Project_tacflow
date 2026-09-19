<script setup lang="ts">
/**
 * กราฟเส้นรายรับ/รายจ่ายรายเดือน วาดด้วย SVG ตรง ๆ ไม่ต้องพึ่งไลบรารีกราฟ
 * ใช้ viewBox กับ preserveAspectRatio="none" ให้ยืดเต็มความกว้างของการ์ด
 */
import { computed } from 'vue'
import { formatBaht } from '@/services/taxEngine'
import type { MonthlyPoint } from '@/services/ledgerEngine'

const props = withDefaults(defineProps<{ points: MonthlyPoint[]; height?: number }>(), {
  height: 200,
})

const W = 640
const H = 200
const PAD = { top: 14, right: 8, bottom: 26, left: 8 }

const max = computed(() =>
  Math.max(1, ...props.points.flatMap((p) => [p.income, p.expense])),
)

function x(index: number): number {
  const n = props.points.length
  if (n <= 1) return W / 2
  return PAD.left + (index * (W - PAD.left - PAD.right)) / (n - 1)
}

function y(value: number): number {
  const usable = H - PAD.top - PAD.bottom
  return PAD.top + usable - (value / max.value) * usable
}

function path(key: 'income' | 'expense'): string {
  return props.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`).join(' ')
}

/** พื้นที่ใต้เส้นรายรับ ปิดท้ายด้วยการลากกลับมาที่ฐาน */
const incomeArea = computed(() => {
  if (!props.points.length) return ''
  const base = H - PAD.bottom
  return `${path('income')} L ${x(props.points.length - 1)} ${base} L ${x(0)} ${base} Z`
})

/** แสดงป้ายเดือนไม่เกิน 6 จุด ไม่งั้นตัวอักษรจะทับกัน */
const labelStep = computed(() => Math.max(1, Math.ceil(props.points.length / 6)))
</script>

<template>
  <div class="trend-chart" :style="{ height: `${height}px` }">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img"
      :aria-label="`กราฟรายรับและรายจ่าย ${points.length} เดือน`">
      <defs>
        <linearGradient id="incomeFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--ok)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--ok)" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- เส้นแนวนอนอ้างอิง 4 ระดับ -->
      <line
        v-for="n in 4"
        :key="n"
        :x1="PAD.left"
        :x2="W - PAD.right"
        :y1="y((max / 4) * n)"
        :y2="y((max / 4) * n)"
        stroke="var(--line)"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />

      <path :d="incomeArea" fill="url(#incomeFade)" />
      <path :d="path('income')" fill="none" stroke="var(--ok)" stroke-width="2.5"
        vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <path :d="path('expense')" fill="none" stroke="var(--bad)" stroke-width="2.5"
        stroke-dasharray="6 4" vector-effect="non-scaling-stroke" stroke-linejoin="round" />

      <g v-for="(p, i) in points" :key="p.month">
        <circle :cx="x(i)" :cy="y(p.income)" r="3.5" fill="var(--ok)" vector-effect="non-scaling-stroke">
          <title>{{ p.month }} รายรับ {{ formatBaht(p.income) }}</title>
        </circle>
        <circle :cx="x(i)" :cy="y(p.expense)" r="3.5" fill="var(--bad)" vector-effect="non-scaling-stroke">
          <title>{{ p.month }} รายจ่าย {{ formatBaht(p.expense) }}</title>
        </circle>
      </g>
    </svg>

    <div class="trend-labels">
      <span v-for="(p, i) in points" :key="p.month" :class="{ hide: i % labelStep !== 0 }">
        {{ p.month.slice(5) }}/{{ p.month.slice(2, 4) }}
      </span>
    </div>

    <div class="trend-legend">
      <span><i class="dot ok"></i> รายรับ</span>
      <span><i class="dot bad dashed"></i> รายจ่าย</span>
    </div>
  </div>
</template>
