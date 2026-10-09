import { describe, expect, it } from 'vitest'
import { looksLikeBankNotice, parseEntries, splitQuickEntries } from '../multiEntry'

const TODAY = '2026-10-10'
const p = (text: string) => parseEntries(text, 'personal', TODAY)

describe('ประโยคเดียวหลายรายการ', () => {
  it('แยกหลังยอดเงินที่ตามด้วยคำใหม่', () => {
    expect(splitQuickEntries('ข้าว 60 กาแฟ 45 ค่ารถ 30')).toEqual(['ข้าว 60', 'กาแฟ 45', 'ค่ารถ 30'])
    expect(p('ข้าว 60 กาแฟ 45 ค่ารถ 30').map((e) => [e.note, e.amount, e.type])).toEqual([
      ['ข้าว', 60, 'expense'],
      ['กาแฟ', 45, 'expense'],
      ['ค่ารถ', 30, 'expense'],
    ])
  })
  it('ตัวคั่น , ; | และ "และ" — จุลภาคในตัวเลขไม่นับ', () => {
    expect(splitQuickEntries('ค่าไฟ 1,200, ค่าน้ำ 150')).toEqual(['ค่าไฟ 1,200', 'ค่าน้ำ 150'])
    expect(splitQuickEntries('ข้าว 60 และ เงินเดือน 30000')).toEqual(['ข้าว 60', 'เงินเดือน 30000'])
    expect(p('ข้าว 60 | แม่ให้ 500').map((e) => e.type)).toEqual(['expense', 'income'])
  })
  it('คำที่ตามหลังยอดเงินยังเป็นรายการเดิม', () => {
    expect(splitQuickEntries('ข้าว 60 เมื่อวาน กาแฟ 45')).toEqual(['ข้าว 60 เมื่อวาน', 'กาแฟ 45'])
    expect(splitQuickEntries('กาแฟ 65 บาท ขนม 20 บาท')).toEqual(['กาแฟ 65 บาท', 'ขนม 20 บาท'])
    expect(p('ข้าว 60 เมื่อวาน กาแฟ 45')[0]?.date).toBe('2026-10-09')
  })
  it('รายการเดียวยังเป็นรายการเดียว', () => {
    expect(splitQuickEntries('+500 ขายของ')).toEqual(['+500 ขายของ'])
    expect(splitQuickEntries('ข้าว 7-11 60')).toEqual(['ข้าว 7-11 60'])
    expect(splitQuickEntries('ค่าเทอม 20000 15/12')).toEqual(['ค่าเทอม 20000 15/12'])
    expect(p('กาแฟ 65')).toHaveLength(1)
  })
})

describe('ข้อความแจ้งเตือนธนาคาร', () => {
  it('เงินออก ไม่เอายอดคงเหลือ', () => {
    const [e] = p('09/10/69 14:32 บช X-1234 เงินออก 500.00 คงเหลือ 12,345.67 บ.')
    expect(e).toMatchObject({ type: 'expense', amount: 500, date: '2026-10-09' })
    expect(e?.note).toContain('1234')
  })
  it('เงินเข้า มีชื่อผู้โอน', () => {
    const [e] = p('เงินเข้าบัญชี XX5678 จำนวน 1,000.00 บาท จาก นางสมศรี มีสุข 08-10-26@09:15 ยอดเงินคงเหลือ 5,000.00 บาท')
    expect(e).toMatchObject({ type: 'income', amount: 1000, date: '2026-10-08' })
    expect(e?.note).toContain('สมศรี')
  })
  it('หลายแจ้งเตือนที่วางมาพร้อมกัน', () => {
    const list = p('เงินออก 120.00 บ. บช x1234 09/10 | เงินเข้า 3,000.00 บ. บช x1234 09/10 | ถอนเงิน 1,000.00 บ. จาก บ/ช x1234')
    expect(list.map((e) => [e.type, e.amount])).toEqual([
      ['expense', 120],
      ['income', 3000],
      ['expense', 1000],
    ])
  })
  it('แจ้งเตือนภาษาอังกฤษ', () => {
    const [e] = p('Your a/c x1234 was debited THB 250.00 on 09/10/2026. Avail bal THB 4,750.00')
    expect(e).toMatchObject({ type: 'expense', amount: 250, date: '2026-10-09' })
  })
  it('ประโยคทั่วไปไม่ใช่แจ้งเตือนธนาคาร', () => {
    expect(looksLikeBankNotice('กาแฟ 65')).toBe(false)
    expect(looksLikeBankNotice('จ่ายค่าไฟ 1200')).toBe(false)
  })
})
