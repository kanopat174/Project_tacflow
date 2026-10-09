<script setup lang="ts">
/** ตั้ง เปลี่ยน หรือปิด PIN ล็อกแอป และเลือกเวลาล็อกเมื่อไม่ได้ใช้งาน */
import { reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  DEFAULT_IDLE_MINUTES,
  IDLE_OPTIONS,
  PIN_ERROR,
  PIN_PATTERN,
  checkPin,
  readPin,
  removePin,
  setIdleMinutes,
  setPin,
} from '@/services/appLock'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const lock = useLockStore()
const toast = useToastStore()

const editing = ref(false)
const busy = ref(false)
const form = reactive({ current: '', pin: '', confirm: '' })
const idle = ref<number>((auth.user && readPin(auth.user.id)?.idleMinutes) ?? DEFAULT_IDLE_MINUTES)

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6)

function idleLabel(minutes: number): string {
  return minutes ? `ไม่ได้ใช้งาน ${minutes} นาที` : 'เฉพาะตอนเปิดเว็บใหม่'
}

function startEdit() {
  Object.assign(form, { current: '', pin: '', confirm: '' })
  editing.value = true
}

async function save() {
  if (!auth.user) return
  if (lock.hasPin && !(await checkPin(auth.user.id, form.current))) {
    toast.error('PIN ปัจจุบันไม่ถูกต้อง')
    return
  }
  if (!PIN_PATTERN.test(form.pin)) {
    toast.error(PIN_ERROR)
    return
  }
  if (form.pin !== form.confirm) {
    toast.error('PIN ทั้งสองช่องไม่ตรงกัน')
    return
  }
  busy.value = true
  try {
    await setPin(auth.user.id, form.pin, idle.value)
    lock.refreshPinState()
    editing.value = false
    toast.success('ตั้ง PIN แล้ว เปิดเว็บครั้งหน้าต้องใส่ PIN')
  } catch {
    toast.error('ตั้ง PIN ไม่สำเร็จ')
  } finally {
    busy.value = false
  }
}

async function turnOff() {
  if (!auth.user) return
  if (!(await checkPin(auth.user.id, form.current))) {
    toast.error('ใส่ PIN ปัจจุบันให้ถูกก่อนปิด')
    return
  }
  removePin(auth.user.id)
  lock.refreshPinState()
  editing.value = false
  toast.success('ปิดการล็อกด้วย PIN แล้ว')
}

function changeIdle() {
  if (!auth.user) return
  setIdleMinutes(auth.user.id, idle.value)
  toast.success(`ล็อกอัตโนมัติ: ${idleLabel(idle.value)}`)
}
</script>

<template>
  <section class="card" data-test="pin-settings">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="lock" :size="19" />
          ล็อกแอปด้วย PIN
        </h3>
        <p>กันคนอื่นเปิดดูข้อมูลภาษีในเครื่องนี้ ลืม PIN ก็ออกจากระบบแล้วเข้าใหม่ด้วยรหัสผ่านได้</p>
      </div>
      <span class="badge" :class="lock.hasPin ? 'badge-ok' : 'badge-muted'">{{ lock.hasPin ? 'เปิดอยู่' : 'ปิดอยู่' }}</span>
    </div>

    <template v-if="!editing">
      <div v-if="lock.hasPin" class="field">
        <label for="pin-idle">ล็อกอัตโนมัติเมื่อ</label>
        <select id="pin-idle" v-model.number="idle" @change="changeIdle">
          <option v-for="m in IDLE_OPTIONS" :key="m" :value="m">{{ idleLabel(m) }}</option>
        </select>
      </div>
      <div class="row" style="gap: 8px">
        <button class="btn btn-ghost btn-sm" type="button" @click="startEdit">
          {{ lock.hasPin ? 'เปลี่ยนหรือปิด PIN' : 'ตั้ง PIN' }}
        </button>
        <button v-if="lock.hasPin" class="btn btn-ghost btn-sm" type="button" @click="lock.lockNow()">ล็อกตอนนี้</button>
      </div>
    </template>

    <form v-else novalidate @submit.prevent="save">
      <div v-if="lock.hasPin" class="field">
        <label for="pin-current">PIN ปัจจุบัน</label>
        <input
          id="pin-current"
          :value="form.current"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          @input="form.current = digitsOnly(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="field">
        <label for="pin-new">PIN ใหม่ (ตัวเลข 4–6 หลัก)</label>
        <input
          id="pin-new"
          :value="form.pin"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          @input="form.pin = digitsOnly(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="field">
        <label for="pin-confirm">ยืนยัน PIN ใหม่</label>
        <input
          id="pin-confirm"
          :value="form.confirm"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          @input="form.confirm = digitsOnly(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div v-if="!lock.hasPin" class="field">
        <label for="pin-idle-new">ล็อกอัตโนมัติเมื่อ</label>
        <select id="pin-idle-new" v-model.number="idle">
          <option v-for="m in IDLE_OPTIONS" :key="m" :value="m">{{ idleLabel(m) }}</option>
        </select>
      </div>
      <div class="row" style="gap: 8px">
        <button class="btn btn-primary btn-sm" type="submit" :disabled="busy">บันทึก PIN</button>
        <button v-if="lock.hasPin" class="btn btn-ghost btn-sm" type="button" @click="turnOff">ปิด PIN</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="editing = false">ยกเลิก</button>
      </div>
      <p class="small muted mt-1">
        PIN ล็อกหน้าจอเท่านั้น ข้อมูลในเบราว์เซอร์ยังไม่ได้เข้ารหัส — กันคนเปิดแอปดู แต่กันคนที่ใช้เครื่องมือนักพัฒนาไม่ได้
      </p>
    </form>
  </section>
</template>
