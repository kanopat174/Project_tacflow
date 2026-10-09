import { describe, expect, it } from 'vitest'
import {
  bangkokToday,
  findSlipDuplicates,
  isValidReference,
  nameMatches,
  parseSlip,
  REVIEW_THRESHOLD,
  sanitizeSlipMeta,
  slipNote,
  type OcrLine,
} from '../slipParse'
import type { LedgerEntry, SlipMeta } from '../ledgerEngine'

/*
 * ข้อความจำลองแบบที่ OCR อ่านได้จากสลิป — ชื่อ เลขบัญชี และเลขอ้างอิงเป็นข้อมูลสมมุติทั้งหมด
 * จัดหลายรูปแบบ: ไม่มีป้ายชื่อ, ป้ายไทย, ป้ายอังกฤษ, ป้ายอยู่บรรทัดเดียวกับค่า, ป้ายอยู่คนละบรรทัด
 */
const TODAY = '2026-10-09'
const ME = 'สมชาย ใจดี'

// 1, 3, 6 — โอนให้บุคคล ไม่มีป้ายชื่อ วันที่ พ.ศ. สองหลัก เลขอ้างอิงอยู่บรรทัดถัดจากป้าย
const NO_LABELS_PERSON = `โอนเงินสำเร็จ
8 ต.ค. 69 14:32 น.
นาย สมชาย ใ
ธ.กสิกรไทย
xxx-x-x1234-x
นาง สมศรี มีสุข
ธ.กรุงไทย
xxx-x-x5678-x
เลขที่รายการ:
015281143250ATF07890
จำนวน:
1,250.00 บาท
ค่าธรรมเนียม:
0.00 บาท`

// 2, 4 — โอนเข้าบัญชีบริษัท ป้ายอังกฤษ วันที่ ค.ศ.
const COMPANY_EN = `Transfer Successful
Date & Time 07 Oct 2026 09:05
From
MR. SOMCHAI J
SCB xxx-xxx123-4
To
ABC TRADING CO., LTD.
Bangkok Bank xxx-x-x9876-x
Amount 30,000.00 THB
Fee 0.00 THB
Transaction ID: 2026100712345678`

// 9 — ชื่อบริษัทภาษาไทยยาวจนขึ้นบรรทัดใหม่ เลขอ้างอิงคั่นด้วยช่องว่าง
const COMPANY_TH_WRAPPED = `ทำรายการสำเร็จ
วันที่ทำรายการ 5 ตุลาคม 2569 เวลา 08:10 น.
ผู้โอน นาย สมชาย ใจดี
ธนาคารไทยพาณิชย์
ผู้รับ บริษัท ไทยรุ่งเรืองการค้าและอุตสาหกรรมเกษตร
จำกัด (มหาชน)
ธนาคารกรุงศรีอยุธยา
จำนวนเงิน 12,500.50 บาท
รหัสอ้างอิง 0152 8114 3250`

// 5 — มีหลายวันที่: วันพิมพ์สลิป วันครบกำหนดบิล และวันทำรายการ
const MANY_DATES = `พิมพ์เมื่อ 09/10/2569 10:00
ครบกำหนดชำระ 31/10/2569
วันที่ทำรายการ
06/10/2569 16:45
จาก นาย สมชาย ใจดี
ไปยัง นางสาว มานี มีนา
จำนวนเงิน 800.00 บาท
เลขที่อ้างอิง: A1B2C3D4E5`

// 7 — ไม่มีเลขอ้างอิงเลย / มีป้ายแต่อ่านไม่ออก
const NO_REFERENCE = `โอนเงินสำเร็จ
3 ต.ค. 2569 11:20
จาก นาย สมชาย ใจดี
ไปยัง นาย ปิติ ชูใจ
จำนวนเงิน 150.00 บาท`
const UNREADABLE_REFERENCE = `${NO_REFERENCE}
เลขที่รายการ: ?#@ อ่านไม่ออก`

