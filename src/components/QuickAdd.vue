<script setup lang="ts">
/**
 * ปุ่ม + บันทึกรายการด่วนจากหน้าไหนก็ได้
 *  - พิมพ์เป็นประโยค เช่น "กาแฟ 65" หรือ "เงินเดือน 30000 เมื่อวาน" ระบบแยกยอด วันที่ และหมวดให้
 *  - รายการที่จดบ่อยขึ้นเป็นปุ่มให้กดเลือก ไม่ต้องพิมพ์ซ้ำ
 *  - จำสมุดเล่มล่าสุด และหมวดล่าสุดของแต่ละเล่ม
 * ถ้าเปิดสมุดอยู่จะบันทึกลงเล่มนั้นและแสดงในรายการทันที
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import MoneyField from './MoneyField.vue'
import { categoriesOf, categoryLabel, type EntryType } from '@/data/workspaceModes'
import { ApiError, api } from '@/services/api'
import { frequentEntries, type FrequentEntry } from '@/services/frequentEntries'
import { guessCategory } from '@/services/ledgerCsv'
import { parseQuickEntry } from '@/services/quickParse'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useFx } from '@/composables/useFx'

const LAST_KEY = 'taxflow_quick_workspace'
const CATEGORY_KEY = 'taxflow_quick_category'

const auth = useAuthStore()
const ledger = useLedgerStore()
const game = useGameStore()
const toast = useToastStore()
const fx = useFx()
const ui = useUiStore()

const open = computed({
  get: () => ui.quickAddOpen,
  set: (value: boolean) => (ui.quickAddOpen = value),
})
const saving = ref(false)
const panel = ref<HTMLElement | null>(null)
const sentenceInput = ref<HTMLInputElement | null>(null)
const sentence = ref('')
const form = reactive({ workspaceId: '', type: 'expense' as EntryType, amount: 0, categoryKey: '', note: '', date: localToday() })

const workspaces = computed(() => ledger.workspaces)
const workspace = computed(() => workspaces.value.find((w) => w.id === form.workspaceId) ?? null)
const categories = computed(() => (workspace.value ? categoriesOf(workspace.value.mode, form.type) : []))

/* ---------- จำค่าที่ใช้ล่าสุด ---------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ไม่จำก็ไม่เป็นไร */
  }
}
const lastCategories = ref<Record<string, string>>(readJson(CATEGORY_KEY, {}))

// เปลี่ยนประเภทหรือเล่มแล้วหมวดเดิมอาจไม่มี ใช้หมวดล่าสุดของเล่มนั้น ไม่มีก็หมวดแรก
watch([categories], () => {
  if (categories.value.some((c) => c.key === form.categoryKey)) return
  const remembered = lastCategories.value[`${form.workspaceId}:${form.type}`]
  form.categoryKey = categories.value.some((c) => c.key === remembered) ? remembered! : (categories.value[0]?.key ?? '')
})

/* ---------- พิมพ์เป็นประโยค ---------- */

const parsed = computed(() =>
  workspace.value && sentence.value.trim() ? parseQuickEntry(sentence.value, workspace.value.mode, localToday()) : null,
)

// พิมพ์แล้วเติมฟอร์มให้ทันที ผู้ใช้ยังแก้ช่องไหนก็ได้ก่อนกดบันทึก
watch(parsed, (p) => {
  if (!p) return
  form.type = p.type
  form.amount = p.amount
  form.date = p.date
  form.note = p.note
  // รอให้รายการหมวดของประเภทใหม่คำนวณก่อน แล้วค่อยตั้งหมวดที่เดาได้
  void nextTick(() => {
    if (p.categoryKey !== 'otherIncome' && p.categoryKey !== 'otherExpense') form.categoryKey = p.categoryKey
  })
})

/* ---------- รายการที่จดบ่อย ---------- */

const frequent = computed(() =>
  form.workspaceId
    ? frequentEntries(
        game.entries.filter((e) => e.workspaceId === form.workspaceId),
        localToday(),
      )
    : [],
)

function useFrequent(item: FrequentEntry) {
  sentence.value = ''
  form.type = item.type
  form.amount = item.amount
  form.note = item.note
  form.date = localToday()
  void nextTick(() => (form.categoryKey = item.categoryKey))
}

/* ---------- ถ่ายใบเสร็จ ---------- */

const receiptInput = ref<HTMLInputElement | null>(null)
const receiptFile = ref<File | null>(null)
const reading = ref(false)
const readStatus = ref('')

async function pickReceipt(files: FileList | null) {
  const file = files?.[0]
  if (receiptInput.value) receiptInput.value.value = ''
  if (!file || !workspace.value) return
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    toast.error('รองรับรูป JPG, PNG และ WebP')
    return
  }
  reading.value = true
  receiptFile.value = file
  try {
    // ตัวอ่าน OCR โหลดเฉพาะตอนถ่ายใบเสร็จครั้งแรก
    const [{ readImageText }, { parseReceipt }] = await Promise.all([
      import('@/services/certificateReader'),
      import('@/services/receiptParse'),
    ])
    const text = await readImageText(file, (status, progress) => {
      readStatus.value = `${status} ${Math.round(progress * 100)}%`
    })
    const guess = parseReceipt(text, localToday())
    sentence.value = ''
    form.type = 'expense'
    if (guess.amount) form.amount = guess.amount
    if (guess.date) form.date = guess.date
    if (guess.merchant) form.note = guess.merchant
    const key = guessCategory(guess.merchant, 'expense', workspace.value.mode)
    void nextTick(() => {
      if (key !== 'otherExpense') form.categoryKey = key
    })
    if (guess.amount) toast.success('อ่านใบเสร็จแล้ว ตรวจยอดก่อนบันทึกนะ')
    else toast.error('หายอดรวมในใบเสร็จไม่เจอ กรอกยอดเองได้ รูปจะแนบเป็นหลักฐานให้')
  } catch {
    toast.error('อ่านรูปไม่สำเร็จ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย รูปยังแนบเป็นหลักฐานได้')
  } finally {
    reading.value = false
  }
}

