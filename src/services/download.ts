/** ให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์ — ใช้กับ CSV และไฟล์สำรองข้อมูล */
export function downloadText(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // ให้เบราว์เซอร์เริ่มดาวน์โหลดก่อนค่อยคืนหน่วยความจำ
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** ชื่อไฟล์ที่ปลอดภัยกับทุกระบบปฏิบัติการ */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'taxflow'
}