// 10 — ข้อมูลผู้รับไม่ครบ: มีชื่อเดียว ไม่มีป้าย
const ONE_NAME = `โอนเงินสำเร็จ
2 ต.ค. 69 09:00 น.
นาย สมชาย ใจดี
xxx-x-x1234-x
จำนวน 99.00 บาท`

describe('1. โอนให้บุคคล (สลิปไม่มีป้ายชื่อ)', () => {
  const r = parseSlip(NO_LABELS_PERSON, [ME], TODAY)

  it('แยกผู้โอนและผู้รับจากโครงสร้างบล็อก ไม่ใช่ชื่อแรกที่เจอ', () => {
    expect(r.sender.value).toBe('นาย สมชาย ใ')
    expect(r.recipient.value).toBe('นาง สมศรี มีสุข')
    expect(r.recipientType).toBe('person')
    expect(r.recipientBank).toBe('กรุงไทย')
    expect(r.recipient.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD)
  })

  it('ยอด วันที่ เวลา เลขอ้างอิง และทิศทางเงิน', () => {
    expect(r.amount.value).toBe(1250)
    expect(r.date.value).toBe('2026-10-08')
    expect(r.time.value).toBe('14:32')
    expect(r.reference.value).toBe('015281143250ATF07890')
    expect(r.direction).toBe('expense')
    expect(r.banks).toEqual(['กสิกรไทย', 'กรุงไทย'])
    expect(r.review).toEqual([])
  })
})

describe('2, 4. โอนเข้าบัญชีบริษัท ป้ายภาษาอังกฤษ วันที่ ค.ศ.', () => {
  const r = parseSlip(COMPANY_EN, ['Somchai Jaidee', ME], TODAY)

  it('ผู้รับเป็นบริษัท คงคำต่อท้ายไว้ครบ', () => {
    expect(r.recipient.value).toBe('ABC TRADING CO., LTD.')
    expect(r.recipientType).toBe('company')
    expect(r.recipientBank).toBe('กรุงเทพ')
    expect(r.sender.value).toBe('MR. SOMCHAI J')
  })

  it('วันที่ ค.ศ. และเลขอ้างอิงจากป้ายอังกฤษ ไม่หยิบเลขบัญชีมา', () => {
    expect(r.date.value).toBe('2026-10-07')
    expect(r.time.value).toBe('09:05')
    expect(r.amount.value).toBe(30000)
    expect(r.reference.value).toBe('2026100712345678')
    expect(r.direction).toBe('expense')
  })
})

describe('3. วันที่ พ.ศ. หลายรูปแบบ', () => {
  const dateOf = (line: string) => parseSlip(`${line}\nจำนวนเงิน 10.00`, [], TODAY).date
  it('เดือนย่อ เดือนเต็ม ตัวเลข และปีสองหลัก', () => {
    expect(dateOf('8 ต.ค. 69 14:32').value).toBe('2026-10-08')
    expect(dateOf('8 ต.ค. 2569').value).toBe('2026-10-08')
    expect(dateOf('5 ตุลาคม 2569').value).toBe('2026-10-05')
    expect(dateOf('08/10/2569 14:32').value).toBe('2026-10-08')
    expect(dateOf('08-10-69').value).toBe('2026-10-08')
  })
  it('ตัวเลขไทย และช่องว่างที่ OCR แทรกในชื่อเดือน', () => {
    expect(dateOf('๘ ต. ค. ๖๙ ๑๔:๓๒ น.').value).toBe('2026-10-08')
    expect(dateOf('8 ต.ค 69').value).toBe('2026-10-08')
  })
  it('ค.ศ. แบบเดือนอังกฤษ ปีสองหลัก และ ISO', () => {
    expect(dateOf('07 Oct 26').value).toBe('2026-10-07')
    expect(dateOf('7 October 2026, 9:05 PM').value).toBe('2026-10-07')
    expect(parseSlip('2026-10-07 21:05\nจำนวนเงิน 10.00', [], TODAY).time.value).toBe('21:05')
  })
})

