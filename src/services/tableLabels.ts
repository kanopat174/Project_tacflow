/**
 * ตารางบนมือถือ — ใส่ชื่อคอลัมน์ (data-label) ให้ทุกช่องของตารางใน .table-wrap อัตโนมัติ
 * CSS ในไฟล์ mobile.css จะใช้ชื่อนี้วางแต่ละแถวเป็นการ์ด "ชื่อคอลัมน์ : ค่า" แทนตารางที่ต้องเลื่อนข้าง
 * ทำครั้งเดียวที่นี่ ไม่ต้องไปเติม data-label ทีละช่องในทุกหน้า
 */

function labelTable(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll('thead th'), (th) => th.textContent?.trim() ?? '')
  if (!heads.length) return
  for (const row of Array.from(table.tBodies).flatMap((body) => Array.from(body.rows))) {
    Array.from(row.cells).forEach((cell, index) => {
      const label = heads[index]
      if (label) {
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
      } else if (cell.hasAttribute('data-label')) {
        cell.removeAttribute('data-label')
      }
    })
  }
}

function labelAll() {
  document.querySelectorAll<HTMLTableElement>('.table-wrap table').forEach(labelTable)
}

export function installTableLabels() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      labelAll()
    })
  }
  // ตารางเปลี่ยนเมื่อเปลี่ยนหน้า/กรองข้อมูล — ดูแค่การเพิ่มลบโหนด ไม่ดู attribute จึงไม่วนซ้ำตัวเอง
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  schedule()
}
