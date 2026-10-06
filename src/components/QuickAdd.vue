<script setup lang="ts">
/**
 * ปุ่ม + บันทึกรายการด่วนจากหน้าไหนก็ได้ — กรอกแค่ประเภท จำนวนเงิน หมวด แล้วกดบันทึก
 * จำสมุดเล่มล่าสุดที่ใช้ไว้ ถ้าเปิดสมุดอยู่จะบันทึกลงเล่มนั้นและแสดงในรายการทันที
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import MoneyField from './MoneyField.vue'
import { categoriesOf, type EntryType } from '@/data/workspaceModes'
import { ApiError, api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const LAST_KEY = 'taxflow_quick_workspace'

const auth = useAuthStore()
const ledger = useLedgerStore()
const game = useGameStore()
const toast = useToastStore()

const open = ref(false)
const saving = ref(false)
const panel = ref<HTMLElement | null>(null)
const form = reactive({ workspaceId: '', type: 'expense' as EntryType, amount: 0, categoryKey: '', note: '', date: localToday() })

const workspaces = computed(() => ledger.workspaces)
const workspace = computed(() => workspaces.value.find((w) => w.id === form.workspaceId) ?? null)
const categories = computed(() => (workspace.value ? categoriesOf(workspace.value.mode, form.type) : []))

// เปลี่ยนประเภทหรือเล่มแล้วหมวดเดิมอาจไม่มี เลือกหมวดแรกให้
watch([categories], () => {
  if (!categories.value.some((c) => c.key === form.categoryKey)) form.categoryKey = categories.value[0]?.key ?? ''
})

async function show() {
  open.value = true
  form.date = localToday()
  if (!ledger.workspaces.length) {
    try {
      await ledger.loadWorkspaces()
    } catch {
      /* โหลดไม่ได้ จะขึ้นข้อความให้สร้างสมุดแทน */
    }
  }
  let last = ''
  try {
    last = localStorage.getItem(LAST_KEY) ?? ''
  } catch {
    /* อ่านไม่ได้ก็ใช้เล่มแรก */
  }
  // เปิดสมุดเล่มไหนอยู่ ใช้เล่มนั้นก่อน
  const preferred = [ledger.active?.id, last, workspaces.value[0]?.id].find(
    (id) => id && workspaces.value.some((w) => w.id === id),
  )
  form.workspaceId = preferred ?? ''
  await nextTick()
  panel.value?.querySelector<HTMLInputElement>('.money-input input')?.focus()
}

function close() {
  open.value = false
}

async function save() {
  if (!workspace.value) return
  if (form.amount <= 0) {
    toast.error('จำนวนเงินต้องมากกว่า 0')
    return
  }
  saving.value = true
  try {
    const created = await api.addEntry(workspace.value.id, {
      date: form.date,
      type: form.type,
      categoryKey: form.categoryKey,
      amount: form.amount,
      note: form.note,
    })
    ledger.receiveEntry(created)
    game.scheduleRefresh()
    try {
      localStorage.setItem(LAST_KEY, workspace.value.id)
    } catch {
      /* ไม่จำก็ไม่เป็นไร */
    }
    toast.success(`บันทึกลง "${workspace.value.name}" แล้ว`)
    form.amount = 0
    form.note = ''
    close()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="auth.isLoggedIn" class="quick-add no-print">
    <button class="quick-fab" type="button" aria-label="บันทึกรายการด่วน" title="บันทึกรายการด่วน" @click="show">
      <AppIcon name="plus" :size="26" />
    </button>

    <Transition name="guide-pop">
      <div v-if="open" class="modal-backdrop quick-backdrop" @click.self="close">
        <section ref="panel" class="modal quick-panel" role="dialog" aria-modal="true" aria-labelledby="quick-title">
          <div class="card-head">
            <div>
              <h3 id="quick-title">บันทึกด่วน</h3>
              <p>จดเร็ว ๆ แล้วไปแก้รายละเอียดทีหลังได้</p>
            </div>
            <button class="guide-icon-btn" type="button" aria-label="ปิด" @click="close">
              <AppIcon name="close" :size="18" />
            </button>
          </div>

          <div v-if="!workspaces.length" class="notice">
            <strong>ยังไม่มีสมุดบัญชี</strong>
            สร้างสมุดเล่มแรกก่อน แล้วปุ่มนี้จะบันทึกได้ทันที
            <RouterLink to="/workspaces" @click="close">ไปสร้างสมุด</RouterLink>
          </div>

          <form v-else novalidate @submit.prevent="save">
            <div class="chip-row mb-2" role="radiogroup" aria-label="ประเภทรายการ">
              <button
                v-for="t in [
                  { value: 'expense', label: 'รายจ่าย' },
                  { value: 'income', label: 'รายรับ' },
                ]"
                :key="t.value"
                type="button"
                class="chip"
                role="radio"
                :aria-checked="form.type === t.value"
                :class="{ selected: form.type === t.value }"
                @click="form.type = t.value as EntryType"
              >
                {{ t.label }}
              </button>
            </div>

            <MoneyField v-model="form.amount" label="จำนวนเงิน" />

            <div class="field-grid">
              <div class="field">
                <label for="q-cat">หมวด</label>
                <select id="q-cat" v-model="form.categoryKey">
                  <option v-for="c in categories" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </div>
              <div v-if="workspaces.length > 1" class="field">
                <label for="q-ws">สมุด</label>
                <select id="q-ws" v-model="form.workspaceId">
                  <option v-for="w in workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
              </div>
              <div class="field">
                <label for="q-date">วันที่</label>
                <input id="q-date" v-model="form.date" type="date" :max="localToday()" />
              </div>
              <div class="field">
                <label for="q-note">รายละเอียด</label>
                <input id="q-note" v-model="form.note" type="text" placeholder="ไม่บังคับ" />
              </div>
            </div>

            <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </form>
        </section>
      </div>
    </Transition>
  </div>
</template>
