<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
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
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

// แถบค้นหา Ctrl+K โหลดแยกไฟล์ตอนเปิดครั้งแรก ไม่เพิ่มขนาดหน้าแรกของเว็บ
const CommandPalette = defineAsyncComponent(() => import('@/components/CommandPalette.vue'))

// สร้าง store ของเหรียญรางวัลตั้งแต่เปิดเว็บ ให้คอยตรวจเหรียญใหม่และอารมณ์ของตัวการ์ตูนตลอด
useGameStore()
const auth = useAuthStore()
const ui = useUiStore()

function onGlobalKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.paletteOpen = !ui.paletteOpen
  }
}
onMounted(() => document.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKey))

// การกู้ session จาก token ทำใน router guard (`router.beforeEach`) ก่อนวาดหน้าแรกเสมอ
</script>

<template>
  <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
  <TopProgress />

  <!--
    สมาชิก: เมนูด้านข้าง + แถบบน (คอม/ไอแพด) และแถบล่าง (มือถือ) — ใช้งานทั้งวันจึงเน้นหาเมนูเจอเร็ว
    ผู้เยี่ยมชม: หัวเว็บแนวนอนแบบหน้าแนะนำเว็บ
  -->
  <div v-if="auth.isLoggedIn" class="app-shell">
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
  <MascotGuide />
  <FeatureIntro />
  <CelebrationOverlay />
</template>
