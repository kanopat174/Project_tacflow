<script setup lang="ts">
/**
 * เอกสารสรุปภาษีสำหรับพิมพ์หรือบันทึกเป็น PDF
 *
 * ใช้กลไก print ของเบราว์เซอร์แทนไลบรารีสร้าง PDF เพราะข้อความภาษาไทย
 * ต้องฝังฟอนต์เองถ้าใช้ไลบรารี ซึ่งทำให้ไฟล์ใหญ่และตัดคำผิด
 * เบราว์เซอร์เรนเดอร์ภาษาไทยได้ถูกต้องอยู่แล้ว และผู้ใช้เลือก "บันทึกเป็น PDF" ได้จากกล่องพิมพ์
 *
 * ย้ายเอกสารไปไว้ใต้ <body> ด้วย Teleport เพื่อให้ตอนพิมพ์ซ่อนทั้งแอปด้วย display:none ได้
 * ถ้าปล่อยไว้ในหน้า เนื้อหาที่ซ่อนจะยังกินความสูงและทำให้เกิดหน้ากระดาษว่างต่อท้าย
 */
import { thaiDate } from '@/services/taxEngine'

export interface DocumentRow {
  label: string
  value: string
  /** เน้นเป็นบรรทัดสรุป */
  strong?: boolean
  /** บรรทัดที่หักออก แสดงเป็นสีจาง */
  muted?: boolean
}

export interface DocumentSection {
  title: string
  rows: DocumentRow[]
}

defineProps<{
  title: string
  subtitle?: string
  reference?: string
  headlineLabel: string
  headlineValue: string
  sections: DocumentSection[]
  note?: string
}>()

const printedAt = new Date().toISOString()
</script>

<template>
  <Teleport to="body">
    <article class="tax-document">
    <header class="doc-head">
      <div class="doc-brand">
        <span class="doc-mark">T</span>
        <span>
          <strong>TaxFlow</strong>
          <small>เอกสารสรุปการคำนวณภาษี</small>
        </span>
      </div>
      <div class="doc-meta">
        <div><span>วันที่ออกเอกสาร</span><b>{{ thaiDate(printedAt) }}</b></div>
        <div v-if="reference"><span>เลขอ้างอิง</span><b>{{ reference }}</b></div>
      </div>
    </header>

    <h1 class="doc-title">{{ title }}</h1>
    <p v-if="subtitle" class="doc-subtitle">{{ subtitle }}</p>

    <div class="doc-headline">
      <span>{{ headlineLabel }}</span>
      <strong>{{ headlineValue }}</strong>
    </div>

    <section v-for="section in sections" :key="section.title" class="doc-section">
      <h2>{{ section.title }}</h2>
      <table>
        <tbody>
          <tr v-for="row in section.rows" :key="row.label" :class="{ strong: row.strong }">
            <th>{{ row.label }}</th>
            <td :class="{ muted: row.muted }">{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="doc-foot">
      <p v-if="note">{{ note }}</p>
      <p>
        เอกสารนี้จัดทำโดยระบบ TaxFlow ซึ่งเป็นโปรเจกต์เพื่อการศึกษา ไม่ใช่เอกสารของกรมสรรพากร
        และไม่สามารถใช้อ้างอิงทางกฎหมายได้ ตัวเลขทั้งหมดเป็นการประมาณการจากข้อมูลที่ผู้ใช้กรอกเอง
      </p>
    </footer>
    </article>
  </Teleport>
</template>
