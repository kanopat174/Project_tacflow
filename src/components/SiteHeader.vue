<script setup lang="ts">
/**
 * หัวเว็บของผู้เยี่ยมชม (ยังไม่ล็อกอิน) — แบบหน้าแนะนำเว็บ เมนูแนวนอน
 * สมาชิกใช้เมนูด้านข้างใน SideNav.vue แทน
 */
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ThemePicker from './ThemePicker.vue'
import { useUiStore } from '@/stores/ui'
import { useTheme } from '@/composables/useTheme'
import { useFx } from '@/composables/useFx'

const NAV_ITEMS = [
  { label: 'หน้าแรก', to: '/' },
  { label: 'สมุดบัญชี', to: '/workspaces' },
  { label: 'คำนวณภาษี', to: '/calculator' },
  { label: 'ค่าลดหย่อน', to: '/deductions' },
  { label: 'แบบภาษี', to: '/filing' },
  { label: 'เอกสาร', to: '/documents' },
  { label: 'ประวัติ', to: '/history' },
]

const ui = useUiStore()
const route = useRoute()
const menuOpen = ref(false)
const theme = useTheme()
const fx = useFx()

/** สลับธีมพร้อมดาว/พระอาทิตย์เด้งออกจากปุ่ม */
function toggleTheme(event: Event) {
  theme.toggle()
  fx.themeSwitched(theme.resolved.value === 'dark', event.currentTarget as Element)
}
/** กดโลโก้: เด้งเบา ๆ (กด 5 ครั้งติดกันมีของลับ) */
function onBrand(event: Event) {
  fx.logoTap((event.currentTarget as HTMLElement).querySelector<HTMLElement>('.brand-mark'))
}

// ปิดเมนูมือถือทุกครั้งที่เปลี่ยนหน้า ไม่งั้นเมนูจะค้างทับเนื้อหา
watch(() => route.fullPath, () => (menuOpen.value = false))
</script>

<template>
  <header class="site-header">
    <div class="container bar">
      <RouterLink to="/" class="brand" @click="onBrand">
        <span class="brand-mark">T</span>
        <span class="brand-info">
          <strong>TaxFlow</strong>
          <span>Smart Tax Filing</span>
        </span>
      </RouterLink>

      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="เปิดเมนูหลัก"
        @click="menuOpen = !menuOpen"
      >
        <AppIcon :name="menuOpen ? 'close' : 'menu'" :size="22" />
      </button>

      <nav class="site-nav" :class="{ open: menuOpen }" aria-label="เมนูหลัก">
        <RouterLink v-for="item in NAV_ITEMS" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
        <!-- มือถือ: ปุ่มที่ไม่พอที่บนหัวเว็บย้ายมาอยู่ในเมนู (ซ่อนบนจอใหญ่ด้วย CSS) -->
        <div class="nav-extra">
          <button type="button" @click="((menuOpen = false), (ui.paletteOpen = true))">
            <AppIcon name="search" :size="17" />
            ค้นหา
          </button>
          <button type="button" @click="toggleTheme($event)">
            <AppIcon :name="theme.resolved.value === 'dark' ? 'sun' : 'moon'" :size="17" />
            {{ theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด' }}
          </button>
        </div>
      </nav>

      <div class="auth-zone">
        <ThemePicker />
        <button
          class="theme-toggle"
          type="button"
          :aria-label="theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'"
          :title="theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'"
          @click="toggleTheme($event)"
        >
          <AppIcon :name="theme.resolved.value === 'dark' ? 'sun' : 'moon'" :size="18" />
        </button>
        <button
          class="theme-toggle search-toggle"
          type="button"
          aria-label="ค้นหา (Ctrl+K)"
          title="ค้นหา (Ctrl+K)"
          @click="ui.paletteOpen = true"
        >
          <AppIcon name="search" :size="18" />
        </button>
        <RouterLink to="/login" class="btn btn-ghost btn-sm">เข้าสู่ระบบ</RouterLink>
        <RouterLink to="/register" class="btn btn-primary btn-sm">สมัครสมาชิก</RouterLink>
      </div>
    </div>
  </header>
</template>
