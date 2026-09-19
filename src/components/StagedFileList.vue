<script setup lang="ts">
/**
 * รายการไฟล์ที่เลือกไว้แล้วแต่ยังไม่อัปโหลด
 *
 * แสดงภาพตัวอย่างจากไฟล์ในเครื่องโดยตรง ยังไม่แตะที่เก็บข้อมูลใด ๆ
 * ต้องคืน object URL ตอนถอดออกจากหน้าจอ ไม่งั้นหน่วยความจำจะรั่วเมื่อเลือกไฟล์หลายรอบ
 */
import { computed, onUnmounted, watch, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { formatBytes } from '@/services/imageCompress'

const props = defineProps<{ files: File[] }>()
const emit = defineEmits<{ remove: [index: number]; clear: [] }>()

const previews = ref<(string | null)[]>([])

function release() {
  for (const url of previews.value) if (url) URL.revokeObjectURL(url)
  previews.value = []
}

watch(
  () => props.files,
  (files) => {
    release()
    previews.value = files.map((file) =>
      file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    )
  },
  { immediate: true, deep: true },
)

onUnmounted(release)

const totalSize = computed(() => props.files.reduce((sum, f) => sum + f.size, 0))
</script>

<template>
  <div v-if="files.length" class="staged">
    <div class="staged-head">
      <strong>เลือกไว้ {{ files.length }} ไฟล์ · {{ formatBytes(totalSize) }}</strong>
      <button type="button" class="link-button" @click="emit('clear')">ล้างทั้งหมด</button>
    </div>

    <ul class="staged-list">
      <li v-for="(file, i) in files" :key="`${file.name}-${file.size}-${i}`">
        <span class="staged-thumb">
          <img v-if="previews[i]" :src="previews[i] as string" :alt="file.name" />
          <AppIcon v-else name="file" :size="18" />
        </span>
        <span class="staged-meta">
          <strong :title="file.name">{{ file.name }}</strong>
          <span class="muted small">{{ formatBytes(file.size) }}</span>
        </span>
        <button
          type="button"
          class="staged-remove"
          :aria-label="`เอา ${file.name} ออกจากรายการที่จะอัปโหลด`"
          @click="emit('remove', i)"
        >
          <AppIcon name="close" :size="15" />
        </button>
      </li>
    </ul>

    <p class="staged-note">
      <AppIcon name="info" :size="15" />
      <span>ไฟล์เหล่านี้ยังไม่ถูกบันทึก กดยืนยันอีกครั้งเพื่ออัปโหลด</span>
    </p>
  </div>
</template>
