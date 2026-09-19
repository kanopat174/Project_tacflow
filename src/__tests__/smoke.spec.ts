import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import routerReal, { authGuard } from '../router'
import { api } from '../services/api'
import { fileStore } from '../services/fileStore'
import { useFilingStore } from '../stores/filing'
import { useLedgerStore } from '../stores/ledger'
import { useAuthStore } from '../stores/auth'

// jsdom ในชุดนี้ไม่ให้ localStorage มา — ใส่ตัวจำลองให้ก่อน (เบราว์เซอร์จริงมีอยู่แล้ว)
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

const routes = routerReal.options.routes

describe('ทุกหน้าเรนเดอร์ได้จริง', () => {
  it('เดินครบทุก route โดยไม่มี error หรือ warning จาก Vue', async () => {
    const errors: unknown[] = []
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => errors.push(a))

    await api.login({ username: 'somchai', password: 'somchai123' })

    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()

    const paths = [
      '/', '/calculator', '/calculator/personal', '/calculator/corporate',
      '/calculator/dividend', '/calculator/capital-gains',
      '/calculator/vat', '/calculator/withholding',
      '/deductions', '/filing', '/documents',
      '/history', '/status/TF-2567-0001', '/profile',
      '/workspaces', '/workspace/w_seed_personal',
      '/workspace/w_seed_personal/entries', '/workspace/w_seed_personal/evidence',
      '/workspace/w_seed_personal/goals',
      '/nope-404',
    ]

    for (const path of paths) {
      await router.push(path)
      await flushPromises()
      expect(wrapper.html().length, `${path} rendered nothing`).toBeGreaterThan(200)
    }

    errSpy.mockRestore()
    warnSpy.mockRestore()
    expect(errors, `console output: ${JSON.stringify(errors).slice(0, 2000)}`).toEqual([])
  })
})

describe('เส้นทางยื่นแบบภาษีตั้งแต่กรอกจนบันทึกสำเร็จ', () => {
  it('กรอกครบ 4 ขั้นตอนแล้วยื่นได้ และแบบที่ยื่นไปโผล่ในประวัติ', async () => {
    setActivePinia(createPinia())
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const filing = useFilingStore()
    filing.resetForm()
    filing.taxpayer.taxYear = '2568'
    filing.taxpayer.fullName = 'ณัฐธยาน์ ศรีสุข'
    filing.taxpayer.citizenId = '3456789012345'
    filing.taxpayer.email = 'nattaya@example.com'
    filing.income.salary = 600_000
    filing.deductions.socialSecurity = 9_000
    filing.withholdingTax = 25_000

    // ขั้นตอนที่ 1 และ 2 ต้องผ่านการตรวจก่อนถึงจะเดินหน้าต่อได้
    expect(filing.canLeaveStep(1)).toBe(true)
    expect(filing.canLeaveStep(2)).toBe(true)
    expect(filing.result.tax).toBe(20_600)
    expect(filing.result.balance).toBe(-4_400)

    // ยังไม่ติ๊กยอมรับ = ยื่นไม่ได้
    expect(filing.canSubmit).toBe(false)
    filing.accepted = true
    expect(filing.canSubmit).toBe(true)

    const created = await filing.submit()
    expect(created.reference).toMatch(/^TF-2568-\d{4}$/)
    expect(created.balance).toBe(-4_400)

    const history = await api.filings()
    expect(history.some((f) => f.reference === created.reference)).toBe(true)

    // ปีภาษีเดียวยื่นซ้ำไม่ได้
    await expect(filing.submit()).rejects.toThrow(/ยื่นแบบภาษีของปี 2568 ไปแล้ว/)
  })
})


