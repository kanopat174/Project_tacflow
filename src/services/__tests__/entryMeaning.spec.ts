import { describe, expect, it } from 'vitest'
import { inferMeaning } from '../entryMeaning'
import { parseQuickEntry } from '../quickParse'

const p = (text: string) => parseQuickEntry(text, 'personal', '2026-10-09')

describe('ถอดความหมายว่าใครให้ใคร', () => {
  it('ผู้ให้อยู่หน้า "ให้" ผู้รับอยู่หลัง', () => {
    expect(p('แม่ให้ 500')).toMatchObject({ type: 'income', amount: 500 })
    expect(p('ให้แม่ 500')).toMatchObject({ type: 'expense', amount: 500 })
    expect(p('ผมให้แม่ 500')?.type).toBe('expense')
    expect(p('แม่ให้ผม 500')?.type).toBe('income')
    expect(p('แม่ให้มา 500')?.type).toBe('income')
  })

  it('ความหมายชนะคำในรายการ', () => {
    // มี "ค่า" แต่แม่เป็นผู้ให้
    expect(p('แม่ให้ค่าขนม 300')?.type).toBe('income')
    expect(p('ป้าโอนให้ 1000')?.type).toBe('income')
    expect(p('โอนให้แม่ 1000')?.type).toBe('expense')
    expect(p('ให้เงินแม่ 2000')?.type).toBe('expense')
  })

  it('ซื้อของให้คนอื่นคือรายจ่าย', () => {
    expect(p('ซื้อเค้กให้แม่ 450')?.type).toBe('expense')
    expect(p('ใส่ซองให้น้อง 500')?.type).toBe('expense')
  })

  it('เงินเข้า/ออกจากคำบอกทิศทาง', () => {
    expect(p('พี่โอนมา 800')?.type).toBe('income')
    expect(p('ได้จากลุง 1000')?.type).toBe('income')
    expect(p('โอนไปบัญชีออม 2000')?.type).toBe('expense')
  })

  it('ยืมและคืนเงิน เติมบทบาทเงินยืมให้ด้วย', () => {
    expect(p('ยืมพี่ 2000')).toMatchObject({ type: 'income', loan: { role: 'borrow', party: 'พี่' } })
    expect(p('แม่ให้ยืม 5000')).toMatchObject({ type: 'income', loan: { role: 'borrow', party: 'แม่' } })
    expect(p('ให้เพื่อนยืม 1000')).toMatchObject({ type: 'expense', loan: { role: 'lend', party: 'เพื่อน' } })
    expect(p('เพื่อนยืม 300')).toMatchObject({ type: 'expense', loan: { role: 'lend', party: 'เพื่อน' } })
    expect(p('เพื่อนคืน 1000')).toMatchObject({ type: 'income', loan: { role: 'collect', party: 'เพื่อน' } })
    expect(p('เพื่อนโอนคืน 1000')).toMatchObject({ type: 'income', loan: { role: 'collect', party: 'เพื่อน' } })
    expect(p('คืนพี่ 2000')).toMatchObject({ type: 'expense', loan: { role: 'repay', party: 'พี่' } })
  })

  it('ตีความไม่ได้ปล่อยให้ตัวเดาจากคำทำงานต่อ', () => {
    expect(inferMeaning('กาแฟ')).toBeNull()
    expect(inferMeaning('ค่าให้บริการ')).toBeNull()
    expect(inferMeaning('แม่ให้น้อง')).toBeNull()
    expect(inferMeaning('เงินคืน')).toBeNull()
    expect(p('เงินคืน 50')?.type).toBe('income')
    expect(p('เงินเดือน 30000')?.type).toBe('income')
    expect(p('กาแฟ 65')?.type).toBe('expense')
    // เครื่องหมายชนะทุกอย่าง
    expect(p('-500 แม่ให้')?.type).toBe('expense')
  })
})
