import { describe, expect, it } from 'vitest'
import {
  detectColumns,
  entriesToCsv,
  guessCategory,
  importStatement,
  parseAmount,
  parseCsv,
  parseDate,
} from '../ledgerCsv'

describe('อ่านและเขียน CSV', () => {
  it('รองรับเครื่องหมายคำพูด จุลภาค และขึ้นบรรทัดใหม่ในช่อง', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,"2\n3",4\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2\n3', '4'],
    ])
  })

  it('เดาตัวคั่นเป็น ; หรือ tab ได้', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('ส่งออกมี BOM ป้ายหมวดภาษาไทย และกันสูตร Excel ในหมายเหตุ', () => {
    const csv = entriesToCsv(
      [
        { id: '1', date: '2026-02-01', type: 'expense', categoryKey: 'food', amount: 120, note: '=HYPERLINK("x")' },
        { id: '2', date: '2026-01-01', type: 'income', categoryKey: 'salary', amount: 30_000, note: 'เงินเดือน, มกราคม' },
      ],
      'personal',
    )
    expect(csv.startsWith('﻿')).toBe(true)
    const rows = parseCsv(csv)
    expect(rows[1]).toEqual(['2026-01-01', 'รายรับ', 'เงินเดือน', '30000', '', '', '', 'เงินเดือน, มกราคม'])
    expect(rows[2]![7]).toBe(`'=HYPERLINK("x")`)
  })
})

describe('แปลงค่าจาก statement', () => {
  it('ยอดเงินหลายรูปแบบ', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5)
    expect(parseAmount('(500.00)')).toBe(-500)
    expect(parseAmount('-75')).toBe(-75)
    expect(parseAmount('฿ 1,000')).toBe(1000)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })

  it('วันที่ทั้ง ค.ศ. พ.ศ. และชื่อเดือน', () => {
    expect(parseDate('2026-01-31')).toBe('2026-01-31')
    expect(parseDate('31/01/2026')).toBe('2026-01-31')
    expect(parseDate('31/01/2569')).toBe('2026-01-31')
    expect(parseDate('05-02-69')).toBe('2026-02-05')
    expect(parseDate('05/02/26 14:22')).toBe('2026-02-05')
    expect(parseDate('3 มี.ค. 2569')).toBe('2026-03-03')
    expect(parseDate('3 Mar 2026')).toBe('2026-03-03')
    expect(parseDate('31/02/2026')).toBeNull()
  })

  it('หาหัวตารางที่อยู่ใต้ข้อมูลบัญชี', () => {
    const rows = parseCsv('เลขที่บัญชี,123-4-56789-0\nวันที่,รายการ,ถอนเงิน,ฝากเงิน,ยอดคงเหลือ\n01/01/2569,ATM,500,,1000')
    const found = detectColumns(rows)
    expect(found?.headerRow).toBe(1)
    expect(found?.columns).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 })
  })
})

describe('จัดหมวดอัตโนมัติ', () => {
  it('ใช้หมวดที่โหมดนั้นมีจริง', () => {
    expect(guessCategory('GRAB FOOD 1234', 'expense', 'personal')).toBe('food')
    expect(guessCategory('GRAB TAXI', 'expense', 'personal')).toBe('transport')
    expect(guessCategory('เงินเดือน บริษัท', 'income', 'personal')).toBe('salary')
    expect(guessCategory('เงินเดือน พนักงาน', 'expense', 'sme')).toBe('staff')
    expect(guessCategory('ADOBE CREATIVE CLOUD', 'expense', 'freelancer')).toBe('software')
    expect(guessCategory('โอนเงินให้เพื่อน', 'expense', 'personal')).toBe('otherExpense')
  })
})

describe('นำเข้า statement', () => {
  it('คอลัมน์ถอน–ฝากแยกกัน และติดธงรายการซ้ำ', () => {
    const csv = [
      'วันที่,รายละเอียด,ถอนเงิน,ฝากเงิน,ยอดคงเหลือ',
      '01/07/2569,เงินเดือน ACME,,"30,000.00","30,000.00"',
      '02/07/2569,7-ELEVEN สาขา 1,85.00,,"29,915.00"',
      'xx/yy,???,10,,',
      ',ยอดรวม,85.00,"30,000.00",',
    ].join('\n')
    const r = importStatement(csv, 'personal', [{ date: '2026-07-01', type: 'income', amount: 30_000 }])
    expect(r.error).toBe('')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ date: '2026-07-01', type: 'income', amount: 30_000, categoryKey: 'salary', duplicate: true })
    expect(r.rows[1]).toMatchObject({ date: '2026-07-02', type: 'expense', amount: 85, categoryKey: 'food', duplicate: false })
    expect(r.skipped).toEqual([{ line: 4, reason: 'อ่านวันที่ไม่ได้' }])
  })

  it('คอลัมน์ยอดเดียว บวกเข้า ลบออก', () => {
    const r = importStatement('Date,Description,Amount\n2026-03-01,Netflix,-419\n2026-03-02,Interest,12.5', 'personal')
    expect(r.rows.map((x) => [x.type, x.amount, x.categoryKey])).toEqual([
      ['expense', 419, 'lifestyle'],
      ['income', 12.5, 'investmentIncome'],
    ])
  })

  it('ไฟล์ที่ไม่มีหัวตารางแจ้งข้อผิดพลาด', () => {
    expect(importStatement('hello\nworld', 'personal').error).not.toBe('')
  })
})
