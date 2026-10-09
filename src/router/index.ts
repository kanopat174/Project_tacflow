import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { beginActivity, endActivity } from '@/services/activity'

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
        {
          path: 'half-year',
          name: 'calculator-half-year',
          component: () => import('@/views/calculators/HalfYearCalculatorView.vue'),
          meta: { title: 'คำนวณภาษีครึ่งปี ภ.ง.ด.94' },
        },
        {
          path: 'late-payment',
          name: 'calculator-late-payment',
          component: () => import('@/views/calculators/LatePaymentCalculatorView.vue'),
          meta: { title: 'คำนวณเงินเพิ่มและค่าปรับยื่นภาษีล่าช้า' },
        },
        {
          path: 'what-if',
          name: 'calculator-what-if',
          component: () => import('@/views/calculators/WhatIfCalculatorView.vue'),
          meta: { title: 'จำลองสถานการณ์ภาษี' },
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
      path: '/share-target',
      name: 'share-target',
      component: () => import('@/views/ShareTargetView.vue'),
      meta: { title: 'เปิดไฟล์ที่แชร์มา', requiresAuth: true },
    },
    {
      path: '/funds',
      name: 'funds',
      component: () => import('@/views/FundsView.vue'),
      meta: { title: 'กองทุนลดหย่อนของฉัน', requiresAuth: true },
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
          meta: { title: 'เป้าหมายและงบประมาณ' },
        },
      ],
    },
    {
      path: '/filing',
      name: 'filing',
      component: () => import('@/views/FilingView.vue'),
      meta: { title: 'เตรียมแบบภาษี' },
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
      meta: { title: 'ประวัติแบบภาษี' },
    },
    {
      path: '/status/:reference',
      name: 'status',
      component: () => import('@/views/FilingStatusView.vue'),
      meta: { title: 'สรุปแบบภาษี', requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: 'โปรไฟล์ของฉัน', requiresAuth: true },
    },
    {
      path: '/achievements',
      name: 'achievements',
      component: () => import('@/views/AchievementsView.vue'),
      meta: { title: 'เหรียญรางวัล', requiresAuth: true },
    },
    {
      path: '/wrapped',
      name: 'wrapped',
      component: () => import('@/views/WrappedView.vue'),
      meta: { title: 'สรุปปีของฉัน', requiresAuth: true },
    },
    {
      path: '/glossary',
      name: 'glossary',
      component: () => import('@/views/GlossaryView.vue'),
      meta: { title: 'คำศัพท์ภาษี' },
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('@/views/WelcomeView.vue'),
      meta: { title: 'เริ่มต้นใช้งาน', requiresAuth: true },
    },
    {
      path: '/quiz',
      name: 'quiz',
      component: () => import('@/views/QuizView.vue'),
      meta: { title: 'ควิซภาษี 1 นาที' },
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

/*
 * แถบโหลดด้านบนระหว่างเปลี่ยนหน้า (รวมเวลาโหลดไฟล์ของหน้าที่แยก chunk ไว้)
 * ใช้ธงแทนตัวนับ เพราะการเด้งหน้า (redirect) ทำให้ beforeEach ถูกเรียกซ้ำได้ในการนำทางครั้งเดียว
 */
let navigating = false
function finishNavigation() {
  if (!navigating) return
  navigating = false
  endActivity()
}

router.beforeEach(() => {
  if (!navigating) {
    navigating = true
    beginActivity()
  }
})
router.beforeEach(authGuard)
router.onError(finishNavigation)

router.afterEach((to) => {
  finishNavigation()
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} — Jodwise จดไว้` : 'Jodwise จดไว้ — วางแผนภาษีและสมุดบัญชี'
})

export default router
