<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toast-zone" aria-live="polite">
    <TransitionGroup name="toast-in">
      <div v-for="item in toast.items" :key="item.id" class="toast" :class="item.kind">
        {{ item.message }}
        <button v-if="item.action" type="button" class="toast-action" @click="toast.runAction(item)">
          {{ item.action.label }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-action {
  margin-left: 12px;
  padding: 2px 12px;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
</style>
