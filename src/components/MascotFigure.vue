<script setup lang="ts">
/**
 * รูปตัวการ์ตูนพร้อมของแต่งตัวและหน้าตาตามอารมณ์
 * รูปหลักมาจาก SVG คงที่ ส่วนของแต่งตัว/อารมณ์วาดซ้อนด้านบนด้วยตำแหน่งประจำตัวของแต่ละตัว
 */
import { computed } from 'vue'
import { findMascot, type MascotKey } from '@/data/mascot'
import type { Accessory, Mood } from '@/services/gamification'

const props = withDefaults(
  defineProps<{ mascot: MascotKey; size?: number; mood?: Mood; accessory?: Accessory }>(),
  { size: 96, mood: 'normal', accessory: 'none' },
)

const def = computed(() => findMascot(props.mascot))
const a = computed(() => def.value.anchors)
const INK = '#5b3a4a'
</script>

<template>
  <span
    class="mascot-figure"
    :class="`mood-${mood}`"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <!-- SVG เป็นค่าคงที่ในโค้ดเอง ไม่ได้มาจากผู้ใช้ จึงใส่ด้วย v-html ได้ปลอดภัย -->
    <span class="mascot-base" v-html="def.svg"></span>
    <svg class="mascot-overlay" viewBox="0 0 120 120">
      <!-- ง่วง: ปิดตาเป็นเส้นโค้ง + Zzz -->
      <g v-if="mood === 'sleepy'">
        <g v-for="side in [-1, 1]" :key="side">
          <circle :cx="60 + side * a.eyeGap" :cy="a.eyeY" :r="a.eyeR + 1.6" :fill="a.body" />
          <path
            :d="`M${60 + side * a.eyeGap - a.eyeR} ${a.eyeY} q${a.eyeR} ${a.eyeR * 0.9} ${a.eyeR * 2} 0`"
            fill="none"
            :stroke="INK"
            stroke-width="2.6"
            stroke-linecap="round"
          />
        </g>
        <g class="zzz" font-family="sans-serif" font-weight="700" :fill="INK">
          <text x="92" y="30" font-size="13">z</text>
          <text x="100" y="18" font-size="17">Z</text>
        </g>
      </g>

      <!-- กังวล: หยดเหงื่อ -->
      <path
        v-if="mood === 'worried'"
        class="sweat"
        :d="`M${60 + a.eyeGap + 14} ${a.eyeY - 20} q6 9 0 13 q-6 -4 0 -13 Z`"
        fill="#8fd3ff"
        :stroke="INK"
        stroke-width="1.8"
      />

      <!-- ดีใจ: ประกายรอบตัว -->
      <g v-if="mood === 'happy'" class="sparkles" fill="#ffc94d">
        <path d="M14 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" />
        <path d="M100 22 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
        <path d="M104 78 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 l4 -2 Z" />
      </g>

      <!-- ของแต่งตัว -->
      <g v-if="accessory === 'glasses'" fill="rgba(255,255,255,.25)" :stroke="INK" stroke-width="2.6">
        <circle :cx="60 - a.eyeGap" :cy="a.eyeY" :r="a.eyeR + 5" />
        <circle :cx="60 + a.eyeGap" :cy="a.eyeY" :r="a.eyeR + 5" />
        <path :d="`M${60 - a.eyeGap + a.eyeR + 5} ${a.eyeY} h${(a.eyeGap - a.eyeR - 5) * 2}`" fill="none" />
      </g>

      <g v-if="accessory === 'scarf'" :stroke="INK" stroke-width="2.4" stroke-linejoin="round">
        <rect :x="60 - a.neckW / 2" :y="a.neckY - 6" :width="a.neckW" height="11" rx="5.5" fill="#ff7a8a" />
        <path :d="`M${60 + a.neckW / 4} ${a.neckY + 3} l4 15 l9 -2 l-5 -14 Z`" fill="#ff7a8a" />
        <path :d="`M${60 - a.neckW / 2 + 8} ${a.neckY - 4} v8 M${60 - a.neckW / 2 + 18} ${a.neckY - 4} v8`" stroke="#ffd1d6" />
      </g>

      <g v-if="accessory === 'bow'" :transform="`translate(${60 + 20} ${a.headTop + 4})`" :stroke="INK" stroke-width="2.2" stroke-linejoin="round">
        <path d="M0 0 l-12 -8 v16 Z" fill="#ff6f9f" />
        <path d="M0 0 l12 -8 v16 Z" fill="#ff6f9f" />
        <circle r="3.6" fill="#ff9fbf" />
      </g>

      <g v-if="accessory === 'hat'" :transform="`translate(60 ${a.headTop + 2})`" :stroke="INK" stroke-width="2.4" stroke-linejoin="round">
        <path d="M-13 0 L0 -30 L13 0 Z" fill="#8fc9ff" />
        <path d="M-8 -11 L7 -6 M-4 -21 L4 -18" stroke="#fff" stroke-width="2.6" />
        <circle cy="-31" r="4.5" fill="#ffd866" />
      </g>

      <g v-if="accessory === 'crown'" :transform="`translate(60 ${a.headTop + 3})`" :stroke="INK" stroke-width="2.4" stroke-linejoin="round">
        <path d="M-16 0 L-16 -16 L-8 -8 L0 -20 L8 -8 L16 -16 L16 0 Z" fill="#ffd34d" />
        <circle cy="-6" r="2.6" fill="#ff6f9f" stroke="none" />
      </g>
    </svg>
  </span>
</template>
