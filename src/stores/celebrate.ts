import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Celebration {
  id: number
  icon: string
  title: string
  text: string
}

/** คิวการฉลอง (พลุกระดาษ + ตัวการ์ตูนดีใจ) แสดงทีละรายการ */
export const useCelebrateStore = defineStore('celebrate', () => {
  const queue = ref<Celebration[]>([])
  let seq = 0

  function show(input: Omit<Celebration, 'id'>) {
    // กันฉลองซ้ำเรื่องเดิมติดกัน
    if (queue.value.some((c) => c.title === input.title && c.text === input.text)) return
    queue.value.push({ ...input, id: ++seq })
  }

  function dismiss() {
    queue.value.shift()
  }

  return { queue, show, dismiss }
})