describe('เอกสารสำหรับบันทึกเป็น PDF', () => {
  it('ทุกหมวดเครื่องคำนวณแนบเอกสารพิมพ์ไว้ใต้ body พร้อมยอดสรุป', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()

    const expected: Record<string, string> = {
      '/calculator/personal': 'ใบสรุปการคำนวณภาษีเงินได้บุคคลธรรมดา',
      '/calculator/corporate': 'ใบสรุปการคำนวณภาษีเงินได้นิติบุคคล',
      '/calculator/dividend': 'ใบสรุปการคำนวณภาษีเงินปันผลและดอกเบี้ย',
      '/calculator/capital-gains': 'ใบสรุปการคำนวณภาษีจากกำไรการขายหุ้น',
      '/calculator/vat': 'ใบสรุปภาษีมูลค่าเพิ่มประจำเดือน',
      '/calculator/withholding': 'ใบสรุปการคำนวณภาษีหัก ณ ที่จ่าย',
    }

    for (const [path, title] of Object.entries(expected)) {
      await router.push(path)
      await flushPromises()

      // เอกสารถูก teleport ออกไปนอก wrapper จึงต้องหาจาก document โดยตรง
      const doc = document.querySelector('body > .tax-document')
      expect(doc, `${path} ไม่มีเอกสารสำหรับพิมพ์`).not.toBeNull()
      expect(doc?.textContent).toContain(title)
      expect(doc?.textContent).toContain('TaxFlow')
      // ต้องมีหัวข้อสรุปและตัวเลขสกุลบาทอย่างน้อยหนึ่งจุด
      expect(doc?.querySelector('.doc-headline strong')?.textContent ?? '').toMatch(/฿/)
      expect(doc?.querySelectorAll('.doc-section').length ?? 0).toBeGreaterThan(0)
    }

    // ใบยืนยันการยื่นแบบก็ออกเอกสารได้เช่นกัน
    // หน้านี้ดึงข้อมูลแบบ async จึงต้องรอจนเอกสารถูกเรนเดอร์จริง
    await api.login({ username: 'somchai', password: 'somchai123' })
    await router.push('/status/TF-2567-0001')
    const confirmDoc = await vi.waitUntil(
      () => document.querySelector('body > .tax-document'),
      { timeout: 3000, interval: 30 },
    )
    expect(confirmDoc.textContent).toContain('ใบยืนยันการยื่นแบบแสดงรายการภาษี')
    expect(confirmDoc.textContent).toContain('TF-2567-0001')

    wrapper.unmount()
  })
})

describe('ธีมและการเข้าถึง', () => {
  it('สลับธีมมืด/สว่างได้ และจำค่าที่เลือกไว้', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await flushPromises()

    const toggle = wrapper.find('.theme-toggle')
    expect(toggle.exists()).toBe(true)

    const before = document.documentElement.getAttribute('data-theme')
    await toggle.trigger('click')
    const after = document.documentElement.getAttribute('data-theme')

    expect(after).not.toBe(before)
    expect(['light', 'dark']).toContain(after)
    expect(localStorage.getItem('taxflow_theme')).toBe(after)

    // สลับกลับได้
    await toggle.trigger('click')
    expect(document.documentElement.getAttribute('data-theme')).toBe(before)

    wrapper.unmount()
  })

  it('มีลิงก์ข้ามไปเนื้อหาหลัก และทุกหน้ามี landmark ปลายทางรออยู่', async () => {
    setActivePinia(createPinia())
    await api.login({ username: 'somchai', password: 'somchai123' })
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()

    const skip = wrapper.find('.skip-link')
    expect(skip.attributes('href')).toBe('#main-content')

    for (const path of ['/', '/calculator/personal', '/deductions', '/filing', '/history']) {
      await router.push(path)
      await flushPromises()
      const main = wrapper.find('main#main-content')
      expect(main.exists(), `${path} ไม่มี landmark #main-content`).toBe(true)
      // ต้องโฟกัสได้ ไม่งั้นกดลิงก์ข้ามแล้วโฟกัสไม่ขยับ
      expect(main.attributes('tabindex')).toBe('-1')
    }

    wrapper.unmount()
  })

  it('ยอดสรุปที่เปลี่ยนแบบเรียลไทม์ถูกประกาศให้โปรแกรมอ่านหน้าจอ', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await router.push('/calculator/personal')
    await flushPromises()

    const live = wrapper.find('.headline-amount')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.attributes('aria-atomic')).toBe('true')

    wrapper.unmount()
  })
})

