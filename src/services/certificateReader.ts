/**
 * ดึงข้อความจากไฟล์ 50 ทวิ — ทำงานในเบราว์เซอร์ทั้งหมด ไฟล์ไม่ถูกส่งออกจากเครื่อง
 *
 *  - PDF ที่มีตัวอักษร (นายจ้างส่วนใหญ่ออกจากระบบเงินเดือน) อ่านตรงด้วย pdf.js แม่นยำและเร็ว
 *  - PDF สแกนหรือรูปถ่าย ใช้ OCR (tesseract.js ภาษาไทย+อังกฤษ) ครั้งแรกต้องโหลดข้อมูลภาษาราว 10 MB
 *
 * ไลบรารีทั้งสองโหลดแบบ dynamic import จึงไม่เพิ่มขนาดหน้าเว็บของคนที่ไม่ได้ใช้ฟีเจอร์นี้
 */

export type ReadProgress = (status: string, progress: number) => void

/** PDF ที่มีตัวอักษรน้อยกว่านี้ถือว่าเป็นภาพสแกน */
const MIN_TEXT_LENGTH = 40

async function loadPdf(file: Blob) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}

interface PositionedText {
  str: string
  x: number
  y: number
}

/** เรียงชิ้นข้อความเป็นบรรทัดตามตำแหน่งบนหน้า (บนลงล่าง ซ้ายไปขวา) */
function toLines(items: PositionedText[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PositionedText[][] = []
  for (const item of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last[0]!.y - item.y) <= 3) last.push(item)
    else lines.push([item])
  }
  return lines.map((line) =>
    line
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join(' ')
      .trim(),
  )
}

async function ocr(image: Blob | HTMLCanvasElement, onProgress: ReadProgress): Promise<string> {
  onProgress('กำลังโหลดตัวอ่านภาษาไทย', 0)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('tha+eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress('กำลังอ่านตัวอักษร', m.progress)
      else onProgress('กำลังโหลดตัวอ่านภาษาไทย', m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    await worker.terminate()
  }
}

async function readPdf(file: Blob, onProgress: ReadProgress): Promise<{ text: string; method: 'pdf' | 'ocr' }> {
  onProgress('กำลังเปิด PDF', 0)
  const doc = await loadPdf(file)
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items = content.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i)
      .map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]! }))
    pages.push(toLines(items).join('\n'))
  }
  const text = pages.join('\n')
  if (text.replace(/\s/g, '').length >= MIN_TEXT_LENGTH) return { text, method: 'pdf' }

  // PDF สแกน: วาดหน้าแรกเป็นภาพความละเอียดสูงแล้ว OCR
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  return { text: await ocr(canvas, onProgress), method: 'ocr' }
}

/** OCR รูปภาพทั่วไป เช่นใบเสร็จ */
export function readImageText(image: Blob, onProgress: ReadProgress = () => {}): Promise<string> {
  return ocr(image, onProgress)
}

export async function readCertificate(
  file: File,
  onProgress: ReadProgress = () => {},
): Promise<{ text: string; method: 'pdf' | 'ocr' }> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return readPdf(file, onProgress)
  return { text: await ocr(file, onProgress), method: 'ocr' }
}
