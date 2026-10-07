import { ref } from 'vue'
import { defineStore } from 'pinia'

/** สถานะหน้าจอที่หลายส่วนของเว็บสั่งร่วมกัน เช่น เปิดบันทึกด่วนจากแถบค้นหา Ctrl+K */
export const useUiStore = defineStore('ui', () => {
  const quickAddOpen = ref(false)
  /** ประโยคที่จะเติมให้ในช่องพิมพ์ของบันทึกด่วนตอนเปิด */
  const quickAddText = ref('')
  const paletteOpen = ref(false)
  /** เมนูด้านข้างแบบลิ้นชัก (ไอแพดและมือถือ) — จอใหญ่เมนูแสดงตลอดไม่ใช้ค่านี้ */
  const navOpen = ref(false)

  function openQuickAdd(text = '') {
    quickAddText.value = text
    quickAddOpen.value = true
  }

  return { quickAddOpen, quickAddText, paletteOpen, navOpen, openQuickAdd }
})