describe('หน้าเข้าสู่ระบบ', () => {
  it('ล็อกอินผิดแล้วขึ้นกล่องแจ้งเตือนที่โปรแกรมอ่านหน้าจอประกาศได้', async () => {
    setActivePinia(createPinia())
    await api.logout()

    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await router.push('/login')
    await flushPromises()

    await wrapper.find('#li-username').setValue('somchai')
    await wrapper.find('#li-password').setValue('wrong-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.find('.form-error')
    expect(alert.exists(), 'ไม่มีกล่องแจ้งเตือนตอนล็อกอินไม่ผ่าน').toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('ไม่ถูกต้อง')
    // ต้องไม่ใช้คลาสเดิมที่สไตล์ไม่ติดเพราะผูกกับ .field
    expect(wrapper.find('form > p.error').exists()).toBe(false)

    wrapper.unmount()
  })

  it('ล็อกอินถูกแล้วพาไปหน้ายื่นแบบ', async () => {
    setActivePinia(createPinia())
    await api.logout()

    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await router.push('/login')
    await flushPromises()

    await wrapper.find('#li-username').setValue('somchai')
    await wrapper.find('#li-password').setValue('somchai123')
    await wrapper.find('form').trigger('submit')

    // ล็อกอินสำเร็จต้องรอ latency จำลองของชั้น API ก่อน flushPromises ไม่พอเพราะเป็น setTimeout
    await vi.waitUntil(() => router.currentRoute.value.path === '/filing', {
      timeout: 3000,
      interval: 30,
    })
    await flushPromises()

    expect(wrapper.find('.form-error').exists()).toBe(false)

    wrapper.unmount()
  })

  it('ปุ่มบัญชีตัวอย่างเติมข้อมูลให้ครบทั้งสองช่อง', async () => {
    setActivePinia(createPinia())
    await api.logout()

    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await router.push('/login')
    await flushPromises()

    await wrapper.find('.demo-accounts button').trigger('click')
    await flushPromises()

    expect((wrapper.find('#li-username').element as HTMLInputElement).value).toBe('somchai')
    expect((wrapper.find('#li-password').element as HTMLInputElement).value).toBe('somchai123')

    wrapper.unmount()
  })
})


describe('สมุดบัญชี', () => {
  it('สร้างสมุด บันทึกรายการ แล้วได้ผลวิเคราะห์ที่ถูกต้อง', async () => {
    setActivePinia(createPinia())
    await api.logout()
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const ledger = useLedgerStore()
    const created = await ledger.createWorkspace({
      name: 'ทดสอบฟรีแลนซ์',
      mode: 'freelancer',
      capital: 100_000,
    })
    await ledger.open(created.id)

    expect(ledger.summary.entryCount).toBe(0)

    // สองเดือน รายรับเดือนละ 15,000 รายจ่ายเดือนละ 14,000 — เคสที่ผู้ใช้ยกมา
    for (const month of ['2026-07', '2026-08']) {
      await ledger.addEntry({
        date: `${month}-01`,
        type: 'income',
        categoryKey: 'projectFee',
        amount: 15_000,
        note: '',
        withholdingTax: 450,
      })
      await ledger.addEntry({
        date: `${month}-10`,
        type: 'expense',
        categoryKey: 'software',
        amount: 14_000,
        note: '',
      })
    }

    expect(ledger.averages.months).toBe(2)
    expect(ledger.averages.income).toBe(15_000)
    expect(ledger.averages.expense).toBe(14_000)

    // ความเสี่ยง: เหลือเก็บ 1,000 จาก 15,000 = 6.7% ต่ำกว่าเป้าฟรีแลนซ์ 30%
    expect(ledger.risk.level).toBe('risky')
    expect(ledger.risk.surplus).toBe(1_000)
    expect(ledger.risk.sustainableExpense).toBe(10_500)
    expect(ledger.risk.expenseToCut).toBe(3_500)

    // เงินทุน: ทุน 100,000 + คงเหลือสะสม 2,000 เผาเดือนละ 1,000 ที่เหลือ... รายรับ > 0 จึง burn = 14,000 − 15,000 < 0
    expect(ledger.runway.level).toBe('positive')

    // ภาษีหัก ณ ที่จ่ายสะสม ส่งต่อไปเครื่องคำนวณภาษีได้
    expect(ledger.summary.withholdingTax).toBe(900)

    await ledger.removeWorkspace(created.id)
    expect(ledger.workspaces.some((w) => w.id === created.id)).toBe(false)
  })

  it('ลบสมุดแล้วรายการและเป้าหมายที่ผูกอยู่ต้องหายตามไปด้วย', async () => {
    setActivePinia(createPinia())
    await api.logout()
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const ledger = useLedgerStore()
    const ws = await ledger.createWorkspace({ name: 'ชั่วคราว', mode: 'personal', capital: 0 })
    await ledger.open(ws.id)
    await ledger.addEntry({
      date: '2026-08-01',
      type: 'expense',
      categoryKey: 'food',
      amount: 500,
      note: '',
    })
    await ledger.addGoal({ name: 'เก็บเงิน', kind: 'save', target: 10_000, deadline: '' })

    await ledger.removeWorkspace(ws.id)

    // สร้างสมุดใหม่ที่ id ต่างกัน แล้วยืนยันว่าไม่มีข้อมูลเก่าค้าง
    const fresh = await ledger.createWorkspace({ name: 'ใหม่', mode: 'personal', capital: 0 })
    await ledger.open(fresh.id)
    expect(ledger.entries).toHaveLength(0)
    expect(ledger.goals).toHaveLength(0)
  })

  it('แต่ละโหมดมีหมวดของตัวเอง ไม่ปนกัน', async () => {
    setActivePinia(createPinia())
    await api.logout()
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const ledger = useLedgerStore()
    const trader = await ledger.createWorkspace({ name: 'เทรด', mode: 'trader', capital: 50_000 })
    await ledger.open(trader.id)

    const keys = ledger.definition.categories.map((c) => c.key)
    expect(keys).toContain('tradeProfit')
    expect(keys).not.toContain('housing')
    expect(ledger.definition.features.tradingStats).toBe(true)

    await ledger.addEntry({ date: '2026-08-01', type: 'income', categoryKey: 'tradeProfit', amount: 6_000, note: '' })
    await ledger.addEntry({ date: '2026-08-02', type: 'expense', categoryKey: 'tradeLoss', amount: 2_000, note: '' })
    await ledger.addEntry({ date: '2026-08-03', type: 'expense', categoryKey: 'commission', amount: 300, note: '' })

    expect(ledger.trading.trades).toBe(2)
    expect(ledger.trading.winRate).toBeCloseTo(0.5, 6)
    expect(ledger.trading.profitFactor).toBeCloseTo(3, 6)

    await ledger.removeWorkspace(trader.id)
  })
})

describe('แถบหัวเว็บ', () => {
  it('ปุ่มออกจากระบบมีป้ายที่ซ่อนได้และยังมีชื่อให้โปรแกรมอ่านหน้าจอ', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })

    // router ในเทสต์สร้างจาก routes ของจริงแต่ไม่มี beforeEach ติดมาด้วย
    // จึงต้องกู้ session เองบน pinia ตัวเดียวกับที่คอมโพเนนต์ใช้
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await router.isReady()
    await useAuthStore().restore()
    await flushPromises()

    const logout = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'ออกจากระบบ')
    expect(logout, 'ไม่พบปุ่มออกจากระบบ').toBeTruthy()
    // ป้ายอยู่ใน span แยก เพื่อให้ CSS ซ่อนตอนจอแคบได้โดยไม่เสียชื่อปุ่ม
    expect(logout!.find('.logout-label').exists()).toBe(true)

    wrapper.unmount()
  })

  it('เมนูหลักไม่มีป้ายที่ยาวจนดันรายการอื่นตกขอบ', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await flushPromises()

    const labels = wrapper.findAll('.site-nav a').map((a) => a.text())
    expect(labels).toEqual([
      'หน้าแรก',
      'สมุดบัญชี',
      'คำนวณภาษี',
      'ค่าลดหย่อน',
      'ยื่นแบบภาษี',
      'เอกสาร',
      'ประวัติ',
    ])
    // เมนูยาวขึ้นเมื่อไรต้องกลับมาคิดเรื่องความกว้างของหัวเว็บใหม่
    expect(labels.every((l) => l.length <= 11)).toBe(true)

    wrapper.unmount()
  })
})

