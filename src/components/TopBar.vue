<script setup lang="ts">
/**
 * แถบบนของสมาชิก — บอกว่าอยู่หน้าไหน มีช่องค้นหา และปุ่มตั้งค่าที่ใช้บ่อย
 * ปุ่มทุกปุ่มมีชื่อกำกับ (title/aria-label) ไม่ต้องเดาจากไอคอน
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ThemePicker from './ThemePicker.vue'
import NotificationBell from './NotificationBell.vue'
import { useTheme } from '@/composables/useTheme'
import { introForRoute } from '@/data/featureIntros'
import { useIntroStore } from '@/stores/intro'
import { useUiStore } from '@/stores/ui'
import { useFx } from '@/composables/useFx'

const ui = useUiStore()
const intro = useIntroStore()
const route = useRoute()
const theme = useTheme()
const fx = useFx()

/** สลับธีมพร้อมดาว/พระอาทิตย์เด้งออกจากปุ่ม */
function toggleTheme(event: Event) {
  theme.toggle()
  fx.themeSwitched(theme.resolved.value === 'dark', event.currentTarget as Element)
}

const title = computed(() => (route.meta.title as string | undefined) ?? 'TaxFlow')
/** หน้านี้มีคำแนะนำจากตัวการ์ตูนไหม — มีจึงแสดงปุ่มขอดูอีกครั้ง */
const hasIntro = computed(() => Boolean(introForRoute(route.name as string | undefined)))
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <header class="top-bar no-print">
    <button class="top-menu" type="button" aria-label="เปิดเมนู" title="เมนู" @click="ui.navOpen = true">
      <AppIcon name="menu" :size="22" />
    </button>

    <p class="top-title">{{ title }}</p>

    <button class="top-search" type="button" aria-label="ค้นหาและสั่งงาน" @click="ui.paletteOpen = true">
      <AppIcon name="search" :size="18" />
      <span class="top-search-text">ค้นหาหน้า หรือพิมพ์ “กาแฟ 65” เพื่อบันทึก</span>
      <kbd>{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
    </button>

    <div class="top-actions">
      <button class="top-icon top-search-icon" type="button" aria-label="ค้นหาและสั่งงาน" title="ค้นหา" @click="ui.paletteOpen = true">
        <AppIcon name="search" :size="19" />
      </button>
      <button
        v-if="hasIntro"
        class="top-icon top-help"
        type="button"
        aria-label="ให้ตัวการ์ตูนแนะนำหน้านี้"
        title="แนะนำหน้านี้"
        @click="intro.replay()"
      >
        <AppIcon name="info" :size="19" />
      </button>
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
      <NotificationBell />
    </div>
  </header>
</template>
