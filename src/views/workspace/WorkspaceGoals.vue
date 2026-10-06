<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import BudgetPanel from '@/components/BudgetPanel.vue'
import ChallengesPanel from '@/components/ChallengesPanel.vue'
import { GOAL_KINDS, type GoalKind } from '@/data/workspaceModes'
import { ApiError } from '@/services/api'
import { formatBaht } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()

const saving = ref(false)
const form = reactive({ name: '', kind: 'save' as GoalKind, target: 0, deadline: '' })

const selectedKind = computed(() => GOAL_KINDS.find((k) => k.value === form.kind))
/** เป้าแบบเงินสำรองนับเป็นเดือน ไม่ใช่บาท จึงใช้ช่องกรอกคนละแบบ */
const targetIsMonths = computed(() => form.kind === 'runway')

async function submit() {
  if (!form.name.trim()) {
    toast.error('กรุณาตั้งชื่อเป้าหมาย')
    return
  }
  if (form.target <= 0) {
    toast.error('เป้าหมายต้องมากกว่า 0')
    return
  }
  saving.value = true
  try {
    await ledger.addGoal({ ...form, name: form.name.trim() })
    toast.success('เพิ่มเป้าหมายแล้ว')
    form.name = ''
    form.target = 0
    form.deadline = ''
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'เพิ่มเป้าหมายไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    await ledger.removeGoal(id)
    toast.success('ลบเป้าหมายแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}

function kindLabel(kind: GoalKind): string {
  return GOAL_KINDS.find((k) => k.value === kind)?.label ?? kind
}

function displayValue(kind: GoalKind, value: number): string {
  if (!Number.isFinite(value)) return 'ไม่จำกัด'
  return kind === 'runway' ? `${value.toFixed(1)} เดือน` : formatBaht(value)
}
</script>

<template>
  <div class="work-layout">
    <div>
      <section class="card">
        <div class="card-head">
          <div>
            <h3>เป้าหมายของสมุดเล่มนี้</h3>
            <p>ความคืบหน้าคำนวณสดจากรายการที่บันทึกไว้</p>
          </div>
        </div>

        <div v-if="!ledger.goalProgress.length" class="empty-state">
          <span class="ico-big"><AppIcon name="spark" :size="24" /></span>
          <h3>ยังไม่ได้ตั้งเป้าหมาย</h3>
          <p>ตั้งเป้าเก็บเงิน คุมรายจ่าย หรือสะสมเงินสำรอง แล้วระบบจะติดตามให้อัตโนมัติ</p>
        </div>

        <div v-for="progress in ledger.goalProgress" :key="progress.goal.id" class="goal-row">
          <div class="goal-head">
            <div>
              <strong>{{ progress.goal.name }}</strong>
              <p class="muted small">
                {{ kindLabel(progress.goal.kind) }} ·
                เป้า {{ displayValue(progress.goal.kind, progress.goal.target) }}
                <template v-if="progress.goal.deadline"> · ภายใน {{ progress.goal.deadline }}</template>
              </p>
            </div>
            <div class="row" style="gap: 8px">
              <span class="badge" :class="progress.achieved ? 'badge-ok' : 'badge-warn'">
                {{ progress.achieved ? 'สำเร็จแล้ว' : 'กำลังทำ' }}
              </span>
              <button
                class="btn btn-danger btn-sm"
                type="button"
                :aria-label="`ลบเป้าหมาย ${progress.goal.name}`"
                @click="remove(progress.goal.id)"
              >
                <AppIcon name="trash" :size="15" />
              </button>
            </div>
          </div>

          <div class="cap-bar" :class="{ over: progress.goal.kind === 'expenseCap' && !progress.achieved }">
            <span :style="{ width: `${progress.percent * 100}%` }"></span>
          </div>

          <p class="small mt-1">{{ progress.message }}</p>
        </div>
      </section>

      <BudgetPanel />

      <ChallengesPanel />
    </div>

    <aside class="card" style="position: sticky; top: 88px">
      <div class="card-head">
        <div>
          <h3>ตั้งเป้าหมายใหม่</h3>
          <p>เลือกชนิดเป้าที่ตรงกับสิ่งที่อยากติดตาม</p>
        </div>
      </div>

      <form novalidate @submit.prevent="submit">
        <div class="field">
          <label for="g-name">ชื่อเป้าหมาย</label>
          <input id="g-name" v-model="form.name" type="text" placeholder="เช่น เก็บเงินดาวน์บ้าน" />
        </div>

        <div class="field">
          <label for="g-kind">ชนิดของเป้า</label>
          <select id="g-kind" v-model="form.kind">
            <option v-for="kind in GOAL_KINDS" :key="kind.value" :value="kind.value">
              {{ kind.label }}
            </option>
          </select>
          <p class="hint">{{ selectedKind?.hint }}</p>
        </div>

        <div v-if="targetIsMonths" class="field">
          <label for="g-months">จำนวนเดือน</label>
          <input id="g-months" v-model.number="form.target" type="number" min="1" max="60" step="1" />
          <p class="hint">
            โหมด{{ ledger.definition.label }}แนะนำ {{ ledger.definition.recommendedRunwayMonths }} เดือน
          </p>
        </div>
        <MoneyField v-else v-model="form.target" label="จำนวนเงินเป้าหมาย" />

        <div class="field">
          <label for="g-deadline">กำหนดเสร็จ</label>
          <input id="g-deadline" v-model="form.deadline" type="date" />
          <p class="hint">ไม่บังคับ</p>
        </div>

        <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
          {{ saving ? 'กำลังบันทึก...' : 'เพิ่มเป้าหมาย' }}
        </button>
      </form>
    </aside>
  </div>
</template>
