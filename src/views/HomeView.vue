<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { calculateTax, formatBaht, formatPercent } from '@/services/taxEngine'
import { TAX_BRACKETS } from '@/data/taxData'

/* ตัวอย่างสดในหน้าแรก: เลื่อนเงินเดือนแล้วเห็นภาษีเปลี่ยนทันที ไม่ต้องสมัครสมาชิกก่อน */
const monthlySalary = ref(45_000)

const preview = computed(() =>
  calculateTax(
    { salary: monthlySalary.value * 12 },
    { personal: 60_000, socialSecurity: 9_000 },
    0,
  ),
)

const JOURNEY = [
  {
    n: '01',
    title: 'ประเมินภาษีล่วงหน้า',
    text: 'ใส่เงินได้คร่าว ๆ ในเครื่องคำนวณ รู้ยอดภาษีทั้งปีภายในไม่กี่วินาที',
  },
  {
    n: '02',
    title: 'วางแผนค่าลดหย่อน',
    text: 'ดูสิทธิลดหย่อนทุกรายการพร้อมเพดาน แล้วลองใส่ตัวเลขดูว่าประหยัดภาษีได้เท่าไร',
  },
  {
    n: '03',
    title: 'เตรียมเอกสาร',
    text: 'จัดเก็บ 50 ทวิ ใบเสร็จประกัน และหนังสือรับรองกองทุนไว้ที่เดียว แยกตามปีภาษี',
  },
  {
    n: '04',
    title: 'สรุปแบบแล้วยื่นเองที่ e-Filing',
    text: 'กรอกแบบ 4 ขั้นตอน ได้ตัวเลขพร้อมกรอก แล้วนำไปยื่นด้วยตัวเองที่ระบบ e-Filing ของกรมสรรพากร',
  },
]

const FEATURES = [
  {
    icon: 'calculator',
    title: 'คำนวณตามกฎหมายจริง',
    text: 'หักค่าใช้จ่ายแยกตามมาตรา 40(1)–40(8) และคิดภาษีตามอัตราขั้นบันได 8 ขั้น',
  },
  {
    icon: 'shield',
    title: 'ตัดเพดานให้อัตโนมัติ',
    text: 'เพดานรวมกองทุนเกษียณ 500,000 บาท ประกันชีวิต 100,000 บาท และเงินบริจาค 10% ระบบคุมให้เอง',
  },
  {
    icon: 'chart',
    title: 'เห็นที่มาของตัวเลขทุกบรรทัด',
    text: 'แจกแจงภาษีรายขั้น บอกอัตราภาษีที่แท้จริงและขั้นสูงสุดที่เงินได้ของคุณไปถึง',
  },
  {
    icon: 'folder',
    title: 'เก็บเอกสารและประวัติย้อนหลัง',
    text: 'แนบเอกสารแยกตามปีภาษี และเปิดดูสรุปแบบภาษีที่บันทึกไว้ได้ทุกเมื่อ',
  },
  {
    icon: 'wallet',
    title: 'สมุดบัญชี 6 โหมด',
    text: 'บันทึกรายรับรายจ่ายแยกตามการใช้งาน ตั้งเป้าหมาย และดูว่าเงินทุนอยู่ได้อีกกี่เดือน',
  },
]
</script>