/** router ที่ผูกการ์ดของจริงไว้ด้วย เพื่อทดสอบการเด้งหน้าตามสถานะล็อกอิน */
async function guardedApp() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await router.isReady()
  await flushPromises()
  return { wrapper, router }
}

describe('หน้าแรกกับแดชบอร์ด', () => {
  it('ผู้เยี่ยมชมเห็นหน้าแนะนำเว็บที่ /', async () => {
    await api.logout()
    const { wrapper, router } = await guardedApp()

    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.text()).toContain('ยื่นภาษี')

    wrapper.unmount()
  })

  it('สมาชิกที่ล็อกอินแล้วถูกพาออกจากหน้าแนะนำไปแดชบอร์ด', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dashboard')

    wrapper.unmount()
  })

  it('เมนูแรกสลับระหว่างหน้าแรกกับแดชบอร์ดตามสถานะ', async () => {
    await api.logout()
    const guest = await guardedApp()
    expect(guest.wrapper.findAll('.site-nav a')[0]?.text()).toBe('หน้าแรก')
    guest.wrapper.unmount()

    await api.login({ username: 'somchai', password: 'somchai123' })
    const member = await guardedApp()
    expect(member.wrapper.findAll('.site-nav a')[0]?.text()).toBe('แดชบอร์ด')
    member.wrapper.unmount()
  })

  it('แดชบอร์ดสรุปพอร์ตจากสมุดที่มีอยู่', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    await router.push('/dashboard')
    await vi.waitUntil(() => wrapper.text().includes('เงินทุนรวมทุกสมุด'), {
      timeout: 3000,
      interval: 30,
    })

    // สมุดตัวอย่างมีทุน 100,000 และรายรับ 30,000 รายจ่าย 27,000 จากสองเดือน
    expect(wrapper.text()).toContain('รายรับสะสม')
    expect(wrapper.text()).toContain('สมุดของฉัน')
    expect(wrapper.find('.donut').exists()).toBe(true)

    wrapper.unmount()
  })
})

