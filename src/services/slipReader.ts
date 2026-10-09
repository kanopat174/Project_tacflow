/**
 * อ่านรูปสลิปโอนเงิน — ทำงานในเบราว์เซอร์ทั้งหมด รูปไม่ถูกส่งออกจากเครื่อง
 *
 *  1. แฮช SHA-256 ของไฟล์ไว้ตรวจสลิปซ้ำ
 *  2. เตรียมภาพ: หมุนตาม EXIF, ปรับขนาดให้ตัวอักษรใหญ่พอ, ทำเป็นขาวดำ, ยืดคอนทราสต์,
 *     กลับสีสลิปโหมดมืด (OCR อ่านตัวดำบนพื้นขาวได้ดีที่สุด)
 *  3. OCR — ถ้าผลอ่านแย่ ลองหมุน 90/270/180 องศา แล้วเลือกแนวที่อ่านได้ดีที่สุด (รูปที่ถ่ายตะแคง)
 *
 * ข้อความดิบคืนให้หน้าจอแสดงเพื่อตรวจสอบเท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล เพราะมีชื่อและเลขบัญชี
 */

import { withOcrWorker, type OcrPage, type ReadProgress } from './certificateReader'

export type Rotation = 0 | 90 | 180 | 270

export interface SlipOcrResult extends OcrPage {
  rotation: Rotation
  /** SHA-256 ของไฟล์ต้นฉบับ (hex) — null ถ้าเบราว์เซอร์คำนวณไม่ได้ */
  imageHash: string | null
  /** ปรับภาพก่อนอ่านได้หรือไม่ (เบราว์เซอร์เก่าบางตัวทำไม่ได้ จะอ่านจากรูปเดิม) */
  enhanced: boolean
}

/* ---------- ฟังก์ชันบริสุทธิ์ (ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์) ---------- */

/** ด้านยาวที่ OCR อ่านภาษาไทยได้ดี — สระและวรรณยุกต์ตัวเล็ก ภาพเล็กเกินจะหาย ใหญ่เกินจะช้า */
const MIN_LONG_SIDE = 1600
const MAX_LONG_SIDE = 2800

export function targetScale(width: number, height: number): number {
  const long = Math.max(width, height)
  if (long <= 0) return 1
  if (long < MIN_LONG_SIDE) return Math.min(3, MIN_LONG_SIDE / long)
  if (long > MAX_LONG_SIDE) return MAX_LONG_SIDE / long
  return 1
}

/**
 * แปลง RGBA เป็นขาวดำแล้วยืดช่วงความสว่าง (ตัด 2% มืดสุดและสว่างสุด) ทำในที่เดิม
 * พื้นหลังมืด (สลิปโหมดมืด) จะกลับสีให้เป็นตัวดำบนพื้นขาว
 */
export function enhanceForOcr(data: Uint8ClampedArray): { inverted: boolean } {
  const pixels = data.length / 4
  if (!pixels) return { inverted: false }
  const gray = new Uint8ClampedArray(pixels)
  const histogram = new Array<number>(256).fill(0)
  let sum = 0
  for (let i = 0; i < pixels; i++) {
    const v = Math.round(0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!)
    gray[i] = v
    histogram[v]!++
    sum += v
  }
  const percentile = (p: number) => {
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += histogram[v]!
      if (seen >= pixels * p) return v
    }
    return 255
  }
  const lo = percentile(0.02)
  const hi = percentile(0.98)
  const span = Math.max(1, hi - lo)
  const inverted = sum / pixels < 110
  for (let i = 0; i < pixels; i++) {
    let v = ((gray[i]! - lo) * 255) / span
    if (inverted) v = 255 - v
    const c = Math.max(0, Math.min(255, Math.round(v)))
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = c
    data[i * 4 + 3] = 255
  }
  return { inverted }
}

/** คำที่สลิปเกือบทุกใบมี — ใช้วัดว่าแนวการหมุนไหนอ่านออกจริง */
const SLIP_WORDS = /จำนวน|จํานวน|บาท|โอน|สำเร็จ|อ้างอิง|รายการ|ธนาคาร|ผู้รับ|amount|transfer|ref|bank|thb|\d{1,2}:\d{2}/gi

/** คะแนนคุณภาพผล OCR: ความมั่นใจเฉลี่ย + จำนวนคำที่เป็นลักษณะของสลิป */
export function ocrScore(page: Pick<OcrPage, 'text' | 'confidence'>): number {
  const hits = new Set((page.text.match(SLIP_WORDS) ?? []).map((w) => w.toLowerCase())).size
  return page.confidence + Math.min(hits, 6) * 6
}

/** ผลอ่านที่ดีพอจนไม่ต้องลองหมุน */
export const GOOD_ENOUGH_SCORE = 80

export function pickBestOrientation<T extends Pick<OcrPage, 'text' | 'confidence'>>(results: T[]): T {
  return results.reduce((best, r) => (ocrScore(r) > ocrScore(best) ? r : best))
}

/* ---------- ส่วนที่ใช้เบราว์เซอร์ ---------- */

async function sha256(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** วาดรูปลง canvas พร้อมปรับภาพ — คืน null ถ้าเบราว์เซอร์ไม่รองรับ จะอ่านจากไฟล์เดิมแทน */
async function prepareCanvas(file: Blob): Promise<HTMLCanvasElement | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null
    // from-image ให้เบราว์เซอร์หมุนตาม EXIF ของรูปถ่ายจากมือถือ
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = targetScale(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    enhanceForOcr(image.data)
    ctx.putImageData(image, 0, 0)
    return canvas
  } catch {
    return null
  }
}

function rotate(source: HTMLCanvasElement, degrees: Rotation): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const sideways = degrees === 90 || degrees === 270
  canvas.width = sideways ? source.height : source.width
  canvas.height = sideways ? source.width : source.height
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

export async function readSlipImage(file: Blob, onProgress: ReadProgress = () => {}): Promise<SlipOcrResult> {
  const [imageHash, canvas] = await Promise.all([sha256(file), prepareCanvas(file)])
  return withOcrWorker(onProgress, async (recognize) => {
    const first = { ...(await recognize(canvas ?? file)), rotation: 0 as Rotation }
    if (!canvas || ocrScore(first) >= GOOD_ENOUGH_SCORE) return { ...first, imageHash, enhanced: !!canvas }

    // อ่านได้แย่ อาจเป็นรูปตะแคงหรือกลับหัว
    const tries = [first]
    for (const degrees of [90, 270, 180] as Rotation[]) {
      onProgress(`ลองหมุนรูป ${degrees}°`, 0)
      const page = { ...(await recognize(rotate(canvas, degrees))), rotation: degrees }
      tries.push(page)
      if (ocrScore(page) >= GOOD_ENOUGH_SCORE) break
    }
    return { ...pickBestOrientation(tries), imageHash, enhanced: true }
  })
}
