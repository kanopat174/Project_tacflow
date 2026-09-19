import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // เปลี่ยนหน้าแล้วเลื่อนขึ้นบนสุดเสมอ ยกเว้นตอนกดปุ่มย้อนกลับของเบราว์เซอร์
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      // หน้าแรกเป็นหน้าแนะนำเว็บสำหรับคนที่ยังไม่สมัคร สมาชิกไม่ต้องเห็นอีก
      meta: { title: 'ยื่นภาษีออนไลน์ให้จบในที่เดียว', memberRedirect: 'dashboard' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: 'แดชบอร์ด', requiresAuth: true },
    },
    {
      path: '/calculator',
      component: () => import('@/views/CalculatorLayout.vue'),
      children: [
        {
          path: '',
          name: 'calculator',
          component: () => import('@/views/calculators/CalculatorHubView.vue'),
          meta: { title: 'เครื่องคำนวณภาษี' },
        },
        {
          path: 'personal',
          name: 'calculator-personal',
          component: () => import('@/views/calculators/PersonalCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีบุคคลธรรมดา' },
        },
        {
          path: 'corporate',
          name: 'calculator-corporate',
          component: () => import('@/views/calculators/CorporateCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีนิติบุคคล' },
        },
        {
          path: 'dividend',
          name: 'calculator-dividend',
          component: () => import('@/views/calculators/DividendCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีเงินปันผลและดอกเบี้ย' },
        },
        {
          path: 'vat',
          name: 'calculator-vat',
          component: () => import('@/views/calculators/VatCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีมูลค่าเพิ่ม' },
        },
        {
          path: 'withholding',
          name: 'calculator-withholding',
          component: () => import('@/views/calculators/WithholdingCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีหัก ณ ที่จ่าย' },
        },
        {
          path: 'capital-gains',
          name: 'calculator-capital-gains',
          component: () => import('@/views/calculators/CapitalGainsCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีกำไรจากการขายหุ้น' },
        },
      ],
    },
    {
      path: '/deductions',
      name: 'deductions',
      component: () => import('@/views/DeductionsView.vue'),
      meta: { title: 'คู่มือค่าลดหย่อน' },
    },
    {
      path: '/workspaces',
      name: 'workspaces',
      component: () => import('@/views/WorkspacesView.vue'),
      meta: { title: 'สมุดบัญชี' },
    },
    {
      path: '/workspace/:id',
      component: () => import('@/views/WorkspaceLayout.vue'),
      children: [
        {
          path: '',
          name: 'workspace-overview',
          component: () => import('@/views/workspace/WorkspaceOverview.vue'),
          meta: { title: 'ภาพรวมสมุดบัญชี' },
        },
        {
          path: 'entries',
          name: 'workspace-entries',
          component: () => import('@/views/workspace/WorkspaceEntries.vue'),
          meta: { title: 'รายการรายรับรายจ่าย' },
        },
        {
          path: 'evidence',
          name: 'workspace-evidence',
          component: () => import('@/views/workspace/WorkspaceEvidence.vue'),
          meta: { title: 'หลักฐานประกอบรายการ' },
        },
        {
          path: 'goals',
          name: 'workspace-goals',
          component: () => import('@/views/workspace/WorkspaceGoals.vue'),
          meta: { title: 'เป้าหมาย' },
        },
      ],
    },
    {
      path: '/filing',
      name: 'filing',
      component: () => import('@/views/FilingView.vue'),
      meta: { title: 'ยื่นแบบภาษี' },
    },
    {
      path: '/documents',
      name: 'documents',
      component: () => import('@/views/DocumentsView.vue'),
      meta: { title: 'เอกสารแนบ' },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: { title: 'ประวัติการยื่น' },
    },
    {
      path: '/status/:reference',
      name: 'status',
      component: () => import('@/views/FilingStatusView.vue'),
      meta: { title: 'ติดตามสถานะแบบภาษี', requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: 'โปรไฟล์ของฉัน', requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'เข้าสู่ระบบ', guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { title: 'สมัครสมาชิก', guestOnly: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'ไม่พบหน้าที่ต้องการ' },
    },
  ],
})

/**
 * แยกออกมาเป็นฟังก์ชันชื่อ ๆ เพื่อให้เทสต์ผูกเข้ากับ router ของตัวเองได้
 * ถ้าฝังไว้ใน beforeEach ตรง ๆ router ที่สร้างในเทสต์จะไม่มีการ์ดติดไปด้วย
 */
export async function authGuard(to: RouteLocationNormalized) {
  const auth = useAuthStore()
  // ต้องรอกู้ session จาก token ให้เสร็จก่อน ไม่งั้นรีเฟรชหน้าที่ต้องล็อกอินจะถูกเด้งออกทุกครั้ง
  await auth.restore()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  // สมาชิกที่ล็อกอินแล้วไม่ต้องเห็นหน้าแนะนำเว็บอีก พาไปแดชบอร์ดแทน
  if (to.meta.memberRedirect && auth.isLoggedIn) {
    return { name: to.meta.memberRedirect as string }
  }
  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }
  return true
}

router.beforeEach(authGuard)

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} — TaxFlow` : 'TaxFlow — ยื่นภาษีออนไลน์'
})

export default router