describe('5. หลายวันที่บนสลิปเดียว', () => {
  it('เลือกวันทำรายการจากป้าย ไม่ใช่วันพิมพ์หรือวันครบกำหนด', () => {
    const r = parseSlip(MANY_DATES, [ME], TODAY)
    expect(r.date.value).toBe('2026-10-06')
    expect(r.time.value).toBe('16:45')
    expect(r.date.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD)
  })
  it('สองวันที่ที่แยกไม่ออก ต้องให้ผู้ใช้ตรวจ', () => {
    const r = parseSlip('1 ต.ค. 69 10:00\n2 ต.ค. 69 11:00\nจำนวนเงิน 10.00', [], TODAY)
    expect(r.date.confidence).toBeLessThan(REVIEW_THRESHOLD)
    expect(r.date.issue).toMatch(/หลายวันที่/)
    expect(r.review).toContain('date')
  })
  it('ไม่มีวันที่ หรือวันที่อยู่ในอนาคต ไม่ใช้วันนี้แทน', () => {
    expect(parseSlip('จำนวนเงิน 10.00', [], TODAY).date).toMatchObject({ value: null, issue: expect.stringMatching(/ไม่พบวันที่/) })
    expect(parseSlip('12 ธ.ค. 69\nจำนวนเงิน 10.00', [], TODAY).date).toMatchObject({ value: null, issue: expect.stringMatching(/หลังวันนี้/) })
  })
})

describe('6, 7. เลขอ้างอิง', () => {
  it('ป้ายหลายแบบ และรวมกลุ่มตัวเลขที่คั่นด้วยช่องว่าง โดยคงเลขศูนย์นำหน้า', () => {
    expect(parseSlip(COMPANY_TH_WRAPPED, [], TODAY).reference.value).toBe('015281143250')
    expect(parseSlip(MANY_DATES, [], TODAY).reference.value).toBe('A1B2C3D4E5')
    expect(parseSlip('Ref. No. 00012345 Copy', [], TODAY).reference.value).toBe('00012345')
    expect(parseSlip('เลขที่ รายการ : 2026-1007-0001', [], TODAY).reference.value).toBe('2026-1007-0001')
  })
  it('ไม่มีเลขอ้างอิง หรืออ่านไม่ออก คืน null และต้องตรวจ', () => {
    const none = parseSlip(NO_REFERENCE, [ME], TODAY)
    expect(none.reference).toMatchObject({ value: null, issue: expect.stringMatching(/ไม่พบเลขอ้างอิง/) })
    expect(none.review).toContain('reference')
    const bad = parseSlip(UNREADABLE_REFERENCE, [ME], TODAY)
    expect(bad.reference).toMatchObject({ value: null, issue: expect.stringMatching(/อ่านเลขไม่ชัด/) })
  })
  it('ไม่หยิบเลขบัญชี เบอร์โทร ยอดเงิน หรือ Ref.1 ของบิลมาเป็นเลขอ้างอิง', () => {
    expect(parseSlip('xxx-x-x1234-x\n081-234-5678\n1,250.00', [], TODAY).reference.value).toBeNull()
    expect(parseSlip('Ref.1: 0812345678\nRef 2: 123456', [], TODAY).reference.value).toBeNull()
    expect(parseSlip('รหัสอ้างอิง 1,250.00', [], TODAY).reference.value).toBeNull()
    expect(isValidReference('xxx-x-x1234-x')).toBe(false)
    expect(isValidReference('081-234-5678')).toBe(false)
  })
})

describe('8. สลิปคุณภาพต่ำ', () => {
  it('ความมั่นใจของ OCR ต่ำทำให้ช่องจากบรรทัดนั้นต้องตรวจ', () => {
    const lines: OcrLine[] = NO_LABELS_PERSON.split('\n').map((text) => ({
      text,
      confidence: /1,250/.test(text) ? 40 : 92,
    }))
    const r = parseSlip(lines, [ME], TODAY)
    expect(r.amount.value).toBe(1250)
    expect(r.amount.confidence).toBeLessThan(REVIEW_THRESHOLD)
    expect(r.review).toContain('amount')
    expect(r.date.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD)
  })
  it('OCR อ่านจุลภาคเป็นจุด และสระอำแยกตัว', () => {
    const r = parseSlip('จํานวนเงิน 1.250.00 บาท', [], TODAY)
    expect(r.amount.value).toBe(1250)
  })
  it('ตัดอักขระล่องหนและตัวกลับทิศทางข้อความออกจากค่าที่อ่านได้', () => {
    const r = parseSlip('ไปยัง นาย‮ ปิติ​ ชูใจ\nจำนวนเงิน 10.00', [], TODAY)
    expect(r.recipient.value).toBe('นาย ปิติ ชูใจ')
  })
})

