import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastKind = 'info' | 'ok' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

/** คิวข้อความแจ้งเตือนมุมล่างจอ — เรียกได้จากทุกหน้า */
export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])
  let sequence = 0

  function push(message: string, kind: ToastKind = 'info', durationMs = 4200): void {
    const id = ++sequence
    items.value.push({ id, message, kind })
    setTimeout(() => dismiss(id), durationMs)
  }

  function dismiss(id: number): void {
    const index = items.value.findIndex((item) => item.id === id)
    if (index !== -1) items.value.splice(index, 1)
  }

  return {
    items,
    push,
    dismiss,
    success: (message: string) => push(message, 'ok'),
    error: (message: string) => push(message, 'error'),
  }
})
