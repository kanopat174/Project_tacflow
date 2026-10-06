import { describe, expect, it } from 'vitest'
import { calculateExpenses, calculateTax, formatBaht } from '../services/taxEngine'
import { monthlyBreakdown, summarise } from '../services/ledgerEngine'
import { api } from '../services/api'
import { LEGAL_REFERENCES } from '../data/taxLaw'

// jsdom ในชุดนี้ไม่ให้ localStorage มา — ใส่ตัวจำลองให้ก่อน
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  },
})

/** ตัดช่องว่างพิเศษที่ Intl ใส่ระหว่างสัญลักษณ์กับตัวเลข เพื่อเทียบข้อความง่ายขึ้น */
const plain = (s: string) => s.replace(/\s/g, '')

describe('การแสดงจำนวนเงิน', () => {
  it('ยอดติดลบต้องแสดงเครื่องหมายลบ ไม่ใช่กลายเป็น ฿0', () => {
    expect(plain(formatBaht(-1_500))).toMatch(/-฿1,500/)
    expect(plain(formatBaht(0))).toBe('฿0')
  })

  it('แสดงสตางค์เมื่อมีเศษ และไม่แสดงเมื่อเป็นจำนวนเต็ม', () => {
    expect(plain(formatBaht(100.5))).toBe('฿100.50')
    expect(plain(formatBaht(100))).toBe('฿100')
    expect(plain(formatBaht(0.1 + 0.2))).toBe('฿0.30')
  })
})

describe('ยอดภาษีบวกลบกันได้ตรง', () => {
  it('ภาษีรวมเท่ากับผลบวกภาษีแต่ละขั้นที่แสดง', () => {
    const r = calculateTax({ salary: 777_777.77 }, {})
    const sum = r.bracketLines.reduce((s, l) => s + l.tax, 0)
    expect(Math.round(sum * 100) / 100).toBe(r.tax)
    expect(Number.isInteger(Math.round(r.tax * 100))).toBe(true)
  })

  it('ค่าใช้จ่ายที่แบ่งให้ 40(1) กับ 40(2) รวมแล้วเท่าเพดานพอดี ไม่ขาดสตางค์', () => {
    const lines = calculateExpenses({ salary: 100_000, freelance: 200_000.01 })
    const pooled = lines.filter((l) => l.code === '40(1)' || l.code === '40(2)')
    const total = pooled.reduce((s, l) => s + l.expense, 0)
    expect(Math.round(total * 100) / 100).toBe(100_000)
  })

  it('เงินได้ − ค่าใช้จ่าย − ค่าลดหย่อนที่หักได้จริง = เงินได้สุทธิ แม้สิทธิลดหย่อนจะเกินเงินได้', () => {
    // เงินเดือน 100,000 หักค่าใช้จ่าย 50,000 เหลือ 50,000 แต่มีค่าลดหย่อนส่วนตัว 60,000
    const r = calculateTax({ salary: 100_000 }, {})
    expect(r.netIncome).toBe(0)
    expect(r.totalDeduction).toBeGreaterThan(r.usedDeduction)
    expect(r.grossIncome - r.totalExpense - r.usedDeduction).toBe(r.netIncome)
  })

  it('ยอดเงินได้ปกติยังคำนวณเท่าเดิม', () => {
    const r = calculateTax({ salary: 600_000 }, { socialSecurity: 9_000 }, 25_000)
    expect(r.tax).toBe(20_600)
    expect(r.balance).toBe(-4_400)
    expect(r.grossIncome - r.totalExpense - r.usedDeduction).toBe(r.netIncome)
  })
})