describe('9. ชื่อบริษัทไทยยาวที่ขึ้นบรรทัดใหม่', () => {
  it('รวมบรรทัดต่อของชื่อบริษัท แยกจากชื่อธนาคาร', () => {
    const r = parseSlip(COMPANY_TH_WRAPPED, [ME], TODAY)
    expect(r.recipient.value).toBe('บริษัท ไทยรุ่งเรืองการค้าและอุตสาหกรรมเกษตร จำกัด (มหาชน)')
    expect(r.recipientType).toBe('company')
    expect(r.recipientBank).toBe('กรุงศรีอยุธยา')
    expect(r.sender.value).toBe('นาย สมชาย ใจดี')
    expect(r.date.value).toBe('2026-10-05')
    expect(r.time.value).toBe('08:10')
    expect(r.amount.value).toBe(12500.5)
    expect(r.direction).toBe('expense')
  })
})

describe('10. ข้อมูลผู้รับไม่ครบหรือกำกวม', () => {
  it('ชื่อเดียวไม่มีป้าย ไม่เดาว่าเป็นผู้รับ และไม่เอาผู้โอนมาแทน', () => {
    const r = parseSlip(ONE_NAME, [ME], TODAY)
    expect(r.recipient.value).toBeNull()
    expect(r.sender.value).toBeNull()
    expect(r.unassignedNames).toEqual(['นาย สมชาย ใจดี'])
    expect(r.review).toContain('recipient')
    expect(r.direction).toBeNull()
  })
  it('มีป้ายผู้รับแต่ไม่มีชื่อ', () => {
    const r = parseSlip('จาก นาย สมชาย ใจดี\nไปยัง\nจำนวนเงิน 10.00', [ME], TODAY)
    expect(r.recipient).toMatchObject({ value: null, issue: expect.stringMatching(/ป้ายผู้รับ/) })
    expect(r.sender.value).toBe('นาย สมชาย ใจดี')
  })
})

describe('ทิศทางเงิน', () => {
  it('เป็นผู้รับ = รายรับ, โอนเข้าบัญชีตัวเอง/ชื่อไม่ตรง/ไม่มีชื่อโปรไฟล์ = ให้ผู้ใช้เลือก', () => {
    const incoming = 'จาก นาง สมศรี มีสุข\nไปยัง นาย สมชาย ใจดี\nจำนวนเงิน 10.00'
    expect(parseSlip(incoming, [ME], TODAY).direction).toBe('income')
    expect(parseSlip('จาก นาย สมชาย ใจดี\nไปยัง นาย สมชาย ใจดี', [ME], TODAY).direction).toBeNull()
    expect(parseSlip(incoming, ['มานี มีนา'], TODAY).direction).toBeNull()
    expect(parseSlip(incoming, [], TODAY).direction).toBeNull()
  })
  it('เทียบชื่อที่ปิดนามสกุลบางส่วน', () => {
    expect(nameMatches('นาย สมชาย ใ', ME)).toBe(true)
    expect(nameMatches('MR. JOHN D', 'John Doe')).toBe(true)
    expect(nameMatches('นาย สมชัย ใจดี', ME)).toBe(false)
    expect(nameMatches('นาย สมชาย มี', ME)).toBe(false)
  })
})

