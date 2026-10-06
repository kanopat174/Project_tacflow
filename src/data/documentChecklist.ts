/**
 * เอกสารที่ต้องเก็บไว้ตามรายการที่ใช้สิทธิ — สรรพากรเรียกตรวจย้อนหลังได้ (มาตรา 19)
 * แต่ละข้อผูกกับประเภทเอกสารในหน้าเอกสาร (DOCUMENT_TYPES) เพื่อเช็กว่าแนบไว้แล้วหรือยัง
 */

import type { TaxResult } from '@/services/taxEngine'

export interface ChecklistItem {
  id: string
  /** ประเภทเอกสารในหน้าเอกสาร */
  docType: string
  title: string
  detail: string
  /** รายการในแบบที่ทำให้ต้องใช้เอกสารนี้ */
  because: string
}

interface Rule {
  id: string
  docType: string
  title: string
  detail: string
  /** คีย์ค่าลดหย่อนที่ใช้เอกสารนี้ */
  deductionKeys?: string[]
}

const RULES: Rule[] = [
  {
    id: 'insurance',
    docType: 'insurance',
    title: 'ใบเสร็จหรือหนังสือรับรองเบี้ยประกัน',
    detail: 'ประกันชีวิต สุขภาพ บำนาญ และของบิดามารดา/คู่สมรส — ต้องแจ้งบริษัทประกันให้ส่งข้อมูลให้กรมสรรพากรด้วย',
    deductionKeys: ['lifeInsurance', 'healthInsurance', 'parentHealthInsurance', 'spouseLifeInsurance', 'pensionInsurance', 'pensionAsLife'],
  },
  {
    id: 'fund',
    docType: 'fund',
    title: 'หนังสือรับรองการซื้อหน่วยลงทุนหรือเงินสะสม',
    detail: 'RMF, SSF, Thai ESG, Thai ESGX, กองทุนสำรองเลี้ยงชีพ, กบข., กอช. — ขอได้จาก บลจ. หรือนายจ้าง',
    deductionKeys: ['rmf', 'ssf', 'thaiEsg', 'thaiEsgxNew', 'thaiEsgxLtf', 'providentFund', 'gpf', 'nsf'],
  },
  {
    id: 'mortgage',
    docType: 'mortgage',
    title: 'หนังสือรับรองดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย',
    detail: 'ธนาคารออกให้ทุกต้นปี ถ้ากู้ร่วมต้องหารดอกเบี้ยตามจำนวนผู้กู้',
    deductionKeys: ['mortgageInterest'],
  },
  {
    id: 'house',
    docType: 'house',
    title: 'สัญญาจ้างและใบกำกับภาษีค่าสร้างบ้าน',
    detail: 'ผู้รับจ้างต้องจดทะเบียนภาษีมูลค่าเพิ่ม',
    deductionKeys: ['newHouse'],
  },
  {
    id: 'donation',
    docType: 'donation',
    title: 'ใบอนุโมทนาบัตร / หลักฐาน e-Donation',
    detail: 'บริจาคเพื่อการศึกษา กีฬา โรงพยาบาลรัฐ ต้องผ่านระบบ e-Donation จึงหักได้ 2 เท่า',
    deductionKeys: ['donationEducation', 'donationGeneral', 'politicalDonation'],
  },
  {
    id: 'prenatal',
    docType: 'prenatal',
    title: 'ใบเสร็จค่าฝากครรภ์และคลอดบุตร',
    detail: 'จากสถานพยาบาลที่ได้รับอนุญาต',
    deductionKeys: ['prenatal'],
  },
  {
    id: 'eReceipt',
    docType: 'eReceipt',
    title: 'ใบกำกับภาษีอิเล็กทรอนิกส์ (e-Tax Invoice / e-Receipt)',
    detail: 'ใบเสร็จกระดาษใช้สิทธิ Easy E-Receipt ไม่ได้',
    deductionKeys: ['easyReceipt', 'easyReceiptCommunity'],
  },
  {
    id: 'dependents',
    docType: 'other',
    title: 'เอกสารผู้อยู่ในอุปการะ',
    detail: 'สูติบัตรบุตร · หนังสือรับรองการอุปการะเลี้ยงดูบิดามารดา (ล.ย.03) · คนพิการ (ล.ย.04)',
    deductionKeys: ['children', 'parents', 'disabledCare'],
  },
  {
    id: 'stimulus2567',
    docType: 'other',
    title: 'ใบกำกับภาษีหรือใบเสร็จของมาตรการปี 2567',
    detail: 'ค่าท่องเที่ยวเมืองรอง ค่าซ่อมบ้าน/รถจากอุทกภัย ลงทุนวิสาหกิจเพื่อสังคม',
    deductionKeys: ['domesticTravel', 'floodHouseRepair', 'floodCarRepair', 'socialEnterprise'],
  },
]

export function buildChecklist(result: TaxResult, opts: { withholdingTax: number; actualExpenseKeys: string[] }): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const used = new Map(result.deductionLines.filter((l) => l.allowed > 0).map((l) => [l.key, l.label]))

  if (opts.withholdingTax > 0 || result.expenseLines.some((l) => l.code === '40(1)' && l.income > 0)) {
    items.push({
      id: 'wht50',
      docType: 'wht50',
      title: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
      detail: 'จากนายจ้างและผู้จ่ายเงินทุกราย — ใช้ยืนยันเงินได้ ภาษีที่ถูกหัก และเงินสมทบประกันสังคม',
      because: 'มีเงินได้จากการจ้างงานหรือถูกหักภาษี ณ ที่จ่าย',
    })
  }

  for (const rule of RULES) {
    const hits = (rule.deductionKeys ?? []).filter((k) => used.has(k)).map((k) => used.get(k)!)
    if (!hits.length) continue
    items.push({ id: rule.id, docType: rule.docType, title: rule.title, detail: rule.detail, because: hits.join(', ') })
  }

  if (opts.actualExpenseKeys.length) {
    items.push({
      id: 'expense',
      docType: 'expense',
      title: 'ใบเสร็จและหลักฐานค่าใช้จ่ายจริง',
      detail: 'เลือกหักค่าใช้จ่ายตามจริง ต้องมีหลักฐานทุกรายการ เก็บไว้อย่างน้อย 5 ปี',
      because: 'เลือกหักค่าใช้จ่ายตามจริง',
    })
  }
  return items
}
