<script setup lang="ts">
/** ปุ่มเลือกสีเว็บ (ขาว ดำ ชมพู ... และสีไล่โทน) เปิดเป็นเมนูลอยใต้ปุ่ม */
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { LOOKS } from '@/data/palettes'
import { useTheme, type SiteStyle } from '@/composables/useTheme'
import { MASCOTS, findMascot } from '@/data/mascot'

const theme = useTheme()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const STYLES: { value: SiteStyle; label: string; hint: string }[] = [
  { value: 'normal', label: 'ปกติ', hint: 'สมดุล อ่านง่าย' },
  { value: 'minimal', label: 'มินิมอล', hint: 'เรียบ แบน โปร่ง' },
  { value: 'cute', label: 'น่ารัก', hint: 'โค้งมน มีน้องออมสิน' },
]

const GROUPS = [
  { key: 'solid', title: 'สีพื้น', items: LOOKS.filter((l) => l.group === 'solid') },
  { key: 'gradient', title: 'ไล่โทนสี', items: LOOKS.filter((l) => l.group === 'gradient') },
]

function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

// ฟังคลิกนอกเมนูเฉพาะตอนเปิด จะได้ไม่ค้าง listener ไว้ทั้งเว็บ
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="theme-picker">
    <button
      class="palette-toggle"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="open"
      aria-label="เลือกรูปแบบและสีเว็บ"
      title="เลือกรูปแบบและสีเว็บ"
      @click="open = !open"
    >
      <AppIcon name="palette" :size="18" />
    </button>

    <div v-if="open" class="theme-menu" role="dialog" aria-label="เลือกสีเว็บ">
      <p class="theme-menu-title">รูปแบบเว็บ</p>
      <div class="style-grid" role="radiogroup" aria-label="รูปแบบเว็บ">
        <button
          v-for="option in STYLES"
          :key="option.value"
          type="button"
          role="radio"
          class="style-option"
          :class="[option.value, { active: theme.siteStyle.value === option.value }]"
          :aria-checked="theme.siteStyle.value === option.value"
          @click="theme.setStyle(option.value)"
        >
          <!-- ภาพจำลองการ์ดเล็ก ๆ ให้เห็นความต่างของแต่ละรูปแบบ -->
          <span class="style-preview" aria-hidden="true">
            <span v-if="option.value === 'cute'" class="style-mascot" v-html="findMascot(theme.mascot.value).svg"></span>
            <i class="line w70"></i>
            <i class="line w40"></i>
            <i class="pill"></i>
          </span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.hint }}</small>
        </button>
      </div>

      <!-- ธีมน่ารักเลือกตัวการ์ตูนได้ แต่ละตัวมีลายพื้นหลังและฟอนต์ของตัวเอง -->
      <template v-if="theme.siteStyle.value === 'cute'">
        <p class="theme-menu-title">ตัวการ์ตูน</p>
        <div class="mascot-grid" role="radiogroup" aria-label="ตัวการ์ตูน">
          <button
            v-for="option in MASCOTS"
            :key="option.key"
            type="button"
            role="radio"
            class="mascot-option"
            :class="{ active: theme.mascot.value === option.key }"
            :aria-checked="theme.mascot.value === option.key"
            :title="`${option.label} · ลาย${option.patternLabel}`"
            @click="theme.setMascot(option.key)"
          >
            <span class="mascot-thumb" :style="{ backgroundImage: option.pattern }" v-html="option.svg"></span>
            <span class="swatch-label">{{ option.label }}</span>
          </button>
        </div>
      </template>

      <template v-for="group in GROUPS" :key="group.key">
        <p class="theme-menu-title">{{ group.title }}</p>
        <div class="swatch-grid" role="radiogroup" :aria-label="group.title">
          <button
            v-for="option in group.items"
            :key="option.key"
            type="button"
            role="radio"
            class="swatch-option"
            :class="{ active: theme.look.value === option.key }"
            :aria-checked="theme.look.value === option.key"
            @click="theme.setLook(option.key)"
          >
            <span class="swatch-dot" :class="{ light: option.mode === 'light' && option.group === 'solid' }" :style="{ background: option.preview }">
              <AppIcon v-if="theme.look.value === option.key" name="check" :size="14" />
            </span>
            <span class="swatch-label">{{ option.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
