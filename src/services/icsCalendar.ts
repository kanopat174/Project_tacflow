/**
 * ส่งออกปฏิทินภาษีเป็นไฟล์ .ics (iCalendar, RFC 5545) — นำเข้าปฏิทินในมือถือหรือ Google Calendar ได้
 * แอปปฏิทินจะเตือนเองแม้ไม่ได้เปิดเว็บ จึงไม่ต้องมี backend สำหรับส่งแจ้งเตือน
 *
 * ฟังก์ชันบริสุทธิ์ (รับวันที่ปัจจุบันเข้ามา) จึงเทสต์ได้
 */

import { CALENDAR_RULES } from '@/data/taxCalendar'
import type { WorkspaceMode } from '@/data/workspaceModes'
import { upcomingDeadlines } from './taxCalendar'

/** เตือนล่วงหน้ากี่วันก่อนถึงกำหนด */
export const ICS_ALARM_DAYS = [7, 1]

/** escape ข้อความตาม RFC 5545 */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** พับบรรทัดที่ยาวเกิน 75 ไบต์ — ภาษาไทยใช้ 3 ไบต์ต่ออักษร จึงต้องนับเป็นไบต์ ไม่ตัดกลางอักษร */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // บรรทัดต่อขึ้นต้นด้วยช่องว่าง 1 ไบต์ จึงเหลือที่ 74 ไบต์
    const limit = parts.length ? 74 : 75
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDate = (iso: string) => iso.replace(/-/g, '')

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return date.toISOString().slice(0, 10)
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * ไฟล์ .ics ของกำหนดภาษีที่เกี่ยวกับผู้ใช้ — เป็นนัดทั้งวันที่เกิดซ้ำทุกปี/ทุกเดือน
 * เริ่มจากครั้งถัดไปนับจาก today และเตือนล่วงหน้าตาม ICS_ALARM_DAYS
 */
export function buildTaxCalendarIcs(modes: WorkspaceMode[], today: Date = new Date()): string {
  // ขอบเขต 400 วันครอบคลุมครั้งถัดไปของทุกกฎ ทั้งรายเดือนและรายปี
  const deadlines = upcomingDeadlines(modes, today, 400)
  const stamp = utcStamp(today)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jodwise//Tax Calendar//TH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('ปฏิทินภาษี Jodwise')}`,
  ]

  for (const d of deadlines) {
    const rule = CALENDAR_RULES.find((r) => r.key === d.key)
    if (!rule) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:${d.key}@jodwise`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(d.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(d.date))}`,
      `RRULE:FREQ=${rule.rule.kind === 'yearly' ? 'YEARLY' : 'MONTHLY'}`,
      `SUMMARY:${escapeText(d.title)}`,
      `DESCRIPTION:${escapeText(d.detail)}`,
      'TRANSP:TRANSPARENT',
    )
    for (const days of ICS_ALARM_DAYS) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-P${days}D`,
        `DESCRIPTION:${escapeText(`${d.title} — อีก ${days} วัน`)}`,
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
