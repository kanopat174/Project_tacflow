/**
 * หยิบไฟล์ที่แชร์มาจากแอปอื่น (Web Share Target) — service worker เก็บไว้ใน cache ชื่อ jodwise-share
 * หยิบแล้วลบทิ้งทันที ไม่ให้สลิปค้างอยู่ในเครื่อง
 */

export const SHARE_CACHE = 'jodwise-share'

export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  const cache = await caches.open(SHARE_CACHE)
  const keys = await cache.keys()
  const files: File[] = []
  for (const key of keys) {
    const response = await cache.match(key)
    if (!response) continue
    const blob = await response.blob()
    const name = decodeURIComponent(response.headers.get('x-file-name') ?? '') || 'shared'
    files.push(new File([blob], name, { type: response.headers.get('content-type') ?? blob.type }))
  }
  await caches.delete(SHARE_CACHE)
  return files
}

/** แยกไฟล์ที่แชร์มาเป็นงานที่ต้องทำ — สลิปหลายใบสแกนพร้อมกัน ไฟล์เดียวเปิดบันทึกด่วน */
export function planShared(files: File[]): { single: File | null; bulk: File[]; ignored: number } {
  const usable = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || f.type === 'application/pdf')
  const images = usable.filter((f) => f.type.startsWith('image/'))
  const pdfs = usable.filter((f) => f.type === 'application/pdf')
  if (images.length > 1) return { single: null, bulk: images, ignored: files.length - images.length }
  const single = images[0] ?? pdfs[0] ?? null
  return { single, bulk: [], ignored: files.length - (single ? 1 : 0) }
}
