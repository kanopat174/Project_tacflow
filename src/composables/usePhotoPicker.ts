import { ref } from 'vue'
import { MAX_EVIDENCE_BYTES } from '@/data/evidenceTypes'
import { formatBytes, photoToDataUrl } from '@/services/imageCompress'
import { useToastStore } from '@/stores/toast'

export type PhotoKind = 'avatar' | 'cover'

/** ขนาดผลลัพธ์ของแต่ละแบบ — สัดส่วนเดียวกับรูปโปรไฟล์ (1:1) และรูปปก (3:1) ของ Facebook */
const SIZES: Record<PhotoKind, { width: number; height: number }> = {
  avatar: { width: 320, height: 320 },
  cover: { width: 1200, height: 400 },
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/**
 * อ่านไฟล์ภาพที่ผู้ใช้เลือก ตรวจชนิดและขนาด แล้วครอปและย่อเป็น data URL พร้อมบันทึก
 * แจ้งข้อผิดพลาดผ่าน toast เอง หน้าที่เรียกใช้จึงสนใจแค่ค่าที่ได้คืน (null = ใช้ไม่ได้)
 */
export function usePhotoPicker() {
  const toast = useToastStore()
  const processing = ref(false)

  async function read(file: File | undefined | null, kind: PhotoKind): Promise<string | null> {
    if (!file) return null
    if (!ACCEPTED.includes(file.type)) {
      toast.error('รองรับเฉพาะไฟล์ภาพ JPG, PNG และ WebP')
      return null
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`ไฟล์ใหญ่เกิน ${formatBytes(MAX_EVIDENCE_BYTES)}`)
      return null
    }

    processing.value = true
    try {
      const url = await photoToDataUrl(file, SIZES[kind])
      if (!url) toast.error('อ่านไฟล์ภาพไม่ได้ ลองเลือกรูปอื่น')
      return url
    } finally {
      processing.value = false
    }
  }

  return { read, processing }
}
