/**
 * ย่อภาพก่อนเก็บลง IndexedDB
 *
 * สลิปที่ถ่ายจากมือถือมักใหญ่ 3–8MB ต่อใบ ซึ่งกินพื้นที่เบราว์เซอร์เร็วมาก
 * ย่อด้านยาวสุดแล้วบันทึกเป็น JPEG ทำให้เหลือหลักร้อย KB โดยยังอ่านตัวเลขบนสลิปออก
 *
 * ถ้าย่อไม่สำเร็จ (เบราว์เซอร์ไม่รองรับ canvas หรือไฟล์เสีย) จะคืนไฟล์เดิมไป
 * ดีกว่าทำให้ผู้ใช้แนบไฟล์ไม่ได้เลย
 */

import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '@/data/evidenceTypes'

function loadImage(file: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof URL?.createObjectURL !== 'function') {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

export interface CompressResult {
  blob: Blob
  /** true เมื่อย่อสำเร็จจริง */
  compressed: boolean
  width: number
  height: number
}

export async function compressImage(file: File): Promise<CompressResult> {
  const fallback: CompressResult = { blob: file, compressed: false, width: 0, height: 0 }
  if (!file.type.startsWith('image/')) return fallback

  const image = await loadImage(file)
  if (!image || !image.naturalWidth) return fallback

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.round(image.naturalWidth * scale)
  const height = Math.round(image.naturalHeight * scale)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return fallback
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY),
    )
    // ถ้าย่อแล้วไม่ได้เล็กลง ใช้ไฟล์เดิมดีกว่า จะได้ไม่เสียคุณภาพฟรี ๆ
    if (!blob || blob.size >= file.size) return { ...fallback, width, height }
    return { blob, compressed: true, width, height }
  } catch {
    return fallback
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