describe('ฟีเจอร์ที่ต้องมีบัญชี', () => {
  const gatedPaths = ['/filing', '/documents', '/history', '/workspaces']

  it('ผู้เยี่ยมชมเปิดดูได้ทุกหน้า ไม่ถูกเด้งออก', async () => {
    await api.logout()
    const { wrapper, router } = await guardedApp()

    for (const path of gatedPaths) {
      await router.push(path)
      await flushPromises()
      expect(router.currentRoute.value.path, `${path} ถูกเด้งออก`).toBe(path)
      expect(wrapper.find('.locked-feature').exists(), `${path} ไม่มีแผงบอกว่าต้องสมัคร`).toBe(true)
    }

    wrapper.unmount()
  })

  it('ผู้เยี่ยมชมเห็นปุ่มยื่นแบบเป็นปุ่มเข้าสู่ระบบแทน', async () => {
    await api.logout()
    const { wrapper, router } = await guardedApp()

    await router.push('/filing')
    await flushPromises()

    // ปุ่มยื่นอยู่ในขั้นตอนที่ 4 เท่านั้น ต้องเดินไปให้ถึงก่อน
    useFilingStore().currentStep = 4
    await flushPromises()

    expect(wrapper.text()).toContain('เข้าสู่ระบบเพื่อยื่นแบบ')
    expect(wrapper.text()).not.toContain('ยืนยันและยื่นแบบภาษี')

    wrapper.unmount()
  })

  it('เครื่องคำนวณกับคู่มือลดหย่อนใช้ได้ฟรี ไม่มีแผงล็อก', async () => {
    await api.logout()
    const { wrapper, router } = await guardedApp()

    for (const path of ['/calculator/personal', '/calculator/vat', '/deductions']) {
      await router.push(path)
      await flushPromises()
      expect(wrapper.find('.locked-feature').exists(), `${path} ไม่ควรถูกล็อก`).toBe(false)
    }

    wrapper.unmount()
  })

  it('สมาชิกไม่เห็นแผงล็อกอีกต่อไป', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    for (const path of gatedPaths) {
      await router.push(path)
      await flushPromises()
      expect(wrapper.find('.locked-feature').exists(), `${path} ยังล็อกทั้งที่ล็อกอินแล้ว`).toBe(false)
    }

    wrapper.unmount()
  })

  it('โปรไฟล์ยังต้องล็อกอินจริง ๆ เพราะเป็นข้อมูลบัญชี', async () => {
    await api.logout()
    const { wrapper, router } = await guardedApp()

    await router.push('/profile')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')

    wrapper.unmount()
  })
})


