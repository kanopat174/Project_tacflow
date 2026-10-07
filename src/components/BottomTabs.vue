<script setup lang="ts">
/**
 * แถบล่างสำหรับมือถือ — วางสิ่งที่ใช้บ่อยที่สุดไว้ในระยะนิ้วโป้ง
 * ปุ่มกลางคือบันทึกรายการ (สิ่งที่ทำบ่อยที่สุด) ปุ่มขวาสุดเปิดเมนูทั้งหมด
 */
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { isActive, type NavLink } from '@/data/memberNav'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()

const LEFT: NavLink[] = [
  { label: 'หน้าหลัก', to: '/dashboard', icon: 'home' },
  { label: 'สมุด', to: '/workspaces', icon: 'wallet', match: ['/workspace/'] },
]
const RIGHT: NavLink[] = [{ label: 'ภาษี', to: '/filing', icon: 'file', match: ['/status/', '/calculator', '/deductions', '/documents', '/history'] }]
</script>

<template>
  <nav class="bottom-tabs no-print" aria-label="เมนูลัด">
    <RouterLink
      v-for="link in LEFT"
      :key="link.to"
      :to="link.to"
      class="tab-btn"
      :class="{ active: isActive(link, route.path) }"
      :aria-current="isActive(link, route.path) ? 'page' : undefined"
    >
      <AppIcon :name="link.icon" :size="22" />
      <span>{{ link.label }}</span>
    </RouterLink>

    <button class="tab-add" type="button" aria-label="บันทึกรายการ" @click="ui.openQuickAdd()">
      <AppIcon name="plus" :size="26" />
    </button>

    <RouterLink
      v-for="link in RIGHT"
      :key="link.to"
      :to="link.to"
      class="tab-btn"
      :class="{ active: isActive(link, route.path) }"
      :aria-current="isActive(link, route.path) ? 'page' : undefined"
    >
      <AppIcon :name="link.icon" :size="22" />
      <span>{{ link.label }}</span>
    </RouterLink>

    <button class="tab-btn" type="button" :class="{ active: ui.navOpen }" aria-label="เมนูทั้งหมด" @click="ui.navOpen = true">
      <AppIcon name="menu" :size="22" />
      <span>เมนู</span>
    </button>
  </nav>
</template>