describe('ยอดรวมสมุดบัญชี', () => {
  const entries = [
    { id: '1', date: '2026-07-01', type: 'income' as const, categoryKey: 'salary', amount: 0.1, note: '' },
    { id: '2', date: '2026-07-02', type: 'income' as const, categoryKey: 'salary', amount: 0.2, note: '' },
    { id: '3', date: '2026-07-03', type: 'expense' as const, categoryKey: 'food', amount: 0.3, note: '' },
  ]

  it('ยอดรายเดือนไม่มีเศษทศนิยมฐานสอง', () => {
    const [july] = monthlyBreakdown(entries)
    expect(july?.income).toBe(0.3)
    expect(july?.net).toBe(0)
  })

  it('คงเหลือสุทธิ = รายรับ − รายจ่าย', () => {
    const s = summarise(entries, 'personal')
    expect(s.net).toBe(0)
    expect(s.income).toBe(0.3)
  })
})

describe('ข้อกฎหมายในขั้นตอนเตรียมแบบภาษี', () => {
  it('ทุกขั้นตอนมีข้อกฎหมายประกอบ', () => {
    for (const step of [1, 2, 3, 4] as const) {
      expect(LEGAL_REFERENCES[step].length).toBeGreaterThan(0)
    }
  })
})

describe('แก้ไขสมุดบัญชีและรูปภาพ', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

  it('แก้ชื่อ เงินทุนตั้งต้น คำอธิบาย รูปสมุด และรูปปกได้', async () => {
    await api.login({ username: 'somchai', password: 'somchai123' })
    const updated = await api.updateWorkspace('w_seed_personal', {
      name: '  เงินเก็บบ้าน  ',
      capital: 150_000.555,
      description: 'ค่าใช้จ่ายในบ้าน',
      avatarUrl: PNG,
      coverUrl: PNG,
    })
    expect(updated.name).toBe('เงินเก็บบ้าน')
    expect(updated.capital).toBe(150_000.56)
    expect(updated.description).toBe('ค่าใช้จ่ายในบ้าน')
    expect(updated.avatarUrl).toBe(PNG)
    expect(updated.coverUrl).toBe(PNG)

    const removed = await api.updateWorkspace('w_seed_personal', { coverUrl: '' })
    expect(removed.coverUrl).toBe('')
    expect(removed.avatarUrl).toBe(PNG)
  })

  it('ไม่ยอมรับรูปที่ไม่ใช่ data URL ของภาพ หรือเงินทุนติดลบ', async () => {
    await api.login({ username: 'somchai', password: 'somchai123' })
    await expect(
      api.updateWorkspace('w_seed_personal', { avatarUrl: 'javascript:alert(1)' }),
    ).rejects.toThrow(/ไฟล์ภาพ/)
    await expect(api.updateWorkspace('w_seed_personal', { capital: -1 })).rejects.toThrow(/เงินทุน/)
    await expect(api.updateWorkspace('w_seed_personal', { name: '   ' })).rejects.toThrow(/ตั้งชื่อ/)
  })

  it('ตั้งรูปโปรไฟล์ของผู้ใช้ได้', async () => {
    await api.login({ username: 'somchai', password: 'somchai123' })
    const user = await api.updateProfile({ avatarUrl: PNG })
    expect(user.avatarUrl).toBe(PNG)
    expect((await api.me())?.avatarUrl).toBe(PNG)
  })
})

describe('ไม่มีการยื่นภาษีอัตโนมัติ', () => {
  it('สถานะไม่เลื่อนเองตามเวลา และเปลี่ยนได้เมื่อผู้ใช้อัปเดตเท่านั้น', async () => {
    await api.login({ username: 'nattaya', password: 'nattaya123' })
    const created = await api.createFiling({
      taxYear: '2566',
      formType: 'ภ.ง.ด.91',
      grossIncome: 1,
      netIncome: 0,
      tax: 0,
      withholdingTax: 0,
      balance: 0,
      snapshot: {},
    })
    // ทำให้ดูเหมือนบันทึกไว้นานแล้ว — เดิมระบบจะเลื่อนเป็น completed เอง
    const db = JSON.parse(localStorage.getItem('taxflow_db_v1')!)
    db.filings.find((f: { id: string }) => f.id === created.id).submittedAt = '2020-01-01T00:00:00.000Z'
    localStorage.setItem('taxflow_db_v1', JSON.stringify(db))

    expect((await api.filing(created.reference)).status).toBe('submitted')
    const moved = await api.updateFilingStatus(created.reference, 'received')
    expect(moved.status).toBe('received')
    expect((await api.filing(created.reference)).status).toBe('received')
  })
})

