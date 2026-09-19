<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import { WORKSPACE_MODES, type WorkspaceMode } from '@/data/workspaceModes'
import { ApiError } from '@/services/api'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import LockedFeature from '@/components/LockedFeature.vue'
import { useAuthGate } from '@/composables/useAuthGate'

const ledger = useLedgerStore()
const toast = useToastStore()
const gate = useAuthGate()
const router = useRouter()

const loading = ref(true)
const creating = ref(false)
const form = reactive<{ name: string; mode: WorkspaceMode; capital: number }>({
  name: '',
  mode: 'personal',
  capital: 0,
})

function pickMode(mode: WorkspaceMode) {
  form.mode = mode
  const definition = WORKSPACE_MODES.find((m) => m.key === mode)
  // เติมชื่อให้ล่วงหน้าเฉพาะตอนที่ผู้ใช้ยังไม่ได้พิมพ์เอง
  if (!form.name.trim()) form.name = definition?.label ?? ''
}

async function create() {
  if (!gate.requireAuth('ต้องเข้าสู่ระบบก่อนสร้างสมุดบัญชี')) return
  if (!form.name.trim()) {
    toast.error('กรุณาตั้งชื่อสมุดบัญชี')
    return
  }
  creating.value = true
  try {
    const created = await ledger.createWorkspace({ ...form })
    toast.success(`สร้างสมุด "${created.name}" แล้ว`)
    router.push(`/workspace/${created.id}`)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'สร้างสมุดบัญชีไม่สำเร็จ')
  } finally {
    creating.value = false
  }
}

async function remove(id: string, name: string) {
  if (!confirm(`ลบสมุด "${name}" พร้อมรายการและเป้าหมายทั้งหมด?`)) return
  try {
    await ledger.removeWorkspace(id)
    toast.success('ลบสมุดบัญชีแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}

onMounted(async () => {
  if (gate.isGuest.value) {
    loading.value = false
    return
  }
  try {
    await ledger.loadWorkspaces()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดสมุดบัญชีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">สมุดบัญชี</span>
        <h2>บันทึกรายรับรายจ่าย</h2>
        <p>
          เลือกโหมดที่ตรงกับการใช้งานของคุณ แต่ละโหมดมีหมวดรายรับรายจ่ายและเกณฑ์ความเสี่ยงของตัวเอง
          สร้างได้หลายเล่มและแยกกันคนละโหมด
        </p>
      </div>

      <LockedFeature
        v-if="gate.isGuest.value"
        title="ดูโหมดทั้งหมดได้เลย การสร้างสมุดต้องมีบัญชี"
        description="เลือกดูได้ว่าแต่ละโหมดเก็บอะไรและวัดอะไรบ้าง สมัครแล้วจึงเริ่มบันทึกรายการได้"
        :benefits="[
          'สร้างได้หลายเล่ม แยกโหมดกันคนละเล่ม',
          'วิเคราะห์ความเสี่ยงรายจ่ายให้อัตโนมัติ',
          'บอกว่าเงินทุนอยู่ได้อีกกี่เดือน',
          'ตั้งเป้าหมายแล้วติดตามความคืบหน้า',
        ]"
      />

      <section v-if="!loading && ledger.workspaces.length" class="card mb-3">
        <div class="card-head">
          <div>
            <h3>สมุดของฉัน</h3>
            <p>{{ ledger.workspaces.length }} เล่ม</p>
          </div>
        </div>
        <div class="grid grid-3">
          <div v-for="ws in ledger.workspaces" :key="ws.id" class="ws-card">
            <RouterLink :to="`/workspace/${ws.id}`" class="ws-open">
              <span class="badge badge-accent">
                {{ WORKSPACE_MODES.find((m) => m.key === ws.mode)?.label }}
              </span>
              <strong>{{ ws.name }}</strong>
              <span class="muted small">
                {{ WORKSPACE_MODES.find((m) => m.key === ws.mode)?.capitalLabel }}
                {{ formatBaht(ws.capital) }}
              </span>
              <span class="muted small">สร้างเมื่อ {{ thaiDate(ws.createdAt) }}</span>
            </RouterLink>
            <button class="btn btn-danger btn-sm" type="button" @click="remove(ws.id, ws.name)">
              <AppIcon name="trash" :size="15" />
              ลบ
            </button>
          </div>
        </div>
      </section>

      <div v-if="loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดสมุดบัญชี</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>สร้างสมุดเล่มใหม่</h3>
            <p>เลือกโหมดก่อน แล้วตั้งชื่อและใส่เงินทุนตั้งต้น</p>
          </div>
        </div>

        <div class="grid grid-3 mb-3">
          <button
            v-for="definition in WORKSPACE_MODES"
            :key="definition.key"
            type="button"
            class="mode-card"
            :class="{ selected: form.mode === definition.key }"
            :aria-pressed="form.mode === definition.key"
            @click="pickMode(definition.key)"
          >
            <span class="ico"><AppIcon :name="definition.icon" :size="22" /></span>
            <strong>{{ definition.label }}</strong>
            <span class="muted small">{{ definition.tagline }}</span>
            <span class="meta small">
              แนะนำเงินสำรอง {{ definition.recommendedRunwayMonths }} เดือน · เป้าออม
              {{ Math.round(definition.targetSavingsRate * 100) }}%
            </span>
          </button>
        </div>

        <div class="field-grid">
          <div class="field">
            <label for="ws-name">ชื่อสมุดบัญชี</label>
            <input id="ws-name" v-model="form.name" type="text" placeholder="เช่น การเงินส่วนตัว 2569" />
          </div>
          <MoneyField
            v-model="form.capital"
            :label="WORKSPACE_MODES.find((m) => m.key === form.mode)?.capitalLabel ?? 'เงินทุนตั้งต้น'"
            hint="ใช้คำนวณว่าเงินทุนอยู่ได้อีกกี่เดือน ใส่ 0 ได้ถ้ายังไม่มี"
          />
        </div>

        <button class="btn btn-primary btn-block" type="button" :disabled="creating" @click="create">
          <AppIcon v-if="gate.isGuest.value" name="lock" :size="17" />
          {{ creating ? 'กำลังสร้าง...' : gate.isGuest.value ? 'เข้าสู่ระบบเพื่อสร้างสมุด' : 'สร้างสมุดบัญชี' }}
          <AppIcon v-if="!creating && !gate.isGuest.value" name="arrowRight" :size="18" />
        </button>
      </section>
    </div>
  </main>
</template>
