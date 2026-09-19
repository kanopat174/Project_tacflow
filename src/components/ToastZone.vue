<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toast-zone" aria-live="polite">
    <TransitionGroup name="toast-in">
      <div v-for="item in toast.items" :key="item.id" class="toast" :class="item.kind">
        {{ item.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
