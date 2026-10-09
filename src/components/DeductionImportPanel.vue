<script setup lang="ts">
/**
 * ดึงค่าลดหย่อนอัตโนมัติจากสมุดบัญชี กองทุนที่จดไว้ และแบบภาษีปีก่อน
 * แสดงตัวอย่างให้ตรวจและเลือกก่อนเสมอ ผู้ใช้กดยืนยันแล้วจึงเขียนทับช่องที่เลือก
 */
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { ApiError, api } from '@/services/api'
import {
  buildDeductionImport,
  previousYearFiling,
  type DeductionImport,
  type DeductionSourceKind,
} from '@/services/deductionImport'
import { loadFunds } from '@/services/fundHoldings'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ taxYear: string }>()
const emit = defineEmits<{ apply: [amounts: Record<string, number>] }>()

const auth = useAuthStore()
const toast = useToastStore()
const loading = ref(false)
const preview = ref<DeductionImport | null>(null)
const chosen = reactive<Record<string, boolean>>({})

const SOURCE_LABEL: Record<DeductionSourceKind, string> = {
  ledger: 'สมุดบัญชี',
  funds: 'กองทุนที่จด',
  lastYear: 'ยกมาจากปีก่อน',
}
const SOURCE_BADGE: Record<DeductionSourceKind, string> = {
  ledger: 'badge-ok',
  funds: 'badge-accent',
  lastYear: 'badge-warn',
}

const selected = computed(() => preview.value?.lines.filter((l) => chosen[l.key]) ?? [])

watch(
  () => props.taxYear,
  () => (preview.value = null),
)

async function load() {
  if (!auth.user) return
  loading.value = true
  try {
    const [workspaces, entries, filings] = await Promise.all([api.workspaces(), api.allEntries(), api.filings()])
    const last = previousYearFiling(filings, props.taxYear)
    const lastDeductions = (last?.snapshot as { deductions?: Record<string, number> } | undefined)?.deductions
    preview.value = buildDeductionImport({
      workspaces,
      entries,
      taxYearBE: props.taxYear,
      fundLots: loadFunds(auth.user.id).lots,
      lastYear: last && lastDeductions ? { taxYear: last.taxYear, deductions: lastDeductions } : null,
    })
    for (const key of Object.keys(chosen)) delete chosen[key]
    // ยอดจากปีก่อนเป็นการประมาณ ไม่เลือกไว้ให้ ผู้ใช้ต้องติ๊กเองเมื่อแน่ใจว่าปีนี้ยังจ่ายเท่าเดิม
    for (const line of preview.value.lines) chosen[line.key] = line.source !== 'lastYear'
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'รวบรวมค่าลดหย่อนไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

function apply() {
  if (!selected.value.length) return
  emit('apply', Object.fromEntries(selected.value.map((l) => [l.key, l.amount])))
  toast.success(`เติมค่าลดหย่อน ${selected.value.length} รายการแล้ว ระบบจะตัดเพดานให้อัตโนมัติ`)
  preview.value = null
}
</script>

<template>
  <section class="card import-panel" data-test="deduction-import">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="spark" :size="19" />
          ดึงค่าลดหย่อนอัตโนมัติ
        </h3>
        <p>
          รวมเบี้ยประกัน ประกันสังคม และกองทุนลดหย่อนปี {{ taxYear }} จากสมุดบัญชีและหน้ากองทุนของฉัน
          พร้อมรายการที่มักเท่าเดิมจากแบบภาษีปีก่อน
        </p>
      </div>
      <button v-if="!preview" class="btn btn-ghost btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? 'กำลังรวบรวม...' : 'ดูค่าลดหย่อนที่พบ' }}
      </button>
    </div>

    <template v-if="preview">
      <div v-if="!preview.lines.length && !preview.skipped.length" class="notice">
        <strong>ไม่พบค่าลดหย่อนในปี {{ taxYear }}</strong>
        บันทึกเบี้ยประกันในหมวด "เบี้ยประกัน" หรือกองทุนในหมวด "ออมและลงทุน" พร้อมรายละเอียด เช่น "ประกันชีวิต" "RMF"
        หรือจดการซื้อกองทุนที่ <RouterLink to="/funds">กองทุนลดหย่อนของฉัน</RouterLink>
      </div>

      <div v-if="preview.lines.length" class="table-wrap table-fit">
        <table>
          <thead>
            <tr>
              <th>ใช้</th>
              <th>ค่าลดหย่อน</th>
              <th>มาจาก</th>
              <th class="right">ยอด</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in preview.lines" :key="line.key">
              <td>
                <input v-model="chosen[line.key]" type="checkbox" :aria-label="`ใช้ ${line.label}`" />
              </td>
              <td>
                <strong>{{ line.label }}</strong>
                <span class="badge" :class="SOURCE_BADGE[line.source]" style="margin-left: 6px">
                  {{ SOURCE_LABEL[line.source] }}
                </span>
              </td>
              <td class="small muted">
                <div v-for="source in line.sources" :key="source.kind + source.detail">
                  {{ source.detail }} {{ formatBaht(source.amount) }}
                </div>
              </td>
              <td class="money">{{ formatBaht(line.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="preview.skipped.length" class="notice notice-warn mt-2">
        <strong>รายการที่ไม่ได้ดึงมาให้</strong>
        <ul class="skipped-list">
          <li v-for="row in preview.skipped" :key="row.note + row.reason">
            {{ row.note }} {{ formatBaht(row.amount) }} — {{ row.reason }}
          </li>
        </ul>
      </div>

      <div class="row mt-2" style="justify-content: flex-end; gap: 8px">
        <button class="btn btn-ghost btn-sm" type="button" @click="preview = null">ยกเลิก</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="!selected.length" @click="apply">
          ใช้ {{ selected.length }} รายการที่เลือก
        </button>
      </div>
      <p class="small muted mt-1">
        ช่องที่เลือกจะถูกเขียนทับ ช่องอื่นคงค่าเดิม ยอด "ยกมาจากปีก่อน" เป็นการประมาณ ติ๊กเมื่อแน่ใจว่าปีนี้จ่ายเท่าเดิม
        และตรวจกับหนังสือรับรองจากบริษัทประกันหรือ บลจ. ก่อนยื่นจริง
      </p>
    </template>
  </section>
</template>
