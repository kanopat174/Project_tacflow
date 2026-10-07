<script setup lang="ts">
/**
 * รายรับ–รายจ่ายรายเดือน แบบแท่งคู่
 *
 * ของเดิมยืด SVG ด้วย preserveAspectRatio="none" แล้วกราฟสูงเกินกล่อง ทับการ์ดข้างล่าง
 * ของใหม่วัดความกว้างจริงด้วย ResizeObserver แล้ววาดเป็นพิกเซล ตัวอักษรและแท่งจึงไม่บิดเบี้ยว
 * มีแกนตัวเลข ป้ายเดือนภาษาไทย ทูลทิปเมื่อชี้/แตะ/โฟกัส และตารางซ่อนสำหรับโปรแกรมอ่านหน้าจอ
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatBaht } from '@/services/taxEngine'
import type { MonthlyPoint } from '@/services/ledgerEngine'

const props = withDefaults(defineProps<{ points: MonthlyPoint[]; height?: number; maxMonths?: number }>(), {
  height: 240,
  maxMonths: 12,
})

const box = ref<HTMLElement | null>(null)
const width = ref(600)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!box.value) return
  width.value = box.value.clientWidth || 600
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(([entry]) => (width.value = Math.max(260, entry!.contentRect.width)))
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const data = computed(() => [...props.points].sort((a, b) => a.month.localeCompare(b.month)).slice(-props.maxMonths))

const PAD = { top: 22, right: 8, bottom: 30, left: 56 }
const plotW = computed(() => width.value - PAD.left - PAD.right)
const plotH = computed(() => props.height - PAD.top - PAD.bottom)

/** ขั้นแกนที่อ่านง่าย 1 / 2 / 2.5 / 5 × 10^n */
function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 1_000, step: 250 }
  const raw = value / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!
  return { max: step * Math.ceil(value / step), step }
}
// เผื่อหัวแท่ง 10% ให้ป้ายตัวเลขบนแท่งสูงสุดไม่ชนขอบ
const scale = computed(() => niceMax(Math.max(...data.value.flatMap((p) => [p.income, p.expense]), 0) * 1.1))
const ticks = computed(() => {
  const list: number[] = []
  for (let v = 0; v <= scale.value.max + 1e-6; v += scale.value.step) list.push(v)
  return list
})
const y = (v: number) => PAD.top + plotH.value - (v / scale.value.max) * plotH.value

const band = computed(() => plotW.value / Math.max(1, data.value.length))
/** แท่งกว้างไม่เกิน 28px ห่างกัน 2px และเว้นขอบกลุ่ม */
const barW = computed(() => Math.max(6, Math.min(36, (band.value * 0.7 - 2) / 2)))
const groupX = (i: number) => PAD.left + band.value * i + band.value / 2

