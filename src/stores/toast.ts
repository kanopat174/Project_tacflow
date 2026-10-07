import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastKind = 'info' | 'ok' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  /** ปุ่มในข้อความ เช่น "เลิกทำ" */
  action?: ToastAction
}

/** เวลาที่ยังกดเลิกทำได้หลังลบ */
export const UNDO_WINDOW_MS = 6_000

/** คิวข้อความแจ้งเตือนมุมล่างจอ — เรียกได้จากทุกหน้า */
export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])
  let sequence = 0

  function push(message: string, kind: ToastKind = 'info', durationMs = 4200, action?: ToastAction): number {
    const id = ++sequence
    items.value.push({ id, message, kind, action })
    setTimeout(() => dismiss(id), durationMs)
    return id
  }

  function dismiss(id: number): void {
    const index = items.value.findIndex((item) => item.id === id)
    if (index !== -1) items.value.splice(index, 1)
  }

  /** กดปุ่มในข้อความแล้วปิดข้อความนั้นทันที */
  function runAction(item: ToastItem): void {
    dismiss(item.id)
    item.action?.run()
  }

  return {
    items,
    push,
    dismiss,
    runAction,
    success: (message: string) => push(message, 'ok'),
    error: (message: string) => push(message, 'error'),
    /** ข้อความที่มีปุ่มเลิกทำ — แสดงนานเท่ากับเวลาที่ยังเลิกทำได้ */
    undoable: (message: string, undo: () => void, durationMs = UNDO_WINDOW_MS) =>
      push(message, 'ok', durationMs, { label: 'เลิกทำ', run: undo }),
  }
})
