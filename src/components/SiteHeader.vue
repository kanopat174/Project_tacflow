<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useTheme } from '@/composables/useTheme'

/** รายการแรกสลับตามสถานะ: ผู้เยี่ยมชมเห็นหน้าแนะนำ สมาชิกเห็นแดชบอร์ด */
const NAV_ITEMS = [
  { label: 'สมุดบัญชี', to: '/workspaces' },
  { label: 'คำนวณภาษี', to: '/calculator' },
  { label: 'ค่าลดหย่อน', to: '/deductions' },
  { label: 'ยื่นแบบภาษี', to: '/filing' },
  { label: 'เอกสาร', to: '/documents' },
  { label: 'ประวัติ', to: '/history' },
]

const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()
const menuOpen = ref(false)
const theme = useTheme()

const navItems = computed(() => [
  auth.isLoggedIn ? { label: 'แดชบอร์ด', to: '/dashboard' } : { label: 'หน้าแรก', to: '/' },
  ...NAV_ITEMS,
])

// ปิดเมนูมือถือทุกครั้งที่เปลี่ยนหน้า ไม่งั้นเมนูจะค้างทับเนื้อหา
watch(() => route.fullPath, () => (menuOpen.value = false))

async function handleLogout() {
  await auth.logout()
  toast.success('ออกจากระบบเรียบร้อย')
  router.push('/')
}
</script>

<template>
  <header class="site-header">
    <div class="container bar">
      <RouterLink :to="auth.isLoggedIn ? '/dashboard' : '/'" class="brand">
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
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="auth-zone">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'"
          :title="theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'"
          @click="theme.toggle()"
        >
          <AppIcon :name="theme.resolved.value === 'dark' ? 'sun' : 'moon'" :size="18" />
        </button>
        <template v-if="auth.isLoggedIn">
          <RouterLink to="/profile" class="user-pill" title="โปรไฟล์ของฉัน">
            <span class="avatar">{{ auth.initials }}</span>
            <span class="who">
              <b>{{ auth.user?.fullName || auth.user?.username }}</b>
              <small>{{ auth.isAdmin ? 'ผู้ดูแลระบบ' : 'สมาชิก' }}</small>
            </span>
          </RouterLink>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            aria-label="ออกจากระบบ"
            @click="handleLogout"
          >
            <AppIcon name="logout" :size="17" />
            <span class="logout-label">ออกจากระบบ</span>
          </button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="btn btn-ghost btn-sm">เข้าสู่ระบบ</RouterLink>
          <RouterLink to="/register" class="btn btn-primary btn-sm">สมัครสมาชิก</RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