/** แนบรูปใบเสร็จเป็นหลักฐานของรายการที่เพิ่งบันทึก — แนบไม่สำเร็จไม่ทำให้รายการหาย */
async function attachReceipt(workspaceId: string, entryId: string, date: string): Promise<boolean> {
  const file = receiptFile.value
  if (!file) return false
  try {
    const { compressImage } = await import('@/services/imageCompress')
    const { blob } = await compressImage(file)
    const record = await api.addEvidence(
      workspaceId,
      { entryId, date, direction: 'expense', kind: 'receipt', name: file.name, size: blob.size, mimeType: blob.type || file.type, note: '' },
      blob,
    )
    if (ledger.active?.id === workspaceId) ledger.evidence.push(record)
    return true
  } catch {
    toast.error('บันทึกรายการแล้ว แต่แนบรูปใบเสร็จไม่สำเร็จ')
    return false
  }
}

/* ---------- เปิด ปิด บันทึก ---------- */

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    await prepare()
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

async function prepare() {
  form.date = localToday()
  sentence.value = ui.quickAddText
  ui.quickAddText = ''
  receiptFile.value = null
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
  sentenceInput.value?.focus()
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
    const attached = await attachReceipt(workspace.value.id, created.id, form.date)
    receiptFile.value = null
    game.scheduleRefresh()
    writeLocal(LAST_KEY, workspace.value.id)
    lastCategories.value = { ...lastCategories.value, [`${workspace.value.id}:${form.type}`]: form.categoryKey }
    writeLocal(CATEGORY_KEY, JSON.stringify(lastCategories.value))
    toast.success(
      `บันทึก${form.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${formatBaht(form.amount)} ลง "${workspace.value.name}" แล้ว` +
        (attached ? ' พร้อมรูปใบเสร็จ' : ''),
    )
    fx.entrySaved(form.type, form.amount)
    form.amount = 0
    form.note = ''
    sentence.value = ''
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
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- เปิดจากปุ่ม "บันทึกรายการ" ในเมนูด้านข้าง ปุ่ม + บนแถบล่างของมือถือ หรือ Ctrl+K -->
  <div v-if="auth.isLoggedIn" class="quick-add no-print">

    <Transition name="guide-pop">
      <div v-if="open" class="modal-backdrop quick-backdrop" @click.self="close">
        <section ref="panel" class="modal quick-panel" role="dialog" aria-modal="true" aria-labelledby="quick-title">
          <div class="card-head">
            <div>
              <h3 id="quick-title">บันทึกด่วน</h3>
              <p>พิมพ์เป็นประโยคก็ได้ แล้วกด Enter</p>
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
            <div class="field">
              <label for="q-sentence">พิมพ์สั้น ๆ</label>
              <input
                id="q-sentence"
                ref="sentenceInput"
                v-model="sentence"
                type="text"
                autocomplete="off"
                placeholder="เช่น กาแฟ 65 · ค่าไฟ 1,200 เมื่อวาน · +30000 เงินเดือน"
              />
              <p class="hint" aria-live="polite">
                <template v-if="parsed && workspace">
                  {{ parsed.type === 'income' ? 'รายรับ' : 'รายจ่าย' }} {{ formatBaht(parsed.amount) }} ·
                  {{ categoryLabel(workspace.mode, form.categoryKey) }} · {{ thaiDate(parsed.date) }}
                </template>
                <template v-else-if="sentence.trim()">ยังไม่เจอจำนวนเงิน ใส่ตัวเลขด้วย เช่น "ข้าว 60"</template>
                <template v-else>หรือกรอกช่องด้านล่างเองก็ได้</template>
              </p>
            </div>

            <div class="row mb-2" style="gap: 8px; flex-wrap: wrap; align-items: center">
              <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
                <AppIcon name="camera" :size="15" />
                {{ reading ? readStatus || 'กำลังอ่าน...' : receiptFile ? 'ถ่ายใบใหม่' : 'ถ่ายใบเสร็จ' }}
                <input
                  ref="receiptInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  class="sr-only"
                  :disabled="reading"
                  @change="pickReceipt(($event.target as HTMLInputElement).files)"
                />
              </label>
              <small v-if="receiptFile && !reading" class="muted">📎 แนบ {{ receiptFile.name }} เป็นหลักฐาน</small>
            </div>

            <div v-if="frequent.length" class="chip-row mb-2" aria-label="รายการที่จดบ่อย">
              <button
                v-for="item in frequent"
                :key="`${item.type}${item.categoryKey}${item.amount}`"
                type="button"
                class="chip"
                :title="`จดไปแล้ว ${item.count} ครั้งใน 90 วัน`"
                @click="useFrequent(item)"
              >
                {{ item.note || (workspace ? categoryLabel(workspace.mode, item.categoryKey) : '') }} {{ formatBaht(item.amount) }}
              </button>
            </div>

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
