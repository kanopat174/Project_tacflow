import { describe, expect, it } from 'vitest'
import { BACKUP_REMINDER_DAYS, backupOverdueDays } from '../storageSafety'
import { buildTaxCalendarIcs } from '../icsCalendar'

describe('backupOverdueDays', () => {
  it('ไม่เตือนเมื่อยังไม่มีข้อมูล', () => {
    expect(backupOverdueDays(null, '2026-01-01T00:00:00.000Z', '2026-10-09', false)).toBeNull()
  })

  it('ยังไม่เคยสำรอง นับจากวันสมัคร', () => {
    expect(backupOverdueDays(null, '2026-09-01T10:00:00.000Z', '2026-10-09', true)).toBe(38)
    expect(backupOverdueDays(null, '2026-09-20T10:00:00.000Z', '2026-10-09', true)).toBeNull()
  })

  it('นับจากวันสำรองล่าสุด เตือนเมื่อครบเกณฑ์พอดี', () => {
    expect(backupOverdueDays('2026-09-09', '2025-01-01T00:00:00.000Z', '2026-10-09', true)).toBe(BACKUP_REMINDER_DAYS)
    expect(backupOverdueDays('2026-09-10', '2025-01-01T00:00:00.000Z', '2026-10-09', true)).toBeNull()
  })
})

describe('buildTaxCalendarIcs', () => {
  const today = new Date(2026, 9, 9)

  it('มีโครง VCALENDAR และใช้ CRLF', () => {
    const ics = buildTaxCalendarIcs([], today)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('ผู้ใช้ทั่วไปได้กำหนดรายปีพร้อมวันถัดไปและเตือนล่วงหน้า', () => {
    const ics = buildTaxCalendarIcs([], today).replace(/\r\n /g, '')
    expect(ics).toContain('UID:pit-annual@jodwise')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270331')
    expect(ics).toContain('DTEND;VALUE=DATE:20270401')
    expect(ics).toContain('UID:deduction-deadline@jodwise')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
    expect(ics).toContain('RRULE:FREQ=YEARLY')
    expect(ics).toContain('TRIGGER:-P7D')
    expect(ics).toContain('TRIGGER:-P1D')
    // กำหนดของบริษัทไม่ขึ้นถ้าไม่มีสมุดโหมดบริษัท
    expect(ics).not.toContain('UID:vat-monthly@jodwise')
  })

  it('โหมดบริษัทได้กำหนดรายเดือน', () => {
    const ics = buildTaxCalendarIcs(['company'], today).replace(/\r\n /g, '')
    expect(ics).toContain('UID:vat-monthly@jodwise')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261015')
    expect(ics).toContain('RRULE:FREQ=MONTHLY')
  })

  it('พับบรรทัดไม่เกิน 75 ไบต์และไม่ตัดกลางอักษรไทย', () => {
    const ics = buildTaxCalendarIcs(['company'], today)
    const encoder = new TextEncoder()
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
      expect(line).not.toContain('�')
    }
  })

  it('escape เครื่องหมายจุลภาคในข้อความ', () => {
    const ics = buildTaxCalendarIcs([], today).replace(/\r\n /g, '')
    expect(ics).toContain('SSF\\, RMF\\, Thai ESG')
  })
})
