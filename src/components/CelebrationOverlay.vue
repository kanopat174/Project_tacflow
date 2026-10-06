<script setup lang="ts">
/**
 * ฉลองเมื่อทำสำเร็จ: พลุกระดาษ + ตัวการ์ตูนกระโดดดีใจ
 * แสดงทีละรายการจากคิว ปิดเองหลังไม่กี่วินาทีหรือกดปิด
 * ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวจะเห็นแค่กล่องข้อความ (กฎ prefers-reduced-motion ใน CSS)
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import MascotFigure from './MascotFigure.vue'
import { useTheme } from '@/composables/useTheme'
import { useCelebrateStore } from '@/stores/celebrate'
import { useGameStore } from '@/stores/game'

const celebrate = useCelebrateStore()
const theme = useTheme()
const game = useGameStore()

const current = computed(() => celebrate.queue[0] ?? null)

const COLORS = ['#ff6f9f', '#ffd34d', '#7fd8c8', '#8fc9ff', '#b49de8', '#ff9f4a']
/** ตำแหน่งและจังหวะของพลุแต่ละชิ้น สุ่มครั้งเดียวต่อการฉลอง */
const pieces = computed(() =>
  current.value
    ? Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        rotate: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      }))
    : [],
)

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    if (id) timer = setTimeout(() => celebrate.dismiss(), 4200)
  },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="celebrate">
    <div v-if="current" :key="current.id" class="celebration" role="status" aria-live="polite" @click="celebrate.dismiss()">
      <div class="confetti" aria-hidden="true">
        <i
          v-for="p in pieces"
          :key="p.id"
          :class="{ round: p.round }"
          :style="{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }"
        ></i>
      </div>
      <div class="celebration-card">
        <MascotFigure
          class="celebration-mascot"
          :mascot="theme.mascot.value"
          :size="104"
          mood="happy"
          :accessory="game.equipped"
        />
        <span class="celebration-icon" aria-hidden="true">{{ current.icon }}</span>
        <strong>{{ current.title }}</strong>
        <p>{{ current.text }}</p>
        <small>แตะเพื่อปิด</small>
      </div>
    </div>
  </Transition>
</template>
