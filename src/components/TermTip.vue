<script setup lang="ts">
/**
 * คำศัพท์ภาษีที่แตะแล้วเห็นคำอธิบาย — ใช้ <TermTip term="netIncome">เงินได้สุทธิ</TermTip>
 * เปิดด้วยการแตะหรือกด Enter ปิดด้วย Escape หรือแตะที่อื่น ใช้ได้ทั้งมือถือและคีย์บอร์ด
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { findTerm } from '@/data/glossary'

const props = defineProps<{ term: string }>()
const entry = computed(() => findTerm(props.term))
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const id = useId()

function onDocument(event: Event) {
  if (event instanceof KeyboardEvent) {
    if (event.key === 'Escape') open.value = false
    return
  }
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

watch(open, (isOpen) => {
  const method = isOpen ? 'addEventListener' : 'removeEventListener'
  document[method]('click', onDocument)
  document[method]('keydown', onDocument)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocument)
  document.removeEventListener('keydown', onDocument)
})
</script>

<template>
  <span v-if="entry" ref="root" class="term-tip">
    <button
      type="button"
      class="term-tip-btn"
      :aria-expanded="open"
      :aria-controls="id"
      @click.stop.prevent="open = !open"
    >
      <slot>{{ entry.term }}</slot>
    </button>
    <span v-if="open" :id="id" class="term-tip-pop" role="tooltip">
      <b>{{ entry.term }}</b>
      <span>{{ entry.short }}</span>
      <small v-if="entry.example">ตัวอย่าง: {{ entry.example }}</small>
      <RouterLink v-if="entry.to" :to="entry.to" @click="open = false">อ่านเพิ่ม →</RouterLink>
      <RouterLink to="/glossary" class="muted" @click="open = false">คำศัพท์ทั้งหมด</RouterLink>
    </span>
  </span>
  <slot v-else />
</template>

<style scoped>
.term-tip {
  position: relative;
  display: inline;
}
.term-tip-btn {
  all: unset;
  cursor: help;
  border-bottom: 1.5px dotted currentColor;
  text-underline-offset: 3px;
}
.term-tip-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 3px;
}
.term-tip-pop {
  position: absolute;
  z-index: 60;
  left: 0;
  top: calc(100% + 6px);
  width: min(300px, 80vw);
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
  font-size: 0.88rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
}
.term-tip-pop small {
  opacity: 0.8;
}
</style>
