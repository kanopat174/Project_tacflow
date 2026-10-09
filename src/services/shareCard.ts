/**
 * การ์ดรูปสี่เหลี่ยมจัตุรัสสำหรับแชร์ เช่น "ประหยัดภาษีได้ 4,200 = ชานมไข่มุก 84 แก้ว"
 * วาดบน canvas เอง (แบบเดียวกับหน้าสรุปปี) มือถือที่แชร์ไฟล์ได้เปิดหน้าแชร์ ไม่งั้นดาวน์โหลด
 * การ์ดไม่มีข้อมูลส่วนตัว (ชื่อ เลขบัตร) แสดงเฉพาะตัวเลขที่ผู้ใช้เลือกแชร์
 */

export interface ShareCardContent {
  emoji: string
  title: string
  headline: string
  sub: string
  filename: string
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value && !value.startsWith('color-mix') ? value : fallback
}

/** ตัดบรรทัดตามความกว้าง — ภาษาไทยไม่มีเว้นวรรคระหว่างคำ จึงตัดทีละตัวอักษรเมื่อไม่มีช่องว่าง */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const token of text.split(/(\s+)/)) {
    const pieces = ctx.measureText(token).width > width ? [...token] : [token]
    for (const piece of pieces) {
      if (ctx.measureText(line + piece).width > width && line.trim()) {
        lines.push(line.trim())
        line = piece.trimStart()
      } else line += piece
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

export async function renderShareCard(content: ShareCardContent): Promise<Blob | null> {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await document.fonts?.ready

  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, cssVar('--accent', '#0f8f86'))
  gradient.addColorStop(1, cssVar('--accent-strong', '#0b6b64'))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `600 40px ${font}`
  ctx.fillText(content.title, size / 2, 130)

  ctx.font = `220px ${font}`
  ctx.fillText(content.emoji, size / 2, 440)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 76px ${font}`
  wrap(ctx, content.headline, 900).forEach((l, i) => ctx.fillText(l, size / 2, 600 + i * 92))

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `500 40px ${font}`
  wrap(ctx, content.sub, 880).forEach((l, i) => ctx.fillText(l, size / 2, 820 + i * 54))

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `600 32px ${font}`
  ctx.fillText('Jodwise · วางแผนภาษีให้สนุก', size / 2, 1020)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/** คืน 'shared' เมื่อเปิดหน้าแชร์ 'saved' เมื่อดาวน์โหลด หรือ 'cancelled' เมื่อผู้ใช้ปิดหน้าแชร์ */
export async function shareCard(content: ShareCardContent): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await renderShareCard(content)
  if (!blob) throw new Error('canvas')
  const file = new File([blob], content.filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: content.title })
      return 'shared'
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}
