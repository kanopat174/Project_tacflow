import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

/** ทางลัดบนหน้าจอโฮม (manifest shortcuts) ส่งมาเป็น ?quick=... */
export const QUICK_INTENTS = ['expense', 'income', 'slip', 'voice'] as const
export type QuickIntent = (typeof QUICK_INTENTS)[number]

/** สถานะหน้าจอที่หลายส่วนของเว็บสั่งร่วมกัน เช่น เปิดบันทึกด่วนจากแถบค้นหา Ctrl+K */
export const useUiStore = defineStore('ui', () => {
  const quickAddOpen = ref(false)
  /** ประโยคที่จะเติมให้ในช่องพิมพ์ของบันทึกด่วนตอนเปิด */
  const quickAddText = ref('')
  /** ไฟล์ที่จะให้บันทึกด่วนอ่านทันทีตอนเปิด (สลิปหรือ e-Tax ที่แชร์มาจากแอปอื่น) */
  const quickAddFile = shallowRef<File | null>(null)
  /** เปิดบันทึกด่วนจากทางลัดบนหน้าจอโฮม — บอกว่าจะเริ่มทำอะไร */
  const quickAddIntent = ref<QuickIntent | ''>('')
  /** สลิปหลายใบที่รอสแกนพร้อมกัน — มีค่าคือเปิดหน้าต่างสแกนหลายใบ */
  const bulkSlipFiles = shallowRef<File[] | null>(null)
  const paletteOpen = ref(false)
  /** เมนูด้านข้างแบบลิ้นชัก (ไอแพดและมือถือ) — จอใหญ่เมนูแสดงตลอดไม่ใช้ค่านี้ */
  const navOpen = ref(false)

  function openQuickAdd(text = '', file: File | null = null, intent: QuickIntent | '' = '') {
    quickAddText.value = text
    quickAddFile.value = file
    quickAddIntent.value = intent
    quickAddOpen.value = true
  }

  function openBulkSlips(files: File[]) {
    if (files.length) bulkSlipFiles.value = files
  }

  return {
    quickAddOpen,
    quickAddText,
    quickAddFile,
    quickAddIntent,
    bulkSlipFiles,
    paletteOpen,
    navOpen,
    openQuickAdd,
    openBulkSlips,
  }
})
