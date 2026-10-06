<script setup lang="ts">
/** รูปวงกลมของผู้ใช้หรือสมุดบัญชี — ยังไม่มีรูปจะแสดงอักษรตัวแรกของชื่อแทน */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ src?: string; name?: string; size?: number }>(), {
  src: '',
  name: '',
  size: 32,
})

const initial = computed(() => (props.name || '?').trim().charAt(0) || '?')
</script>

<template>
  <span
    class="avatar"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }"
  >
    <img v-if="src" :src="src" :alt="name ? `รูปของ ${name}` : ''" />
    <template v-else>{{ initial }}</template>
  </span>
</template>
