<script setup lang="ts">
/**
 * เริ่มต้นใช้งานด้วย 5 คำถาม — ตอบแล้วระบบสร้างสมุด เติมแบบร่างภาษี และบอกสิ่งที่ควรทำต่อ
 * ข้ามได้ทุกเมื่อ และไม่เขียนทับแบบร่างที่มีเงินได้อยู่แล้วโดยไม่ถาม
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import Mascot from '@/components/Mascot.vue'
import MoneyField from '@/components/MoneyField.vue'
import { ApiError, api } from '@/services/api'
import { buildOnboardingPlan, type Holding, type MainGoal, type OnboardingAnswers, type OnboardingPlan, type WorkKind } from '@/services/onboarding'
import { formatBaht } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'
import { useGameStore } from '@/stores/game'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const filing = useFilingStore()
const ledger = useLedgerStore()
const game = useGameStore()
const toast = useToastStore()

const STEPS = 5
const step = ref(1)
const answers = reactive<OnboardingAnswers>({
  work: 'employee',
  monthlyIncome: 25_000,
  married: false,
  spouseHasIncome: true,
  children: 0,
  parents: 0,
  holdings: ['socialSecurity'],
  goal: 'refund',
})

const WORK_OPTIONS: { value: WorkKind; label: string; emoji: string }[] = [
  { value: 'employee', label: 'พนักงานประจำ', emoji: '💼' },
  { value: 'freelancer', label: 'ฟรีแลนซ์', emoji: '🎨' },
  { value: 'seller', label: 'ค้าขาย / ร้านค้า', emoji: '🛍️' },
  { value: 'company', label: 'มีบริษัท', emoji: '🏢' },
  { value: 'investor', label: 'นักลงทุน', emoji: '📈' },
  { value: 'trader', label: 'เทรดเดอร์', emoji: '📊' },
]
const HOLDING_OPTIONS: { value: Holding; label: string }[] = [
  { value: 'socialSecurity', label: 'ประกันสังคม' },
  { value: 'providentFund', label: 'กองทุนสำรองเลี้ยงชีพ' },
  { value: 'lifeInsurance', label: 'ประกันชีวิต' },
  { value: 'healthInsurance', label: 'ประกันสุขภาพ' },
  { value: 'retirementFund', label: 'RMF / Thai ESG' },
  { value: 'mortgage', label: 'ผ่อนบ้าน' },
]
const GOAL_OPTIONS: { value: MainGoal; label: string; emoji: string }[] = [
  { value: 'refund', label: 'เสียภาษีให้น้อยลง / ได้เงินคืน', emoji: '💸' },
  { value: 'save', label: 'เก็บเงินให้ได้มากขึ้น', emoji: '🐷' },
  { value: 'organise', label: 'จัดระเบียบรายรับรายจ่าย', emoji: '🗂️' },
]

function toggleHolding(h: Holding) {
  answers.holdings = answers.holdings.includes(h) ? answers.holdings.filter((x) => x !== h) : [...answers.holdings, h]
}

const plan = computed<OnboardingPlan>(() => buildOnboardingPlan(answers))
const saving = ref(false)
const finished = ref(false)

async function finish() {
  // แบบร่างที่กรอกเงินได้ไว้แล้ว ถามก่อนเขียนทับ
  const hasDraft = filing.result.grossIncome > 0
  const overwrite = !hasDraft || confirm('มีแบบร่างภาษีที่กรอกไว้แล้ว ต้องการเติมตัวเลขจากคำตอบทับหรือไม่?')
  saving.value = true
  try {
    const p = plan.value
    const workspace = await ledger.createWorkspace({ name: p.workspace.name, mode: p.workspace.mode, capital: 0 })
    if (p.goal) await api.addGoal(workspace.id, { ...p.goal, deadline: '' })

    if (overwrite) {
      filing.taxpayer.maritalStatus = p.maritalStatus
      for (const [key, amount] of Object.entries(p.income)) filing.income[key] = amount
      for (const [key, amount] of Object.entries(p.deductions)) filing.deductions[key] = amount
      filing.dependents.children = p.dependents.children
      filing.dependents.parents = p.dependents.parents
      filing.prefillFromAccount()
    }
    game.scheduleRefresh(0)
    finished.value = true
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container" style="max-width: 720px">
      <div class="section-head" style="text-align: center">
        <Mascot :size="96" :say="finished ? 'เย้! พร้อมลุยแล้ว' : 'สวัสดี! ตอบไม่กี่ข้อพอนะ'" />
        <span class="eyebrow">{{ finished ? 'พร้อมแล้ว!' : `คำถาม ${step} จาก ${STEPS}` }}</span>
        <h2>{{ finished ? 'ตั้งค่าเรียบร้อย มาเริ่มกันเลย' : 'มารู้จักกันหน่อย' }}</h2>
        <p v-if="!finished">ตอบ 5 ข้อ ใช้เวลาไม่ถึงนาที แล้วระบบจัดสมุดและแบบร่างภาษีให้ แก้ทีหลังได้ทุกอย่าง</p>
      </div>

      <div v-if="!finished" class="cap-bar mb-3"><span :style="{ width: `${(step / STEPS) * 100}%` }"></span></div>

      <!-- คำถาม -->
      <section v-if="!finished" class="card">
        <template v-if="step === 1">
          <h3>ทำงานแบบไหน</h3>
          <div class="choice-grid">
            <button
              v-for="o in WORK_OPTIONS"
              :key="o.value"
              type="button"
              class="choice"
              :class="{ selected: answers.work === o.value }"
              :aria-pressed="answers.work === o.value"
              @click="answers.work = o.value"
            >
              <span class="choice-emoji" aria-hidden="true">{{ o.emoji }}</span>
              {{ o.label }}
            </button>
          </div>
        </template>

        <template v-else-if="step === 2">
          <h3>รายได้ต่อเดือนประมาณเท่าไร</h3>
          <p class="muted">ไม่ต้องเป๊ะ ใช้คาดการณ์ภาษีทั้งปีเท่านั้น</p>
          <MoneyField v-model="answers.monthlyIncome" label="รายได้ต่อเดือน" />
          <p class="small muted">ทั้งปีราว {{ formatBaht(answers.monthlyIncome * 12) }}</p>
        </template>

        <template v-else-if="step === 3">
          <h3>ครอบครัว</h3>
          <label class="check mb-2">
            <input v-model="answers.married" type="checkbox" />
            <span>จดทะเบียนสมรสแล้ว</span>
          </label>
          <label v-if="answers.married" class="check mb-2">
            <input v-model="answers.spouseHasIncome" type="checkbox" />
            <span>คู่สมรสมีเงินได้ของตัวเอง</span>
          </label>
          <div class="field-grid">
            <div class="field">
              <label for="w-children">ลูกที่ใช้สิทธิลดหย่อนได้ (คน)</label>
              <input id="w-children" v-model.number="answers.children" type="number" min="0" max="20" />
            </div>
            <div class="field">
              <label for="w-parents">พ่อแม่อายุ 60+ ที่ดูแล (คน)</label>
              <input id="w-parents" v-model.number="answers.parents" type="number" min="0" max="4" />
            </div>
          </div>
        </template>

        <template v-else-if="step === 4">
          <h3>มีอะไรเหล่านี้บ้าง</h3>
          <p class="muted">เลือกได้หลายข้อ — ยอดจริงค่อยใส่ทีหลัง</p>
          <div class="chip-row">
            <button
              v-for="o in HOLDING_OPTIONS"
              :key="o.value"
              type="button"
              class="chip"
              :class="{ selected: answers.holdings.includes(o.value) }"
              :aria-pressed="answers.holdings.includes(o.value)"
              @click="toggleHolding(o.value)"
            >
              {{ o.label }}
            </button>
          </div>
        </template>

        <template v-else>
          <h3>อยากให้ Jodwise ช่วยเรื่องไหนมากที่สุด</h3>
          <div class="choice-grid">
            <button
              v-for="o in GOAL_OPTIONS"
              :key="o.value"
              type="button"
              class="choice"
              :class="{ selected: answers.goal === o.value }"
              :aria-pressed="answers.goal === o.value"
              @click="answers.goal = o.value"
            >
              <span class="choice-emoji" aria-hidden="true">{{ o.emoji }}</span>
              {{ o.label }}
            </button>
          </div>
        </template>

        <div class="row mt-3" style="justify-content: space-between; gap: 8px">
          <button v-if="step > 1" class="btn btn-ghost" type="button" @click="step--">
            <AppIcon name="arrowLeft" :size="17" />
            ย้อนกลับ
          </button>
          <RouterLink v-else class="btn btn-ghost" to="/dashboard">ข้ามไปก่อน</RouterLink>
          <button v-if="step < STEPS" class="btn btn-primary" type="button" @click="step++">
            ถัดไป
            <AppIcon name="arrowRight" :size="17" />
          </button>
          <button v-else class="btn btn-primary" type="button" :disabled="saving" @click="finish">
            {{ saving ? 'กำลังจัดให้...' : 'เสร็จแล้ว จัดให้เลย' }}
          </button>
        </div>
      </section>

      <!-- ผลลัพธ์ -->
      <template v-else>
        <section class="card">
          <h3>ทำให้แล้ว</h3>
          <ul class="done-list">
            <li>✅ สร้างสมุด "{{ plan.workspace.name }}"</li>
            <li v-if="Object.keys(plan.income).length">✅ เติมเงินได้ราว {{ formatBaht(Object.values(plan.income).reduce((s, n) => s + n, 0)) }} ในแบบร่างภาษี</li>
            <li v-if="plan.goal">✅ ตั้งเป้าหมาย "{{ plan.goal.name }}"</li>
          </ul>
        </section>
        <section class="card">
          <h3>ทำต่อทีละข้อ</h3>
          <ol class="todo-list">
            <li v-for="t in plan.todos" :key="t.title">
              <RouterLink :to="t.to"><b>{{ t.title }}</b></RouterLink>
              <small class="muted">{{ t.detail }}</small>
            </li>
          </ol>
          <RouterLink class="btn btn-primary btn-block mt-2" to="/dashboard">ไปแดชบอร์ด</RouterLink>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.choice-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
  margin-top: 12px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.choice.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.choice-emoji {
  font-size: 1.6rem;
}
.done-list,
.todo-list {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: 10px;
}
.done-list {
  list-style: none;
  padding-left: 0;
}
.todo-list li {
  display: grid;
  gap: 2px;
}
</style>
