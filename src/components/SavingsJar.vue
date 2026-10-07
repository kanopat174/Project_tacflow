<script setup lang="ts">
/**
 * โหลออมเงินที่ค่อย ๆ เต็มตามความคืบหน้า — เหรียญหล่นลงไปซ้อนกันตามสัดส่วนที่เก็บได้
 * ภาพตกแต่งเท่านั้น ตัวเลขจริงแสดงเป็นข้อความข้าง ๆ เสมอ (aria-hidden)
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ percent: number; size?: number; done?: boolean }>(), { size: 72, done: false })

const p = computed(() => Math.max(0, Math.min(1, props.percent)))
/** ด้านในโหลอยู่ที่ y 26–92 */
const TOP = 26
const BOTTOM = 92
const level = computed(() => BOTTOM - (BOTTOM - TOP) * p.value)

/** เหรียญเรียงเป็นชั้น ๆ จากก้นโหลขึ้นไปถึงระดับที่เต็ม */
const coins = computed(() => {
  const list: { x: number; y: number; delay: number }[] = []
  const rows = Math.floor(((BOTTOM - level.value) / 9) + 0.0001)
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? 7 : 0
    for (let c = 0; c < 4; c++) {
      const x = 27 + offset + c * 14
      if (x > 82) continue
      list.push({ x, y: BOTTOM - 5 - r * 9, delay: (r * 4 + c) * 0.04 })
    }
  }
  return list
})
</script>

<template>
  <svg class="savings-jar" :class="{ done }" :width="size" :height="size" viewBox="0 0 110 110" aria-hidden="true">
    <defs>
      <clipPath :id="`jar-clip-${size}`">
        <path d="M24 26 h62 v58 a10 10 0 0 1 -10 10 h-42 a10 10 0 0 1 -10 -10 Z" />
      </clipPath>
    </defs>
    <!-- ระดับเงินด้านหลังเหรียญ -->
    <g :clip-path="`url(#jar-clip-${size})`">
      <rect x="20" :y="level" width="70" :height="BOTTOM + 4 - level" class="jar-fill" />
      <g v-for="(c, i) in coins" :key="i" class="jar-coin" :style="{ animationDelay: `${c.delay}s` }">
        <ellipse :cx="c.x" :cy="c.y" rx="6.5" ry="3.6" />
      </g>
    </g>
    <!-- ตัวโหลและฝา -->
    <path d="M24 26 h62 v58 a10 10 0 0 1 -10 10 h-42 a10 10 0 0 1 -10 -10 Z" class="jar-glass" />
    <rect x="20" y="14" width="70" height="12" rx="4" class="jar-lid" />
    <path d="M32 36 v40" class="jar-shine" />
    <text v-if="done" x="55" y="62" text-anchor="middle" class="jar-star">★</text>
  </svg>
</template>

<style scoped>
.savings-jar {
  flex: none;
  overflow: visible;
}
.jar-glass {
  fill: color-mix(in srgb, var(--surface-2) 60%, transparent);
  stroke: var(--line-strong);
  stroke-width: 2.5;
}
.jar-lid {
  fill: var(--accent);
  stroke: var(--line-strong);
  stroke-width: 2;
}
.jar-fill {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  transition: y 0.8s var(--ease-out), height 0.8s var(--ease-out);
}
.jar-coin ellipse {
  fill: #ffd34d;
  stroke: #b8860b;
  stroke-width: 1.4;
}
.jar-coin {
  animation: coin-drop 0.5s var(--ease-out) both;
}
.jar-shine {
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 3;
  stroke-linecap: round;
}
.jar-star {
  font-size: 26px;
  fill: var(--surface);
  stroke: var(--line-strong);
  stroke-width: 1.2;
}
@keyframes coin-drop {
  from {
    transform: translateY(-40px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .jar-coin {
    animation: none;
  }
  .jar-fill {
    transition: none;
  }
}
</style>
