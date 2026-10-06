<script setup lang="ts">
/**
 * แผงบอกว่าฟีเจอร์นี้ต้องมีบัญชี พร้อมทางไปสมัครหรือเข้าสู่ระบบ
 * วางไว้เหนือตัวอย่างหน้าจอ เพื่อให้ผู้เยี่ยมชมเห็นว่าจะได้อะไรก่อนตัดสินใจสมัคร
 */
import AppIcon from './AppIcon.vue'
import { useAuthGate } from '@/composables/useAuthGate'

withDefaults(
  defineProps<{
    title: string
    description: string
    /** สิ่งที่จะได้เมื่อสมัครแล้ว */
    benefits?: string[]
  }>(),
  { benefits: () => [] },
)

const gate = useAuthGate()
</script>

<template>
  <section class="locked-feature">
    <div class="locked-head">
      <span class="ico"><AppIcon name="lock" :size="22" /></span>
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>

    <ul v-if="benefits.length" class="locked-benefits">
      <li v-for="benefit in benefits" :key="benefit">
        <AppIcon name="check" :size="15" />
        <span>{{ benefit }}</span>
      </li>
    </ul>

    <p class="muted small">
      เครื่องคำนวณภาษีทุกหมวดและคู่มือค่าลดหย่อนใช้ได้ฟรีอยู่แล้วโดยไม่ต้องสมัคร
      บัญชีจำเป็นเฉพาะฟีเจอร์ที่ต้องบันทึกข้อมูลของคุณไว้
    </p>

    <div class="row">
      <RouterLink class="btn btn-primary" :to="gate.registerTo.value">
        สมัครสมาชิกฟรี
        <AppIcon name="arrowRight" :size="18" />
      </RouterLink>
      <RouterLink class="btn btn-ghost" :to="gate.loginTo.value">เข้าสู่ระบบ</RouterLink>
    </div>
  </section>
</template>