describe('เลือกสีเว็บ', () => {
  it('มีสีพื้นและสีไล่โทนให้เลือก กดแล้วเปลี่ยนทั้งโหมดและสี และจำค่าไว้', async () => {
    const { mount } = await import('@vue/test-utils')
    const ThemePicker = (await import('../components/ThemePicker.vue')).default
    const wrapper = mount(ThemePicker, { attachTo: document.body })
    await wrapper.find('.palette-toggle').trigger('click')
    const options = wrapper.findAll('.swatch-option')
    const labels = options.map((o) => o.text())
    for (const name of ['ขาว', 'ดำ', 'ชมพู', 'ฟ้า', 'เขียว', 'ม่วง', 'เหลือง', 'ดำชมพู']) {
      expect(labels).toContain(name)
    }

    const root = document.documentElement
    const blackPink = options.find((o) => o.text() === 'ดำชมพู')!
    await blackPink.trigger('click')
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-palette')).toBe('sakura')
    expect(root.getAttribute('data-gradient')).toBe('black-pink')
    expect(localStorage.getItem('taxflow_look')).toBe('black-pink')
    expect(blackPink.attributes('aria-checked')).toBe('true')

    // สีพื้นเรียบต้องเอาไล่โทนออก
    await options.find((o) => o.text() === 'ขาว')!.trigger('click')
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-palette')).toBe('mono')
    expect(root.hasAttribute('data-gradient')).toBe(false)
    wrapper.unmount()
  })
})

