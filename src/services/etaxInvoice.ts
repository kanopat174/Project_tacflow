/**
 * อ่านใบกำกับภาษีอิเล็กทรอนิกส์ (e-Tax Invoice) — ไม่ต้องใช้ OCR
 *
 * ไฟล์ PDF ของ e-Tax Invoice เป็น PDF/A-3 ที่ฝังไฟล์ XML ตามมาตรฐาน ขมธอ. 3-2560 ของ สพธอ.
 * (โครงสร้าง UN/CEFACT Cross Industry Invoice) จึงอ่านยอด VAT เลขผู้เสียภาษี และวันที่ได้ตรงทุกตัว
 * ถ้าไม่มี XML ฝังอยู่ (PDF ทั่วไป) คืน null ให้ผู้ใช้กรอกเองหรือถ่ายรูปให้ OCR อ่านแทน
 */

export interface EtaxInvoice {
  number: string
  typeCode: string
  typeLabel: string
  /** YYYY-MM-DD */
  issueDate: string | null
  sellerName: string
  sellerTaxId: string
  buyerName: string
  buyerTaxId: string
  /** ยอดรวมทั้งสิ้น (รวม VAT) */
  total: number
  vat: number
}

/** รหัสประเภทเอกสารตาม ขมธอ. 3-2560 */
const TYPE_LABELS: Record<string, string> = {
  '388': 'ใบกำกับภาษี',
  T01: 'ใบรับ (ใบเสร็จรับเงิน)',
  T02: 'ใบแจ้งหนี้/ใบกำกับภาษี',
  T03: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
  T04: 'ใบส่งของ/ใบกำกับภาษี',
  T05: 'ใบกำกับภาษีอย่างย่อ',
  T06: 'ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ',
  '80': 'ใบเพิ่มหนี้',
  '81': 'ใบลดหนี้',
}

/** หา element ตาม localName โดยไม่สน namespace prefix (rsm:/ram: ต่างกันได้ในแต่ละผู้ออก) */
function first(root: Document | Element, ...path: string[]): Element | null {
  let current: Document | Element | null = root
  for (const name of path) {
    if (!current) return null
    current = current.getElementsByTagNameNS('*', name)[0] ?? null
  }
  return current as Element | null
}

const text = (el: Element | null) => el?.textContent?.trim() ?? ''
const amount = (el: Element | null) => {
  const n = Number(text(el).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export function parseEtaxXml(xml: string): EtaxInvoice | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return null
  const summary = first(doc, 'SpecifiedTradeSettlementHeaderMonetarySummation')
  const document = first(doc, 'ExchangedDocument')
  if (!summary || !document) return null

  const typeCode = text(first(document, 'TypeCode'))
  const issued = text(first(document, 'IssueDateTime')).slice(0, 10)
  const seller = first(doc, 'SellerTradeParty')
  const buyer = first(doc, 'BuyerTradeParty')
  const taxIdOf = (party: Element | null) => text(party ? first(party, 'SpecifiedTaxRegistration', 'ID') : null)

  return {
    number: text(first(document, 'ID')),
    typeCode,
    typeLabel: TYPE_LABELS[typeCode] ?? 'ใบกำกับภาษีอิเล็กทรอนิกส์',
    issueDate: /^\d{4}-\d{2}-\d{2}$/.test(issued) ? issued : null,
    sellerName: text(seller ? first(seller, 'Name') : null),
    sellerTaxId: taxIdOf(seller),
    buyerName: text(buyer ? first(buyer, 'Name') : null),
    buyerTaxId: taxIdOf(buyer),
    total: amount(first(summary, 'GrandTotalAmount')),
    vat: amount(first(summary, 'TaxTotalAmount')),
  }
}

/** เลขผู้ซื้อในใบตรงกับเลขบัตรของผู้ใช้หรือไม่ — เลขสาขา 5 หลักท้ายไม่นับ null คือใบไม่ระบุผู้ซื้อ */
export function buyerMatches(invoice: Pick<EtaxInvoice, 'buyerTaxId'>, citizenId: string): boolean | null {
  const buyer = invoice.buyerTaxId.replace(/\D/g, '').slice(0, 13)
  const mine = citizenId.replace(/\D/g, '')
  if (buyer.length !== 13 || mine.length !== 13) return null
  return buyer === mine
}

/** ดึง XML ที่ฝังใน PDF ด้วย pdf.js — PDF ทั่วไปที่ไม่มีไฟล์ฝังคืน null */
export async function readEtaxPdf(file: Blob): Promise<EtaxInvoice | null> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    return await etaxFromDocument(await task.promise)
  } finally {
    await task.destroy()
  }
}

/** ส่วนของเอกสาร pdf.js ที่ใช้อ่านไฟล์แนบ — แยกไว้ให้เทสต์ใช้ pdf.js รุ่นสำหรับ Node ได้ */
export interface PdfWithAttachments {
  getAttachments(): Promise<Map<string, { filename: string; content?: Uint8Array | null }> | null>
  getAttachmentContent(id: string): Promise<Uint8Array | null>
}

export async function etaxFromDocument(pdf: PdfWithAttachments): Promise<EtaxInvoice | null> {
  // pdf.js รุ่น 6 คืน Map และโหลดเนื้อไฟล์แนบแยกเมื่อขอ
  for (const [id, item] of (await pdf.getAttachments()) ?? new Map()) {
    if (!/\.xml$/i.test(item.filename)) continue
    const content = item.content ?? (await pdf.getAttachmentContent(id))
    if (!content) continue
    const parsed = parseEtaxXml(new TextDecoder('utf-8').decode(content))
    if (parsed) return parsed
  }
  return null
}
