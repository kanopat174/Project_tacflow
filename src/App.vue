<script setup lang="ts">
import { RouterView } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import ToastZone from '@/components/ToastZone.vue'
import TopProgress from '@/components/TopProgress.vue'
import MascotGuide from '@/components/MascotGuide.vue'
import QuickAdd from '@/components/QuickAdd.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import { useGameStore } from '@/stores/game'

// สร้าง store ของเหรียญรางวัลตั้งแต่เปิดเว็บ ให้คอยตรวจเหรียญใหม่และอารมณ์ของตัวการ์ตูนตลอด
useGameStore()

// การกู้ session จาก token ทำใน router guard (`router.beforeEach`) ก่อนวาดหน้าแรกเสมอ
</script>

<template>
  <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
  <TopProgress />
  <SiteHeader />
  <!-- หน้าใหม่ค่อย ๆ ลอยขึ้นแทนหน้าเดิม (ปิดเองเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว) -->
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <SiteFooter />
  <ToastZone />
  <QuickAdd />
  <MascotGuide />
  <CelebrationOverlay />
</template>