<template>
  <main id="main-content" tabindex="-1">
    <!-- Hero: ข้อความหลัก + เครื่องคำนวณย่อที่ลองเล่นได้ทันที -->
    <section class="hero">
      <div class="container inner">
        <div>
          <span class="eyebrow">ปีภาษี 2568</span>
          <h1>ยื่นภาษี<em>ไม่ต้องเดา</em><br />รู้ยอดจริงก่อนกดส่ง</h1>
          <p class="lede">
            TaxFlow คำนวณภาษีเงินได้บุคคลธรรมดาตามอัตราขั้นบันไดจริง หักค่าใช้จ่ายตามประเภทเงินได้
            คุมเพดานค่าลดหย่อนให้อัตโนมัติ แล้วพาคุณไปจนถึงหน้ายื่นแบบในขั้นตอนเดียวกัน
          </p>
          <div class="cta-row">
            <RouterLink class="btn btn-primary" to="/calculator/personal">
              ลองคำนวณภาษี
              <AppIcon name="arrowRight" :size="18" />
            </RouterLink>
            <RouterLink class="btn btn-ghost" to="/deductions">ดูสิทธิลดหย่อนทั้งหมด</RouterLink>
          </div>

          <div class="stat-ticker">
            <div>
              <span>อัตราภาษีขั้นบันได</span>
              <b>8 ขั้น</b>
            </div>
            <div>
              <span>ประเภทเงินได้ที่รองรับ</span>
              <b>40(1)–40(8)</b>
            </div>
            <div>
              <span>รายการลดหย่อน</span>
              <b>18 รายการ</b>
            </div>
          </div>
        </div>

        <!-- การ์ดตัวอย่าง: ลากแถบเงินเดือนแล้วตัวเลขขยับตาม -->
        <div class="hero-preview">
          <div class="cap">
            <span class="eyebrow" style="margin: 0">ลองเลื่อนดู</span>
            <span class="badge badge-accent">มนุษย์เงินเดือน</span>
          </div>

          <div class="field">
            <label for="hero-salary">
              เงินเดือน <span class="num text-accent">{{ formatBaht(monthlySalary) }}</span> ต่อเดือน
            </label>
            <input
              id="hero-salary"
              v-model.number="monthlySalary"
              type="range"
              min="15000"
              max="300000"
              step="5000"
            />
            <p class="hint">คิดจากเงินเดือนอย่างเดียว หักค่าลดหย่อนส่วนตัวและประกันสังคมให้แล้ว</p>
          </div>

          <div class="headline">
            <span>ภาษีที่ต้องเสียทั้งปี</span>
            <strong class="num">{{ formatBaht(preview.tax) }}</strong>
          </div>

          <div class="price-lines">
            <div class="price-line">
              <span class="lbl">เงินได้ทั้งปี</span>
              <span class="val">{{ formatBaht(preview.grossIncome) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">หัก ค่าใช้จ่าย</span>
              <span class="val">− {{ formatBaht(preview.totalExpense) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">หัก ค่าลดหย่อน</span>
              <span class="val">− {{ formatBaht(preview.usedDeduction) }}</span>
            </div>
            <div class="price-line total">
              <span class="lbl">เงินได้สุทธิ</span>
              <span class="val">{{ formatBaht(preview.netIncome) }}</span>
            </div>
          </div>

          <p class="small muted mt-2">
            อัตราภาษีที่แท้จริง {{ formatPercent(preview.effectiveRate) }} · ขั้นสูงสุดที่ถึง
            {{ formatPercent(preview.marginalRate, 0) }}
          </p>
        </div>
      </div>
    </section>

    <!-- ขั้นตอนการใช้งาน -->
    <section class="section">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">How it works</span>
          <h2>4 ขั้นตอน ตั้งแต่ประเมินจนได้เงินคืน</h2>
          <p>ทุกขั้นตอนอยู่ในเว็บเดียว ข้อมูลที่กรอกไว้ส่งต่อกันได้ไม่ต้องพิมพ์ซ้ำ</p>
        </div>
        <div class="journey-strip">
          <div v-for="step in JOURNEY" :key="step.n" class="jstep">
            <span class="n">{{ step.n }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- จุดเด่นของระบบ -->
    <section class="section" style="padding-top: 0">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">Why TaxFlow</span>
          <h2>ตัวเลขที่ตรวจย้อนกลับได้</h2>
        </div>
        <div class="grid grid-4">
          <article v-for="feature in FEATURES" :key="feature.title" class="feature">
            <span class="ico"><AppIcon :name="feature.icon" :size="22" /></span>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.text }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ตารางอัตราภาษี -->
    <section class="section" style="padding-top: 0">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">Tax brackets</span>
          <h2>อัตราภาษีเงินได้บุคคลธรรมดา</h2>
          <p>
            ภาษีคิดเป็นขั้น ๆ ไม่ใช่เหมาทั้งก้อน — เงินได้สุทธิส่วนแรก 150,000 บาทได้รับยกเว้นเสมอ
            แม้รายได้ทั้งปีจะสูงแค่ไหนก็ตาม
          </p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เงินได้สุทธิ (บาท)</th>
                <th class="right">อัตราภาษี</th>
                <th class="right">ภาษีสูงสุดของขั้นนี้</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(bracket, index) in TAX_BRACKETS"
                :key="bracket.label"
                :class="{ 'active-row': preview.netIncome > (TAX_BRACKETS[index - 1]?.cap ?? 0) && preview.netIncome <= bracket.cap }"
              >
                <td>{{ bracket.label }}</td>
                <td class="money">{{ formatPercent(bracket.rate, 0) }}</td>
                <td class="money">
                  <template v-if="Number.isFinite(bracket.cap)">
                    {{ formatBaht((bracket.cap - (TAX_BRACKETS[index - 1]?.cap ?? 0)) * bracket.rate) }}
                  </template>
                  <template v-else>ไม่จำกัด</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="small muted mt-2">แถวที่ไฮไลต์คือขั้นที่เงินได้สุทธิจากตัวอย่างด้านบนตกอยู่</p>
      </div>
    </section>

    <!-- อะไรฟรี อะไรต้องสมัคร -->
    <section class="section" style="padding-top: 0">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">Free vs member</span>
          <h2>เปิดดูได้ทุกหน้า ใช้ฟรีเกือบทั้งหมด</h2>
          <p>
            เส้นแบ่งง่ายมาก อะไรที่แค่คำนวณให้ดูใช้ได้เลยไม่ต้องสมัคร
            ส่วนอะไรที่ต้องเก็บข้อมูลของคุณไว้จึงต้องมีบัญชี
          </p>
        </div>
        <div class="grid grid-2">
          <div class="card">
            <div class="card-head">
              <div>
                <h3>ใช้ได้เลย ไม่ต้องสมัคร</h3>
                <p>เปิดหน้าแล้วใช้ได้ทันที</p>
              </div>
              <span class="badge badge-ok">ฟรี</span>
            </div>
            <ul class="bullet-list">
              <li>เครื่องคำนวณภาษีทั้ง 6 หมวด</li>
              <li>คู่มือค่าลดหย่อนพร้อมเพดานทุกรายการ</li>
              <li>กรอกแบบยื่นภาษีเพื่อดูผลคำนวณ</li>
              <li>ออกใบสรุปการคำนวณเป็น PDF</li>
            </ul>
          </div>
          <div class="card">
            <div class="card-head">
              <div>
                <h3>ต้องมีบัญชี</h3>
                <p>เพราะต้องผูกข้อมูลไว้กับตัวคุณ</p>
              </div>
              <span class="badge badge-accent">สมาชิก</span>
            </div>
            <ul class="bullet-list">
              <li>บันทึกสรุปแบบภาษีและติดตามความคืบหน้าเอง</li>
              <li>เก็บเอกสารลดหย่อนแยกตามปีภาษี</li>
              <li>ประวัติแบบภาษีย้อนหลังทุกปี</li>
              <li>สมุดบัญชีรายรับรายจ่ายทั้ง 6 โหมด</li>
            </ul>
          </div>
        </div>
        <p class="small muted mt-2">
          ทุกหน้าเปิดดูได้แม้ยังไม่สมัคร ระบบจะขอให้เข้าสู่ระบบเฉพาะตอนที่กดปุ่มซึ่งต้องบันทึกข้อมูลเท่านั้น
        </p>
      </div>
    </section>

    <!-- ชวนเริ่มใช้งาน -->
    <section class="section" style="padding-top: 0">
      <div class="container">
        <div class="card text-center" style="padding: 48px 24px">
          <span class="eyebrow">พร้อมเริ่มแล้ว</span>
          <h2 style="font-size: clamp(22px, 3.2vw, 30px)">สมัครบัญชีเพื่อบันทึกแบบร่างและติดตามสถานะ</h2>
          <p class="muted mt-1" style="max-width: 52ch; margin-inline: auto">
            เครื่องคำนวณและคู่มือลดหย่อนใช้ได้เลยโดยไม่ต้องสมัคร
            แต่การบันทึกสรุปแบบและเก็บเอกสารต้องมีบัญชีเพื่อผูกข้อมูลกับตัวคุณ
          </p>
          <div class="cta-row mt-3" style="justify-content: center">
            <RouterLink class="btn btn-primary" to="/register">สมัครสมาชิกฟรี</RouterLink>
            <RouterLink class="btn btn-ghost" to="/login">เข้าสู่ระบบ</RouterLink>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