function shortAmount(v: number): string {
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} ล.`
  if (v >= 1_000) return `${+(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)} พัน`
  return String(Math.round(v))
}
function monthLabel(month: string): string {
  const [yy, mm] = month.split('-').map(Number)
  const d = new Date(yy!, mm! - 1, 1)
  return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
}
/** มุมบนมน 4px ฐานตรงติดแกน */
function barPath(x: number, value: number): string {
  const top = y(value)
  const base = y(0)
  const h = base - top
  if (h <= 0) return ''
  const r = Math.min(4, h, barW.value / 2)
  const w = barW.value
  return `M${x} ${base} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + w - r} Q${x + w} ${top} ${x + w} ${top + r} V${base} Z`
}

/* ---------- ทูลทิป ---------- */
const active = ref<number | null>(null)
const tip = computed(() => {
  if (active.value === null) return null
  const p = data.value[active.value]
  if (!p) return null
  // วางข้างแท่ง ไม่ทับแท่งที่กำลังดู: ด้านขวาถ้าพอ ไม่งั้นด้านซ้าย จอแคบมากค่อยวางชิดขอบ
  const TIP_W = 190
  const right = groupX(active.value) + barW.value + 12
  const leftSide = groupX(active.value) - barW.value - 12 - TIP_W
  const left = right + TIP_W <= width.value ? right : leftSide >= 0 ? leftSide : Math.max(0, width.value - TIP_W)
  return { p, left }
})
const showLabels = computed(() => band.value >= 70)
</script>

<template>
  <div class="monthly-chart">
    <div class="mc-legend" aria-hidden="true">
      <span><i class="sw income"></i>รายรับ</span>
      <span><i class="sw expense"></i>รายจ่าย</span>
    </div>

    <div ref="box" class="mc-plot" @mouseleave="active = null">
      <svg :width="width" :height="height" aria-hidden="true">
        <!-- เส้นอ้างอิงจาง ๆ พร้อมตัวเลขแกน -->
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" class="mc-grid" :class="{ base: t === 0 }" />
          <text :x="PAD.left - 8" :y="y(t) + 4" text-anchor="end" class="mc-axis">{{ shortAmount(t) }}</text>
        </g>

        <g v-for="(p, i) in data" :key="p.month">
          <rect
            :x="groupX(i) - band / 2"
            :y="PAD.top"
            :width="band"
            :height="plotH"
            class="mc-hover"
            :class="{ on: active === i }"
          />
          <path :d="barPath(groupX(i) - barW - 1, p.income)" class="mc-bar income" />
          <path :d="barPath(groupX(i) + 1, p.expense)" class="mc-bar expense" />
          <template v-if="showLabels">
            <text v-if="p.income > 0" :x="groupX(i) - barW / 2 - 1" :y="y(p.income) - 5" text-anchor="middle" class="mc-val">
              {{ shortAmount(p.income) }}
            </text>
            <text v-if="p.expense > 0" :x="groupX(i) + barW / 2 + 1" :y="y(p.expense) - 5" text-anchor="middle" class="mc-val">
              {{ shortAmount(p.expense) }}
            </text>
          </template>
          <text :x="groupX(i)" :y="height - 8" text-anchor="middle" class="mc-axis">{{ monthLabel(p.month) }}</text>
        </g>
      </svg>

      <!-- พื้นที่รับชี้/แตะ/โฟกัส กว้างเต็มช่องของเดือน ใหญ่กว่าแท่งเสมอ -->
      <button
        v-for="(p, i) in data"
        :key="`hit-${p.month}`"
        type="button"
        class="mc-hit"
        :style="{ left: `${groupX(i) - band / 2}px`, width: `${band}px`, top: `${PAD.top}px`, height: `${plotH}px` }"
        :aria-label="`${monthLabel(p.month)} รายรับ ${formatBaht(p.income)} รายจ่าย ${formatBaht(p.expense)}`"
        @mouseenter="active = i"
        @focus="active = i"
        @blur="active = null"
        @click="active = active === i ? null : i"
      ></button>

      <div v-if="tip" class="mc-tip" :style="{ left: `${tip.left}px` }" role="status">
        <b>{{ monthLabel(tip.p.month) }}</b>
        <span><i class="sw income"></i>รายรับ <em>{{ formatBaht(tip.p.income) }}</em></span>
        <span><i class="sw expense"></i>รายจ่าย <em>{{ formatBaht(tip.p.expense) }}</em></span>
        <span class="mc-net">คงเหลือ <em :class="tip.p.net >= 0 ? 'text-ok' : 'text-bad'">{{ formatBaht(tip.p.net) }}</em></span>
      </div>
    </div>

    <!-- ห่อด้วย div เพราะตารางไม่ยอมหดตาม width: 1px ของ .sr-only แล้วดันหน้าเว็บให้กว้างเกินจอมือถือ -->
    <div class="sr-only">
      <table>
        <caption>รายรับและรายจ่ายรายเดือน</caption>
        <thead><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>คงเหลือ</th></tr></thead>
        <tbody>
          <tr v-for="p in data" :key="`row-${p.month}`">
            <td>{{ monthLabel(p.month) }}</td>
            <td>{{ formatBaht(p.income) }}</td>
            <td>{{ formatBaht(p.expense) }}</td>
            <td>{{ formatBaht(p.net) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.monthly-chart {
  display: grid;
  gap: 10px;
}
.mc-legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-dim);
}
.mc-legend span,
.mc-tip span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.sw.income {
  background: var(--viz-income);
}
.sw.expense {
  background: var(--viz-expense);
}
.mc-plot {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.mc-plot svg {
  display: block;
}
.mc-grid {
  stroke: var(--line);
  stroke-width: 1;
}
.mc-grid.base {
  stroke: var(--line-strong);
}
.mc-axis {
  font-size: 11.5px;
  fill: var(--text-dim);
  font-family: var(--font-body);
}
.mc-val {
  font-size: 11px;
  fill: var(--text-dim);
  font-family: var(--font-body);
  font-variant-numeric: tabular-nums;
}
.mc-bar.income {
  fill: var(--viz-income);
}
.mc-bar.expense {
  fill: var(--viz-expense);
}
.mc-hover {
  fill: transparent;
}
.mc-hover.on {
  fill: color-mix(in srgb, var(--text) 5%, transparent);
}
.mc-hit {
  position: absolute;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.mc-hit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 6px;
}
.mc-tip {
  position: absolute;
  top: 4px;
  display: grid;
  gap: 4px;
  width: 190px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  pointer-events: none;
}
.mc-tip em {
  font-style: normal;
  font-family: var(--font-data);
  margin-left: auto;
  padding-left: 12px;
}
.mc-tip span {
  justify-content: flex-start;
}
.mc-net {
  border-top: 1px solid var(--line);
  padding-top: 4px;
}
</style>