describe('หลักฐานประกอบรายการ', () => {
  it('แนบหลักฐานแล้วจัดกลุ่มตามวันที่และหมวดให้ถูกต้อง', async () => {
    setActivePinia(createPinia())
    await api.logout()
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const ledger = useLedgerStore()
    const ws = await ledger.createWorkspace({ name: 'ทดสอบหลักฐาน', mode: 'personal', capital: 0 })
    await ledger.open(ws.id)

    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const base = { entryId: null, name: 'f.jpg', size: 1, mimeType: 'image/jpeg', note: '' }

    // IndexedDB ไม่มีใน jsdom ชั้น API จึงต้องปฏิเสธอย่างชัดเจน ไม่ใช่บันทึกรายการที่เปิดไม่ได้
    const available = await fileStore.available()
    if (!available) {
      await expect(
        ledger.addEvidence(
          { ...base, date: '2026-08-02', direction: 'income', kind: 'receipt' },
          blob,
        ),
      ).rejects.toThrow(/เก็บไฟล์แนบไม่ได้/)
      expect(ledger.evidence).toHaveLength(0)
      await ledger.removeWorkspace(ws.id)
      return
    }

    for (const [direction, kind] of [
      ['income', 'receipt'],
      ['income', 'document'],
      ['expense', 'receipt'],
      ['expense', 'document'],
    ] as const) {
      await ledger.addEvidence({ ...base, date: '2026-08-02', direction, kind }, blob)
    }

    const [day] = ledger.evidenceByDate
    expect(day?.date).toBe('2026-08-02')
    expect(day?.directions.map((d) => d.label)).toEqual([
      'หลักฐานการรับเงิน',
      'หลักฐานการจ่ายเงิน',
    ])
    expect(day?.directions[0]?.kinds.map((k) => k.label)).toEqual(['ใบเสร็จ', 'เอกสาร'])

    await ledger.removeWorkspace(ws.id)
  })

  it('ลบรายการแล้วหลักฐานที่ผูกอยู่ต้องหายตามไปด้วย', async () => {
    setActivePinia(createPinia())
    await api.logout()
    await api.login({ username: 'nattaya', password: 'nattaya123' })

    const ledger = useLedgerStore()
    const ws = await ledger.createWorkspace({ name: 'ลบรายการ', mode: 'personal', capital: 0 })
    await ledger.open(ws.id)
    await ledger.addEntry({
      date: '2026-08-02',
      type: 'expense',
      categoryKey: 'food',
      amount: 100,
      note: '',
    })

    const entryId = ledger.entries[0]!.id
    if (await fileStore.available()) {
      await ledger.addEvidence(
        {
          entryId,
          date: '2026-08-02',
          direction: 'expense',
          kind: 'receipt',
          name: 'r.jpg',
          size: 1,
          mimeType: 'image/jpeg',
          note: '',
        },
        new Blob(['x'], { type: 'image/jpeg' }),
      )
      expect(ledger.evidenceCounts.get(entryId)).toBe(1)
    }

    await ledger.removeEntry(entryId)
    expect(ledger.evidence.filter((e) => e.entryId === entryId)).toHaveLength(0)

    await ledger.removeWorkspace(ws.id)
  })
})


