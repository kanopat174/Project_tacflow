<script setup lang="ts">
/**
 * ตัวการ์ตูนของธีมน่ารัก (ซ่อนด้วย CSS ในรูปแบบอื่น) พร้อมกล่องคำพูด
 * อารมณ์และของแต่งตัวมาจากความคืบหน้าของผู้ใช้ ส่วน line เลือกประโยคประจำตัวของการ์ตูน
 * ถ้าอารมณ์ตอนนี้มีเรื่องจะบอก (เช่นเกินงบ ไม่ได้จดหลายวัน) จะพูดเรื่องนั้นแทนคำทักทาย
 */
import { computed } from 'vue'
import MascotFigure from './MascotFigure.vue'
import { findMascot } from '@/data/mascot'
import { useTheme } from '@/composables/useTheme'
import { useGameStore } from '@/stores/game'

const props = withDefaults(
  defineProps<{ size?: number; line?: 'greeting' | 'notFound' | ''; say?: string }>(),
  { size: 96, line: '', say: '' },
)

const theme = useTheme()
const game = useGameStore()
const current = computed(() => findMascot(theme.mascot.value))
const text = computed(() => {
  if (props.say) return props.say
  if (props.line === 'greeting' && game.mood.say) return game.mood.say
  return props.line ? current.value[props.line] : ''
})
</script>

<template>
  <div class="mascot" aria-hidden="true">
    <MascotFigure
      :key="current.key"
      :mascot="current.key"
      :size="size"
      :mood="line === 'notFound' ? 'normal' : game.mood.mood"
      :accessory="game.equipped"
    />
    <span v-if="text" :key="text" class="mascot-bubble">{{ text }}</span>
  </div>
</template>
