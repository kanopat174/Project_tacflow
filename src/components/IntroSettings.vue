<script setup lang="ts">
/** ตั้งค่าคำแนะนำจากตัวการ์ตูน — เปิด/ปิด และเริ่มแนะนำใหม่ทุกหน้า */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { FEATURE_INTROS } from '@/data/featureIntros'
import { useIntroStore } from '@/stores/intro'
import { useToastStore } from '@/stores/toast'

const intro = useIntroStore()
const toast = useToastStore()

const total = Object.keys(FEATURE_INTROS).length
const seenCount = computed(() => intro.progress.seen.filter((k) => k in FEATURE_INTROS).length)

function toggle(event: Event) {
  const on = (event.target as HTMLInputElement).checked
  intro.setOff(!on)
  toast.success(on ? 'เปิดคำแนะนำจากตัวการ์ตูนแล้ว' : 'ปิดคำแนะนำจากตัวการ์ตูนแล้ว')
}

function reset() {
  intro.resetAll()
  toast.success('เริ่มแนะนำใหม่แล้ว เข้าหน้าไหนตัวการ์ตูนจะพาดูอีกครั้ง')
}
</script>

<template>
  <section class="card intro-settings">
    <div class="card-head">
      <div>
        <h3>คำแนะนำจากตัวการ์ตูน</h3>
        <p>เข้าฟีเจอร์ไหนครั้งแรก ตัวการ์ตูนจะพาดูว่าทำอะไรได้ · ดูไปแล้ว {{ seenCount }} จาก {{ total }} ฟีเจอร์</p>
      </div>
    </div>
    <label class="check">
      <input type="checkbox" :checked="!intro.progress.off" @change="toggle" />
      <span>แสดงคำแนะนำเมื่อเข้าฟีเจอร์ใหม่</span>
    </label>
    <button class="btn btn-ghost btn-block" type="button" @click="reset">
      <AppIcon name="history" :size="17" />
      เริ่มแนะนำใหม่ทุกหน้า
    </button>
    <p class="small muted mt-1">ดูคำแนะนำของหน้าที่เปิดอยู่ได้ตลอด ด้วยปุ่ม ⓘ บนแถบด้านบน</p>
  </section>
</template>
