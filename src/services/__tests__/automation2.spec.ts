import { describe, expect, it } from 'vitest'
import { detectRecurring, type RecurringCandidateEntry } from '../recurringDetect'
import { buyerMatches, etaxFromDocument, parseEtaxXml } from '../etaxInvoice'
import { planShared } from '../sharedFiles'

const today = '2026-10-09'

describe('ตรวจจับรายการประจำ', () => {
  const rent = (date: string, amount = 4500): RecurringCandidateEntry => ({
    date,
    type: 'expense',
    categoryKey: 'housing',
    amount,
    note: 'ค่าเช่าห้อง',
    slip: { recipient: 'นาง สมศรี ใจดี', sender: null, time: null, recipientType: 'person', recipientBank: null, banks: [], reference: null, imageHash: null },
  })

  it('จ่ายคนเดิม ยอดเดิม 3 เดือนติด เสนอให้ตั้งเป็นประจำ', () => {
    const [s] = detectRecurring([rent('2026-07-01'), rent('2026-08-02'), rent('2026-09-01')], [], today)
    expect(s).toMatchObject({ amount: 4500, dayOfMonth: 1, startMonth: '2026-10', categoryKey: 'housing' })
    expect(s!.months).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('ยอดขยับเล็กน้อยยังนับ ยอดต่างมากไม่นับ', () => {
    expect(detectRecurring([rent('2026-07-01', 4500), rent('2026-08-01', 4600), rent('2026-09-01', 4550)], [], today)).toHaveLength(1)
    expect(detectRecurring([rent('2026-07-01', 4500), rent('2026-08-01', 9000), rent('2026-09-01', 4500)], [], today)).toHaveLength(0)
  })

  it('ไม่เสนอเมื่อไม่ติดกัน เลิกจ่ายแล้ว มีรายการประจำอยู่แล้ว หรือผู้ใช้ปฏิเสธ', () => {
    expect(detectRecurring([rent('2026-05-01'), rent('2026-07-01'), rent('2026-09-01')], [], today)).toHaveLength(0)
    expect(detectRecurring([rent('2026-04-01'), rent('2026-05-01'), rent('2026-06-01')], [], today)).toHaveLength(0)
    const entries = [rent('2026-07-01'), rent('2026-08-01'), rent('2026-09-01')]
    expect(detectRecurring(entries, [{ type: 'expense', amount: 4500, note: 'ค่าเช่าห้อง', categoryKey: 'housing' }], today)).toHaveLength(0)
    const [s] = detectRecurring(entries, [], today)
    expect(detectRecurring(entries, [], today, [s!.key])).toHaveLength(0)
  })

  it('ไม่นับรายการที่สร้างจากรายการประจำอยู่แล้ว', () => {
    const generated = ['2026-07-01', '2026-08-01', '2026-09-01'].map((d) => ({ ...rent(d), recurringId: 'r1' }))
    expect(detectRecurring(generated, [], today)).toHaveLength(0)
  })
})

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:TaxInvoice_CrossIndustryInvoice xmlns:rsm="urn:etda:uncefact:data:standard:TaxInvoice_CrossIndustryInvoice:2" xmlns:ram="urn:etda:uncefact:data:standard:TaxInvoice_ReusableAggregateBusinessInformationEntity:2">
  <rsm:ExchangedDocument>
    <ram:ID>INV-2569-000123</ram:ID>
    <ram:Name>ใบเสร็จรับเงิน/ใบกำกับภาษี</ram:Name>
    <ram:TypeCode>T03</ram:TypeCode>
    <ram:IssueDateTime>2026-02-14T10:15:00</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>บริษัท ร้านหนังสือดี จำกัด</ram:Name>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="TXID">010555012345600000</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>สมชาย ใจดี</ram:Name>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="NIDN">1101700203451</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount>70.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>1070.00</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:TaxInvoice_CrossIndustryInvoice>`

/** PDF เล็กที่สุดที่ฝังไฟล์ XML ไว้ (เหมือนโครงของ PDF/A-3 e-Tax) — คำนวณตำแหน่ง xref ให้ถูกต้อง */
function pdfWithAttachment(xml: string): Uint8Array {
  const xmlBytes = new TextEncoder().encode(xml)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(ETDA-invoice.xml) 4 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    '<< /Type /Filespec /F (ETDA-invoice.xml) /UF (ETDA-invoice.xml) /EF << /F 5 0 R >> >>',
  ]
  const parts: (string | Uint8Array)[] = ['%PDF-1.7\n']
  const offsets: number[] = []
  let length = 9
  const push = (chunk: string | Uint8Array) => {
    parts.push(chunk)
    length += typeof chunk === 'string' ? new TextEncoder().encode(chunk).length : chunk.length
  }
  objects.forEach((body, i) => {
    offsets.push(length)
    push(`${i + 1} 0 obj\n${body}\nendobj\n`)
  })
  offsets.push(length)
  push(`5 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${xmlBytes.length} >>\nstream\n`)
  push(xmlBytes)
  push('\nendstream\nendobj\n')
  const xrefAt = length
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    const bytes = typeof part === 'string' ? new TextEncoder().encode(part) : part
    out.set(bytes, at)
    at += bytes.length
  }
  return out
}

describe('ใบกำกับภาษีอิเล็กทรอนิกส์', () => {
  it('อ่าน XML ตามมาตรฐาน ขมธอ. 3-2560', () => {
    expect(parseEtaxXml(XML)).toEqual({
      number: 'INV-2569-000123',
      typeCode: 'T03',
      typeLabel: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
      issueDate: '2026-02-14',
      sellerName: 'บริษัท ร้านหนังสือดี จำกัด',
      sellerTaxId: '010555012345600000',
      buyerName: 'สมชาย ใจดี',
      buyerTaxId: '1101700203451',
      total: 1070,
      vat: 70,
    })
    expect(parseEtaxXml('<not-invoice/>')).toBeNull()
    expect(parseEtaxXml('broken <xml')).toBeNull()
  })

  it('ตรวจว่าใบออกในชื่อผู้ใช้', () => {
    const invoice = parseEtaxXml(XML)!
    expect(buyerMatches(invoice, '1-1017-00203-45-1')).toBe(true)
    expect(buyerMatches(invoice, '3100500123456')).toBe(false)
    expect(buyerMatches({ buyerTaxId: '' }, '1101700203451')).toBeNull()
  })

  it('ดึง XML ที่ฝังอยู่ในไฟล์ PDF จริง', async () => {
    // เบราว์เซอร์ใช้ pdf.js ปกติ (readEtaxPdf) เทสต์ใน Node ใช้รุ่น legacy ที่ทำงานได้โดยไม่มี worker ของเบราว์เซอร์
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: pdfWithAttachment(XML) })
    try {
      const invoice = await etaxFromDocument(await task.promise)
      expect(invoice).toMatchObject({ number: 'INV-2569-000123', total: 1070 })
    } finally {
      await task.destroy()
    }
  }, 30_000)
})

describe('ไฟล์ที่แชร์มาจากแอปอื่น', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type })

  it('สลิปหลายใบเปิดสแกนพร้อมกัน ไฟล์เดียวเปิดบันทึกด่วน', () => {
    expect(planShared([file('a.jpg', 'image/jpeg'), file('b.png', 'image/png'), file('c.txt', 'text/plain')])).toMatchObject({
      single: null,
      ignored: 1,
    })
    expect(planShared([file('a.jpg', 'image/jpeg'), file('b.png', 'image/png')]).bulk).toHaveLength(2)
    expect(planShared([file('inv.pdf', 'application/pdf')]).single?.name).toBe('inv.pdf')
    expect(planShared([file('c.txt', 'text/plain')])).toEqual({ single: null, bulk: [], ignored: 1 })
  })
})
