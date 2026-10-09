<script setup lang="ts">
/** โลโก้เต็ม Jodwise (จดไว้) — มีสองไฟล์ ตัวอักษรเข้มสำหรับธีมสว่าง และตัวอักษรสว่างสำหรับธีมมืด (สลับด้วย CSS) */
withDefaults(defineProps<{ height?: number }>(), { height: 56 })
</script>

<template>
  <span class="brand-wordmark" :style="{ height: `${height}px` }">
    <img class="wm-light" src="@/assets/brand/logo-jodwise.png" alt="Jodwise จดไว้" />
    <img class="wm-dark" src="@/assets/brand/logo-jodwise-light.png" alt="" aria-hidden="true" />
  </span>
</template>