describe('ต้องยืนยันก่อนอัปโหลดไฟล์', () => {
  it('เลือกไฟล์ในหน้าหลักฐานแล้วยังไม่บันทึกจนกว่าจะกดยืนยัน', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    await router.push('/workspace/w_seed_personal/evidence')
    await vi.waitUntil(() => wrapper.find('input[type="file"]').exists(), {
      timeout: 3000,
      interval: 30,
    })

    const ledger = useLedgerStore()
    const before = ledger.evidence.length

    const file = new File(['x'], 'slip.png', { type: 'image/png' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    // ไฟล์ต้องขึ้นในรายการที่รอยืนยัน แต่ยังไม่ถูกบันทึก
    expect(wrapper.find('.staged').exists(), 'ไม่มีรายการไฟล์ที่รอยืนยัน').toBe(true)
    expect(wrapper.text()).toContain('slip.png')
    expect(wrapper.text()).toContain('ยังไม่ถูกบันทึก')
    expect(ledger.evidence.length, 'อัปโหลดทันทีทั้งที่ยังไม่ยืนยัน').toBe(before)

    // กล่องยืนยันต้องยังไม่เปิดเอง
    expect(wrapper.find('.modal[aria-labelledby="upload-confirm-title"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('กดปุ่มอัปโหลดแล้วเจอกล่องยืนยันพร้อมคำเตือน ไม่ใช่บันทึกเลย', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    await router.push('/workspace/w_seed_personal/evidence')
    await vi.waitUntil(() => wrapper.find('input[type="file"]').exists(), {
      timeout: 3000,
      interval: 30,
    })

    const ledger = useLedgerStore()
    const before = ledger.evidence.length

    const file = new File(['x'], 'receipt.png', { type: 'image/png' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    const uploadButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('ตรวจสอบและอัปโหลด'))
    expect(uploadButton, 'ไม่พบปุ่มตรวจสอบและอัปโหลด').toBeTruthy()

    await uploadButton!.trigger('click')
    await flushPromises()

    const modal = wrapper.find('.modal[aria-labelledby="upload-confirm-title"]')
    expect(modal.exists(), 'กดแล้วไม่มีกล่องยืนยัน').toBe(true)
    expect(modal.text()).toContain('ตรวจสอบก่อนอัปโหลด')
    expect(modal.text()).toContain('ไฟล์เก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น')
    // ยังไม่บันทึกจนกว่าจะกดยืนยันในกล่อง
    expect(ledger.evidence.length).toBe(before)

    wrapper.unmount()
  })

  it('ปุ่มอัปโหลดกดไม่ได้เมื่อยังไม่ได้เลือกไฟล์', async () => {
    await api.logout()
    await api.login({ username: 'somchai', password: 'somchai123' })
    const { wrapper, router } = await guardedApp()

    await router.push('/workspace/w_seed_personal/evidence')
    await vi.waitUntil(() => wrapper.text().includes('ยังไม่ได้เลือกไฟล์'), {
      timeout: 3000,
      interval: 30,
    })

    const button = wrapper.findAll('button').find((b) => b.text().includes('ยังไม่ได้เลือกไฟล์'))
    expect(button!.attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })
})