describe('ตรวจข้อมูลก่อนบันทึก', () => {
  it('ค่าที่รูปแบบผิดกลายเป็น null', () => {
    const meta = sanitizeSlipMeta({
      time: '25:00',
      sender: 'นาย ก‮',
      recipient: 'x'.repeat(500),
      recipientType: 'robot',
      banks: ['กสิกรไทย', 42],
      reference: '1,250.00',
      imageHash: 'not-a-hash',
    })
    expect(meta).toEqual({
      time: null,
      sender: 'นาย ก',
      recipient: 'x'.repeat(120),
      recipientType: null,
      recipientBank: null,
      banks: ['กสิกรไทย'],
      reference: null,
      imageHash: null,
    })
    expect(sanitizeSlipMeta('nope')).toBeUndefined()
  })
})

describe('สลิปซ้ำ', () => {
  const meta = (m: Partial<SlipMeta>): SlipMeta => ({
    time: null,
    sender: null,
    recipient: null,
    recipientType: null,
    recipientBank: null,
    banks: [],
    reference: null,
    imageHash: null,
    ...m,
  })
  const entry = (id: string, e: Partial<LedgerEntry>): LedgerEntry => ({
    id,
    date: '2026-10-08',
    type: 'expense',
    categoryKey: 'otherExpense',
    amount: 500,
    note: '',
    ...e,
  })
  const entries = [
    entry('ref', { slip: meta({ reference: '0152-8114-3250' }) }),
    entry('legacy', { note: 'โอนให้ นาง ก · อ้างอิง 99887766' }),
    entry('img', { slip: meta({ imageHash: 'a'.repeat(64) }) }),
    entry('details', { slip: meta({ recipient: 'นาง สมศรี มีสุข', time: '14:32' }) }),
    entry('same-amount-only', { amount: 500 }),
  ]
  const find = (date: string, amount: number, m: Partial<SlipMeta>) =>
    findSlipDuplicates({ date, amount, meta: meta(m) }, entries).map((d) => `${d.entry.id}:${d.reason}`)

  it('เลขอ้างอิงตรงกันเป็นหลัก (ไม่สนช่องว่างและขีด) รวมรายการเก่าที่เลขอยู่ในรายละเอียด', () => {
    expect(find('2026-01-01', 1, { reference: '015281143250' })).toEqual(['ref:reference'])
    expect(find('2026-01-01', 1, { reference: '99887766' })).toEqual(['legacy:reference'])
  })
  it('รูปเดียวกัน', () => {
    expect(find('2026-01-01', 1, { imageHash: 'a'.repeat(64) })).toEqual(['img:image'])
  })
  it('ไม่มีเลขอ้างอิง: ต้องตรงทั้งวันที่ ยอด และชื่อ ไม่ใช่ยอดหรือชื่ออย่างเดียว', () => {
    expect(find('2026-10-08', 500, { recipient: 'นาง สมศรี มีสุข' })).toEqual(['details:details'])
    expect(find('2026-10-08', 500, {})).toEqual([])
    expect(find('2026-10-08', 501, { recipient: 'นาง สมศรี มีสุข' })).toEqual([])
    expect(find('2026-10-08', 500, { recipient: 'นาง สมศรี มีสุข', time: '09:00' })).toEqual([])
  })
})

describe('เวลาไทยและรายละเอียด', () => {
  it('วันนี้ตามเวลาไทย ไม่ขึ้นกับโซนเวลาเครื่อง', () => {
    // 20:00 UTC ของวันที่ 8 = 03:00 ของวันที่ 9 ที่กรุงเทพ
    expect(bangkokToday(new Date('2026-10-08T20:00:00Z'))).toBe('2026-10-09')
    expect(bangkokToday(new Date('2026-10-08T16:59:00Z'))).toBe('2026-10-08')
  })
  it('รายละเอียดใส่เฉพาะสิ่งที่อ่านได้', () => {
    expect(slipNote({ sender: 'MR. A', recipient: null, time: '09:05', reference: 'R123456' }, 'income')).toBe(
      'รับโอนจาก MR. A · 09:05 น. · อ้างอิง R123456',
    )
    expect(slipNote({ sender: 'MR. A', recipient: null, time: null, reference: null }, 'expense')).toBe('')
  })
})
