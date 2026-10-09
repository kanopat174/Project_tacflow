import { describe, expect, it } from 'vitest'
import { parseSlip } from '../slipParse'
import { parseSlipQr } from '../slipQr'
import { addSelf } from '../selfIdentity'

/*
 * ข้อความจำลองตามโครงสลิปของแต่ละธนาคาร/วอลเล็ต — ชื่อ เลขบัญชี และเลขอ้างอิงสมมุติทั้งหมด
 */
const TODAY = '2026-10-10'
const ME = 'สมชาย ใจดี'

const SLIPS: Record<string, { text: string; amount: number; date: string; time?: string; reference?: string }> = {
  'กสิกรไทย (K PLUS)': {
    text: `โอนเงินสำเร็จ
9 ต.ค. 69 14:32 น.
นาย สมชาย ใ
ธ.กสิกรไทย
xxx-x-x1234-x
นาง สมศรี มีสุข
ธ.ไทยพาณิชย์
xxx-x-x5678-x
เลขที่รายการ:
015282143250BTF04512
จำนวน:
500.00 บาท
ค่าธรรมเนียม:
0.00 บาท`,
    amount: 500,
    date: '2026-10-09',
    time: '14:32',
    reference: '015282143250BTF04512',
  },
  'ไทยพาณิชย์ (SCB EASY)': {
    text: `โอนเงินสำเร็จ
09 ต.ค. 2569 - 14:32
จาก นาย สมชาย ใจดี
xxx-xxx123-4
ไปยัง นางสาว มานี มีนา
xxx-xxx567-8
จำนวนเงิน 1,200.00
รหัสอ้างอิง: 202610091432AbCdEf123`,
    amount: 1200,
    date: '2026-10-09',
    time: '14:32',
    reference: '202610091432AbCdEf123',
  },
  'กรุงเทพ (Bualuang)': {
    text: `Transfer successful
09 Oct 26, 14:32
From MR. SOMCHAI JAIDEE
Bangkok Bank xxx-x-x1234-x
To MS. MANEE MEENA
Krungthai xxx-x-x5678-x
Amount 350.00 THB
Reference no. 0920261009143200123`,
    amount: 350,
    date: '2026-10-09',
    time: '14:32',
    reference: '0920261009143200123',
  },
  'กรุงไทย (NEXT)': {
    text: `โอนเงินสำเร็จ
วันที่ทำรายการ 09 ต.ค. 2569 - 14:32
นาย สมชาย ใจดี
กรุงไทย XXX-X-XX123-4
พร้อมเพย์ นาง สมศรี มีสุข
XXX-XXX-5678
จำนวนเงิน 99.50 บาท
รหัสอ้างอิง 2026100914320987654`,
    amount: 99.5,
    date: '2026-10-09',
    reference: '2026100914320987654',
  },
  'กรุงศรี (KMA) วันที่ตัวเลข': {
    text: `ทำรายการสำเร็จ
09/10/2569 14:32:51
จาก นาย สมชาย ใจดี
ไปยัง บริษัท ตัวอย่าง จำกัด
จำนวนเงิน 4,500.00 บาท
เลขที่อ้างอิง BAY2026100914325555`,
    amount: 4500,
    date: '2026-10-09',
    time: '14:32',
    reference: 'BAY2026100914325555',
  },
  'ทีทีบี ป้ายอังกฤษ': {
    text: `Transfer completed
Oct 9, 2026 2:32 PM
From MR SOMCHAI J
To MRS SOMSRI M
Amount 800.00 THB
Transaction ID 0110920261009AB12CD34`,
    amount: 800,
    date: '2026-10-09',
    time: '14:32',
    reference: '0110920261009AB12CD34',
  },
  'TrueMoney ไม่พิมพ์ปี': {
    text: `ทรูมันนี่ วอลเล็ท
ชำระเงินสำเร็จ
9 ต.ค. 14:32
ไปยัง ร้าน ข้าวมันไก่ป้าศรี
จำนวนเงิน 60.00 บาท
เลขที่รายการ 50012345678901`,
    amount: 60,
    date: '2026-10-09',
    time: '14:32',
    reference: '50012345678901',
  },
}

describe('สลิปธนาคารไทยหลายเจ้า', () => {
  for (const [bank, slip] of Object.entries(SLIPS)) {
    it(bank, () => {
      const r = parseSlip(slip.text, [ME], TODAY)
      expect(r.amount.value).toBe(slip.amount)
      expect(r.date.value).toBe(slip.date)
      if (slip.time) expect(r.time.value).toBe(slip.time)
      if (slip.reference) expect(r.reference.value).toBe(slip.reference)
      // ทุกใบต้องได้ประเภทเสมอ ไม่ค้างให้ผู้ใช้เลือก
      expect(r.direction).not.toBeNull()
    })
  }
})

