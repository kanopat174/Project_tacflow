<script setup lang="ts">
/**
 * ภาพย่อของหลักฐานหนึ่งชิ้น
 * ดึง Blob จาก IndexedDB แล้วสร้าง object URL ชั่วคราว
 * ต้องคืน URL ตอนถูกถอดออกจากหน้าจอ ไม่งั้นหน่วยความจำจะรั่วเมื่อเลื่อนดูหลายวัน
 */
import { onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { api } from '@/services/api'
import { formatBytes } from '@/services/imageCompress'
import type { Evidence } from '@/services/ledgerEngine'

const props = defineProps<{ item: Evidence }>()
const emit = defineEmits<{ open: [url: string]; remove: [id: string] }>()

const url = ref<string | null>(null)
const failed = ref(false)
const isImage = () => props.item.mimeType.startsWith('image/')

function release() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
}

watch(
  () => props.item.id,
  async (id) => {
    release()
    failed.value = false
    const blob = await api.evidenceBlob(id)
    if (!blob) {
      failed.value = true
      return
    }
    url.value = URL.createObjectURL(blob)
  },
  { immediate: true },
)

onUnmounted(release)
</script>

<template>
  <figure class="evidence-thumb">
    <button
      type="button"
      class="thumb-open"
      :aria-label="`เปิดดู ${item.name}`"
      :disabled="!url"
      @click="url && emit('open', url)"
    >
      <img v-if="isImage() && url" :src="url" :alt="item.name" loading="lazy" />
      <span v-else class="thumb-icon">
        <AppIcon :name="failed ? 'alert' : 'file'" :size="26" />
        <small>{{ failed ? 'เปิดไฟล์ไม่ได้' : 'PDF' }}</small>
      </span>
    </button>

    <figcaption>
      <strong :title="item.name">{{ item.name }}</strong>
      <span class="muted small">{{ formatBytes(item.size) }}</span>
      <span v-if="item.note" class="muted small">{{ item.note }}</span>
    </figcaption>

    <button
      class="thumb-remove"
      type="button"
      :aria-label="`ลบหลักฐาน ${item.name}`"
      @click="emit('remove', item.id)"
    >
      <AppIcon name="trash" :size="14" />
    </button>
  </figure>
</template>
