<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import SideNav from '@/components/SideNav.vue'
import TopBar from '@/components/TopBar.vue'
import BottomTabs from '@/components/BottomTabs.vue'
import ToastZone from '@/components/ToastZone.vue'
import TopProgress from '@/components/TopProgress.vue'
import MascotGuide from '@/components/MascotGuide.vue'
import FeatureIntro from '@/components/FeatureIntro.vue'
import QuickAdd from '@/components/QuickAdd.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import AppLock from '@/components/AppLock.vue'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { useLockStore } from '@/stores/lock'
import { QUICK_INTENTS, useUiStore, type QuickIntent } from '@/stores/ui'

// แถบค้นหา Ctrl+K โหลดแยกไฟล์ตอนเปิดครั้งแรก ไม่เพิ่มขนาดหน้าแรกของเว็บ
const CommandPalette = defineAsyncComponent(() => import('@/components/CommandPalette.vue'))
// สแกนสลิปหลายใบโหลดเฉพาะตอนเลือกหรือแชร์สลิปมาหลายใบ
const BulkSlipImport = defineAsyncComponent(() => import('@/components/BulkSlipImport.vue'))

// สร้าง store ของเหรียญรางวัลตั้งแต่เปิดเว็บ ให้คอยตรวจเหรียญใหม่และอารมณ์ของตัวการ์ตูนตลอด
useGameStore()
const auth = useAuthStore()
const ui = useUiStore()
// สร้างก่อนกู้ session เสมอ จะได้รู้ว่าเป็นการเปิดเว็บใหม่ (ต้องใส่ PIN) ไม่ใช่การล็อกอินด้วยรหัสผ่าน
const lock = useLockStore()
lock.start()

function onGlobalKey(event: KeyboardEvent) {
  if (lock.locked) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.paletteOpen = !ui.paletteOpen
  }
}
onMounted(() => document.addEventListener('keydown', onGlobalKey))

// ทางลัดบนหน้าจอโฮม (กดค้างไอคอนแอป) เปิดมาเป็น ?quick=expense|income|slip|voice — เปิดบันทึกด่วนแล้วลบออกจาก URL
const route = useRoute()
const router = useRouter()
watch(
  () => [route.query.quick, auth.isLoggedIn] as const,
  ([quick, loggedIn]) => {
    if (!loggedIn || typeof quick !== 'string' || !QUICK_INTENTS.includes(quick as QuickIntent)) return
    ui.openQuickAdd('', null, quick as QuickIntent)
    const { quick: _drop, ...rest } = route.query
    void router.replace({ query: rest })
  },
)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKey)
  lock.stop()
})

// การกู้ session จาก token ทำใน router guard (`router.beforeEach`) ก่อนวาดหน้าแรกเสมอ
</script>

<template>
  <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
  <TopProgress />

  <!--
    สมาชิก: เมนูด้านข้าง + แถบบน (คอม/ไอแพด) และแถบล่าง (มือถือ) — ใช้งานทั้งวันจึงเน้นหาเมนูเจอเร็ว
    ผู้เยี่ยมชม: หัวเว็บแนวนอนแบบหน้าแนะนำเว็บ
  -->
  <!-- inert ตอนล็อก: กด Tab หรือคีย์ลัดไปโดนเนื้อหาด้านหลังหน้าจอ PIN ไม่ได้ -->
  <div v-if="auth.isLoggedIn" class="app-shell" :inert="lock.locked">
    <SideNav />
    <div class="app-main">
      <TopBar />
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
      <SiteFooter />
    </div>
    <BottomTabs />
  </div>

  <template v-else>
    <SiteHeader />
    <!-- หน้าใหม่ค่อย ๆ ลอยขึ้นแทนหน้าเดิม (ปิดเองเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว) -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <SiteFooter />
  </template>

  <ToastZone />
  <QuickAdd />
  <CommandPalette v-if="ui.paletteOpen" />
  <BulkSlipImport v-if="auth.isLoggedIn && ui.bulkSlipFiles" />
  <MascotGuide />
  <FeatureIntro />
  <CelebrationOverlay />
  <AppLock v-if="auth.isLoggedIn && lock.locked" />
</template>