describe('OCR อ่านเพี้ยน', () => {
  it('ตัว O และ l ในกลุ่มตัวเลข', () => {
    const r = parseSlip('โอนเงินสำเร็จ\n9 ต.ค. 2569 l4:3O\nจำนวนเงิน 1,25O.OO บาท', [], TODAY)
    expect(r.amount.value).toBe(1250)
    expect(r.time.value).toBe('14:30')
  })
  it('ชื่อเดือนเพี้ยนไปหนึ่งตัว', () => {
    expect(parseSlip('วันที่ 9 ตุลาคน 2569 14:32', [], TODAY).date.value).toBe('2026-10-09')
    expect(parseSlip('9 Octobar 2026 14:32', [], TODAY).date.value).toBe('2026-10-09')
  })
  it('ปีสองหลักติดกับเวลา', () => {
    expect(parseSlip('9 ต.ค.6914:32', [], TODAY).date.value).toBe('2026-10-09')
  })
  it('ป้ายที่วรรณยุกต์หาย', () => {
    expect(parseSlip('เลขทีรายการ 015282143250BTF04512', [], TODAY).reference.value).toBe('015282143250BTF04512')
  })
  it('เลขอ้างอิงไม่มีป้าย ใช้เลขรายการยาวที่พบเพียงค่าเดียว', () => {
    const r = parseSlip('โอนเงินสำเร็จ\n9 ต.ค. 69 14:32\nจำนวนเงิน 20.00\n015282143250BTF04512', [], TODAY)
    expect(r.reference.value).toBe('015282143250BTF04512')
    expect(r.reference.issue).toMatch(/ไม่พบป้าย/)
  })
})

describe('วันที่สำรองเมื่อสลิปไม่มีวันที่', () => {
  const noDate = 'โอนเงินสำเร็จ\nจาก นาย สมชาย ใจดี\nไปยัง นาง สมศรี มีสุข\nจำนวนเงิน 75.00 บาท'
  it('ใช้วันที่จากเลขอ้างอิงที่ขึ้นต้นด้วยวันที่', () => {
    const r = parseSlip(`${noDate}\nรหัสอ้างอิง 202610081432AbCdEf123`, [ME], TODAY)
    expect(r.date.value).toBe('2026-10-08')
    expect(r.review).toContain('date')
  })
  it('ใช้วันที่ของไฟล์รูป และให้ตรวจ', () => {
    const r = parseSlip(noDate, [ME], TODAY, { fileDate: '2026-10-07' })
    expect(r.date).toMatchObject({ value: '2026-10-07', issue: expect.stringMatching(/ไฟล์รูป/) })
    expect(r.review).toContain('date')
  })
  it('ไม่ใช้วันที่ของไฟล์ที่อยู่ในอนาคต', () => {
    expect(parseSlip(noDate, [ME], TODAY, { fileDate: '2026-12-01' }).date.value).toBeNull()
  })
})

describe('QR ตรวจสอบสลิป', () => {
  const payload = '0041000600000101030040220015282143250BTF045125102TH9104B1C6'
  it('อ่านเลขอ้างอิงและธนาคารผู้โอน', () => {
    expect(parseSlipQr(payload)).toEqual({ reference: '015282143250BTF04512', bank: 'กสิกรไทย' })
    expect(parseSlipQr('hello')).toBeNull()
    expect(parseSlipQr('00020101021129370016A000000677010111')).toBeNull()
  })
  it('QR ชนะเลขที่ OCR อ่านผิด', () => {
    const r = parseSlip('เลขที่รายการ 015282l4325OBTFO45l2\nจำนวนเงิน 10.00', [], TODAY, { qr: payload })
    expect(r.reference).toMatchObject({ value: '015282143250BTF04512', confidence: 0.99 })
    expect(r.banks).toContain('กสิกรไทย')
  })
})

describe('เงินเข้าหรือออก', () => {
  const english = `From MR. SOMCHAI J
SCB xxx-xxx123-4
To MS. MANEE M
KBank xxx-x-x5678-x
Amount 100.00 THB`
  it('จำชื่อภาษาอังกฤษที่ผู้ใช้ยืนยันแล้ว', () => {
    expect(parseSlip(english, [ME], TODAY).directionGuessed).toBe(true)
    const self = addSelf({ names: [], accounts: [] }, 'MR. SOMCHAI J', null)
    expect(parseSlip(english, [ME, ...self.names], TODAY)).toMatchObject({ direction: 'expense', directionGuessed: false })
  })
  it('จำเลขบัญชีของผู้ใช้', () => {
    expect(parseSlip(english, [], TODAY, { ownAccounts: ['5678'] })).toMatchObject({ direction: 'income', directionGuessed: false })
    expect(parseSlip(english, [], TODAY).senderAccount).toBe('1234')
  })
  it('ผู้รับเป็นบริษัท เดาว่าจ่าย · ผู้โอนเป็นบริษัท เดาว่ารับ', () => {
    expect(parseSlip('จาก นาย ก ข\nไปยัง บริษัท ตัวอย่าง จำกัด\nจำนวนเงิน 10.00', [], TODAY)).toMatchObject({
      direction: 'expense',
      directionGuessed: true,
    })
    expect(parseSlip('จาก บริษัท นายจ้าง จำกัด\nไปยัง นาย ก ข\nจำนวนเงิน 10.00', [], TODAY)).toMatchObject({
      direction: 'income',
      directionGuessed: true,
    })
  })
})
