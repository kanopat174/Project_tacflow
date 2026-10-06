<script setup lang="ts">
/**
 * ไอคอนของโหมดสมุดบัญชีที่เปลี่ยนตามรูปแบบเว็บ
 * ปกติ/มินิมอลใช้ไอคอนเส้น ส่วนธีมน่ารักใช้ภาพการ์ตูนประจำโหมด
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { MODE_ART } from '@/data/modeArt'
import { modeDefinition, type WorkspaceMode } from '@/data/workspaceModes'
import { useTheme } from '@/composables/useTheme'

const props = withDefaults(defineProps<{ mode: WorkspaceMode; size?: number }>(), { size: 22 })

const theme = useTheme()
const cute = computed(() => theme.siteStyle.value === 'cute')
const icon = computed(() => modeDefinition(props.mode).icon)
</script>

<template>
  <span
    v-if="cute"
    class="mode-art"
    :style="{ width: `${size * 2}px`, height: `${size * 2}px` }"
    aria-hidden="true"
    v-html="MODE_ART[mode]"
  ></span>
  <AppIcon v-else :name="icon" :size="size" />
</template>
