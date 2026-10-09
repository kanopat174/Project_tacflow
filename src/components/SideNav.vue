<script setup lang="ts">
/**
 * เมนูด้านข้างของสมาชิก
 *  - คอม (≥ 1160px): แสดงตลอด ติดซ้ายจอ
 *  - ไอแพด/มือถือ: เป็นลิ้นชักเลื่อนออกจากซ้าย เปิดจากปุ่มเมนู ปิดด้วยฉากหลัง Escape หรือเปลี่ยนหน้า
 * ด้านล่างมีบัญชีผู้ใช้และปุ่มออกจากระบบ อยู่ที่เดิมเสมอ หาเจอง่าย
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import UserAvatar from './UserAvatar.vue'
import { MEMBER_NAV, isActive } from '@/data/memberNav'
import { introForRoute } from '@/data/featureIntros'
import { useAuthStore } from '@/stores/auth'
import { useIntroStore } from '@/stores/intro'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useTheme } from '@/composables/useTheme'
import { useFx } from '@/composables/useFx'

const auth = useAuthStore()
const intro = useIntroStore()
const toast = useToastStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const theme = useTheme()
const fx = useFx()

/*
 * มือถือ: แถบบนเหลือที่น้อย ปุ่มสลับธีมและปุ่มแนะนำหน้านี้จึงย้ายมาอยู่ในลิ้นชักนี้ (ซ่อนบนจอใหญ่ด้วย CSS)
 */
const hasIntro = computed(() => Boolean(introForRoute(route.name as string | undefined)))
function toggleTheme(event: Event) {
  theme.toggle()
  fx.themeSwitched(theme.resolved.value === 'dark', event.currentTarget as Element)
}
function replayIntro() {
  ui.navOpen = false
  intro.replay()
}

/** กดโลโก้: เด้งเบา ๆ (กด 5 ครั้งติดกันมีของลับ) */
function onBrand(event: Event) {
  fx.logoTap((event.currentTarget as HTMLElement).querySelector<HTMLElement>('.brand-mark'))
}

// เปลี่ยนหน้าแล้วปิดลิ้นชัก ไม่งั้นเมนูค้างทับเนื้อหาบนมือถือ
watch(() => route.fullPath, () => (ui.navOpen = false))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') ui.navOpen = false
}
watch(
  () => ui.navOpen,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

async function handleLogout() {
  await auth.logout()
  toast.success('ออกจากระบบเรียบร้อย')
  router.push('/')
}
</script>

<template>
  <div class="nav-backdrop" :class="{ show: ui.navOpen }" aria-hidden="true" @click="ui.navOpen = false"></div>
  <aside class="side-nav" :class="{ open: ui.navOpen }" aria-label="เมนูหลัก">
    <div class="side-brand">
      <RouterLink to="/dashboard" class="brand" @click="onBrand">
        <span class="brand-mark"><img src="@/assets/brand/logo-mark.png" alt="" width="38" height="38" /></span>
        <span class="brand-info">
          <strong>Jodwise</strong>
          <span>จดไว้</span>
        </span>
      </RouterLink>
      <button class="side-close" type="button" aria-label="ปิดเมนู" @click="ui.navOpen = false">
        <AppIcon name="close" :size="20" />
      </button>
    </div>

    <button class="side-add btn btn-primary btn-block" type="button" @click="((ui.navOpen = false), ui.openQuickAdd())">
      <AppIcon name="plus" :size="18" />
      บันทึกรายการ
    </button>

    <nav class="side-groups">
      <div v-for="group in MEMBER_NAV" :key="group.title" class="side-group">
        <p class="side-group-title">{{ group.title }}</p>
        <RouterLink
          v-for="link in group.links"
          :key="link.to"
          :to="link.to"
          class="side-link"
          :class="{ active: isActive(link, route.path) }"
          :aria-current="isActive(link, route.path) ? 'page' : undefined"
        >
          <AppIcon :name="link.icon" :size="19" />
          <span>{{ link.label }}</span>
        </RouterLink>
      </div>
    </nav>

    <div class="side-quick">
      <button type="button" class="side-link" @click="toggleTheme($event)">
        <AppIcon :name="theme.resolved.value === 'dark' ? 'sun' : 'moon'" :size="19" />
        <span>{{ theme.resolved.value === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด' }}</span>
      </button>
      <button v-if="hasIntro" type="button" class="side-link" @click="replayIntro">
        <AppIcon name="info" :size="19" />
        <span>แนะนำหน้านี้</span>
      </button>
    </div>

    <div class="side-account">
      <RouterLink to="/profile" class="side-user" :class="{ active: route.path === '/profile' }" title="โปรไฟล์และการตั้งค่า">
        <UserAvatar :src="auth.user?.avatarUrl" :name="auth.user?.fullName || auth.user?.username" />
        <span class="side-user-text">
          <b>{{ auth.user?.fullName || auth.user?.username }}</b>
          <small>โปรไฟล์และสำรองข้อมูล</small>
        </span>
      </RouterLink>
      <button class="side-logout" type="button" aria-label="ออกจากระบบ" @click="handleLogout">
        <AppIcon name="logout" :size="18" />
        <span class="logout-label">ออกจากระบบ</span>
      </button>
    </div>
  </aside>
</template>