describe('ลิงก์มาตราในช่องกรอกเงินได้', () => {
  it('40(1) คลิกแล้วเปิดตัวบทของกรมสรรพากรในแท็บใหม่ และเลื่อนไปที่ข้อนั้น', async () => {
    const { mount } = await import('@vue/test-utils')
    const MoneyField = (await import('../components/MoneyField.vue')).default
    const { revenueCodeUrl } = await import('../data/taxLaw')
    const wrapper = mount(MoneyField, {
      props: { label: 'เงินเดือนและค่าจ้าง', law: '40(1)', lawUrl: revenueCodeUrl('40(1)') },
    })
    const link = wrapper.find('a.law-link')
    expect(link.text()).toBe('40(1)')
    expect(link.attributes('target')).toBe('_blank')
    const href = link.attributes('href')!
    expect(href.startsWith('https://www.rd.go.th/5937.html#:~:text=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('เงินได้เนื่องจากการจ้างแรงงาน')
    // ป้ายกำกับยังผูกกับช่องกรอก คลิกชื่อช่องแล้วโฟกัสช่องกรอกได้
    expect(wrapper.find('label').attributes('for')).toBe(wrapper.find('input').attributes('id'))
    expect(revenueCodeUrl('ไม่มี')).toBe('https://www.rd.go.th/5937.html')
  })
})

describe('แถบโหลดด้านบน', () => {
  it('ขึ้นสถานะกำลังโหลดระหว่างรอ API และกลับเป็นปกติเมื่อเสร็จ', async () => {
    const { isBusy } = await import('../services/activity')
    expect(isBusy.value).toBe(false)
    const request = api.login({ username: 'somchai', password: 'somchai123' })
    expect(isBusy.value).toBe(true)
    await request
    expect(isBusy.value).toBe(false)
  })
})

describe('เลือกรูปแบบเว็บ', () => {
  it('สลับปกติ มินิมอล น่ารัก ได้ จำค่าไว้ และใช้คู่กับสีเว็บที่เลือกอยู่', async () => {
    const { mount } = await import('@vue/test-utils')
    const ThemePicker = (await import('../components/ThemePicker.vue')).default
    const wrapper = mount(ThemePicker, { attachTo: document.body })
    await wrapper.find('.palette-toggle').trigger('click')
    const root = document.documentElement
    const styles = wrapper.findAll('.style-option')
    expect(styles.map((s) => s.find('strong').text())).toEqual(['ปกติ', 'มินิมอล', 'น่ารัก'])

    await wrapper.findAll('.swatch-option').find((o) => o.text() === 'ชมพู')!.trigger('click')
    await styles[2]!.trigger('click')
    expect(root.getAttribute('data-style')).toBe('cute')
    expect(root.getAttribute('data-palette')).toBe('sakura')
    expect(localStorage.getItem('taxflow_style')).toBe('cute')
    expect(root.style.getPropertyValue('--mascot')).toContain('data:image/svg+xml')
    expect(wrapper.find('.style-mascot svg').exists()).toBe(true)

    await styles[1]!.trigger('click')
    expect(root.getAttribute('data-style')).toBe('minimal')
    expect(styles[1]!.attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })
})

describe('ตัวการ์ตูนของธีมน่ารัก', () => {
  it('มี 6 ตัว ทุกตัวเป็น SVG ที่อ่านได้ และมีคำพูดกับลายพื้นหลังของตัวเอง', async () => {
    const { MASCOTS } = await import('../data/mascot')
    expect(MASCOTS.length).toBe(6)
    for (const m of MASCOTS) {
      const doc = new DOMParser().parseFromString(m.svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), m.label).toBeNull()
      expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 120 120')
      expect(m.greeting && m.notFound).toBeTruthy()
      expect(m.pattern.startsWith('url("data:image/svg+xml,')).toBe(true)
    }
    expect(new Set(MASCOTS.map((m) => m.pattern)).size).toBe(6)
  })

  it('เลือกตัวการ์ตูนแล้วเปิดธีมน่ารัก เปลี่ยนรูปและลายพื้นหลัง และจำค่าไว้', async () => {
    const { mount } = await import('@vue/test-utils')
    const ThemePicker = (await import('../components/ThemePicker.vue')).default
    const wrapper = mount(ThemePicker, { attachTo: document.body })
    await wrapper.find('.palette-toggle').trigger('click')
    await wrapper.findAll('.style-option')[2]!.trigger('click')
    const options = wrapper.findAll('.mascot-option')
    expect(options.length).toBe(6)

    const root = document.documentElement
    const before = root.style.getPropertyValue('--mascot')
    await options.find((o) => o.text().includes('น้องเหมียว'))!.trigger('click')
    expect(root.getAttribute('data-style')).toBe('cute')
    expect(root.getAttribute('data-mascot')).toBe('cat')
    expect(localStorage.getItem('taxflow_mascot')).toBe('cat')
    expect(root.style.getPropertyValue('--mascot')).not.toBe(before)
    expect(root.style.getPropertyValue('--cute-pattern')).toContain('data:image/svg+xml')

    // แถวเลือกตัวการ์ตูนแสดงเฉพาะตอนใช้ธีมน่ารัก
    await wrapper.findAll('.style-option')[0]!.trigger('click')
    expect(wrapper.find('.mascot-grid').exists()).toBe(false)
    wrapper.unmount()
  })

  it('กล่องคำพูดใช้ประโยคของตัวการ์ตูนที่เลือกอยู่', async () => {
    const { mount } = await import('@vue/test-utils')
    const Mascot = (await import('../components/Mascot.vue')).default
    const { findMascot } = await import('../data/mascot')
    const { createPinia } = await import('pinia')
    const wrapper = mount(Mascot, { props: { line: 'greeting' }, global: { plugins: [createPinia()] } })
    expect(wrapper.find('.mascot-bubble').text()).toBe(findMascot('cat').greeting)
    wrapper.unmount()
  })
})
