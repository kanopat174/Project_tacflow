import { describe, expect, it } from 'vitest'
import { normaliseSpokenEntry, thaiWordsToNumber } from '../spokenThai'
import { parseQuickEntry } from '../quickParse'
import { loanBalances, loanTotals, openBalances, suggestLoanRole, type LoanEntry } from '../loans'

describe('แปลงคำพูดเป็นตัวเลข', () => {
  it.each([
    ['หกสิบ', 60],
    ['สิบเอ็ด', 11],
    ['ยี่สิบห้า', 25],
    ['หนึ่งร้อยห้าสิบ', 150],
    ['ร้อยห้า', 150],
    ['พันห้า', 1500],
    ['สองหมื่นห้า', 25_000],
    ['สามหมื่นสองพัน', 32_000],
    ['หนึ่งล้านสองแสน', 1_200_000],
    ['ล้าน', 1_000_000],
    ['2 พัน', 2000],
  ])('%s = %d', (words, value) => {
    expect(thaiWordsToNumber(words)).toBe(value)
  })

  it('แปลงในประโยคแล้วตัวแยกรายการอ่านได้', () => {
    expect(normaliseSpokenEntry('ข้าวมันไก่ หกสิบบาท')).toBe('ข้าวมันไก่ 60 บาท')
    expect(normaliseSpokenEntry('ค่าไฟ พันสองร้อย เมื่อวาน')).toBe('ค่าไฟ 1200 เมื่อวาน')
    expect(normaliseSpokenEntry('บวก สามหมื่น เงินเดือน')).toBe('+30000 เงินเดือน')
    const parsed = parseQuickEntry(normaliseSpokenEntry('ข้าวมันไก่ หกสิบบาท'), 'personal', '2026-10-09')
    expect(parsed).toMatchObject({ amount: 60, type: 'expense', note: 'ข้าวมันไก่' })
  })

  it('ไม่แปลงคำที่ไม่ใช่จำนวนเงิน', () => {
    expect(normaliseSpokenEntry('ค่ารถสองแถว 10')).toBe('ค่ารถสองแถว 10')
    expect(normaliseSpokenEntry('ซื้อของห้าง 300')).toBe('ซื้อของห้าง 300')
    expect(normaliseSpokenEntry('กาแฟ 65')).toBe('กาแฟ 65')
  })
})

describe('เงินยืม', () => {
  const e = (id: string, date: string, amount: number, role: 'lend' | 'collect' | 'borrow' | 'repay', party: string): LoanEntry => ({
    id,
    date,
    amount,
    note: '',
    loan: { role, party },
  })

  const entries = [
    e('1', '2026-08-01', 5000, 'lend', 'นาง สมศรี ใจดี'),
    e('2', '2026-09-01', 2000, 'collect', 'สมศรี ใจดี xxx-x-x1234-x'),
    e('3', '2026-09-10', 1000, 'borrow', 'นาย ก้อง'),
    e('4', '2026-09-20', 300, 'lend', 'มานี'),
    e('5', '2026-09-25', 300, 'collect', 'มานี'),
    { id: '6', date: '2026-09-26', amount: 99, note: 'กาแฟ' },
  ]

  it('รวมยอดค้างต่อคน ชื่อเขียนต่างกันนับเป็นคนเดียว', () => {
    const balances = loanBalances(entries)
    const somsri = balances.find((b) => b.key === 'สมศรี ใจดี')!
    expect(somsri).toMatchObject({ owedToMe: 3000, iOwe: 0, entries: [{ id: '2' }, { id: '1' }] })
    expect(balances.find((b) => b.key === 'ก้อง')).toMatchObject({ iOwe: 1000 })
    // มานีคืนครบแล้ว ไม่แสดงในยอดค้าง
    expect(openBalances(balances).map((b) => b.key)).toEqual(['สมศรี ใจดี', 'ก้อง'])
    expect(loanTotals(openBalances(balances))).toEqual({ owedToMe: 3000, iOwe: 1000 })
  })

  it('เสนอเป็นเงินคืนเมื่อคู่โอนค้างกันอยู่', () => {
    const balances = loanBalances(entries)
    expect(suggestLoanRole(balances, 'income', 'นางสมศรี ใจดี')).toEqual({
      tag: { role: 'collect', party: 'สมศรี ใจดี xxx-x-x1234-x' },
      outstanding: 3000,
    })
    expect(suggestLoanRole(balances, 'expense', 'ก้อง')).toMatchObject({ tag: { role: 'repay' }, outstanding: 1000 })
    // เงินออกให้คนที่ติดเรา ไม่ใช่การคืนเงิน ไม่เสนอ
    expect(suggestLoanRole(balances, 'expense', 'สมศรี ใจดี')).toBeNull()
    expect(suggestLoanRole(balances, 'income', 'มานี')).toBeNull()
    expect(suggestLoanRole(balances, 'income', 'คนแปลกหน้า')).toBeNull()
  })
})
