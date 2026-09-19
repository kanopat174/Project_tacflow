<script setup lang="ts">
import { RouterView } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import ToastZone from '@/components/ToastZone.vue'

// การกู้ session จาก token ทำใน router guard (`router.beforeEach`) ก่อนวาดหน้าแรกเสมอ
</script>

<template>
  <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
  <SiteHeader />
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <SiteFooter />
  <ToastZone />
</template>
