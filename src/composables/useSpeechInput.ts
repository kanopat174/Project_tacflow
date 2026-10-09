/**
 * รับเสียงพูดภาษาไทยเป็นข้อความ — Web Speech API (Chrome/Edge/Android)
 * Safari บน iPhone รองรับไม่ครบ ปุ่มไมค์จึงซ่อนเมื่อเบราว์เซอร์ไม่มี API นี้
 * เสียงถูกส่งไปประมวลผลที่เซิร์ฟเวอร์ของผู้ผลิตเบราว์เซอร์ (เช่น Google) ไม่ได้ทำในเครื่อง
 */
import { onBeforeUnmount, ref } from 'vue'

interface RecognitionResult {
  0: { transcript: string }
  isFinal: boolean
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return recognitionClass() !== null
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ในการตั้งค่าเบราว์เซอร์',
  'service-not-allowed': 'เบราว์เซอร์นี้ไม่อนุญาตให้ใช้การรู้จำเสียง',
  'no-speech': 'ไม่ได้ยินเสียง ลองพูดใกล้ไมค์อีกครั้ง',
  network: 'การรู้จำเสียงต้องต่ออินเทอร์เน็ต',
  'audio-capture': 'ไม่พบไมโครโฟน',
}

/**
 * onFinal ถูกเรียกเมื่อพูดจบพร้อมข้อความทั้งหมด
 * interim คือข้อความระหว่างพูด ใช้แสดงให้เห็นว่าระบบได้ยินอะไร
 */
export function useSpeechInput(onFinal: (text: string) => void, onError: (message: string) => void) {
  const listening = ref(false)
  const interim = ref('')
  let recognition: Recognition | null = null

  function start() {
    const Klass = recognitionClass()
    if (!Klass || listening.value) return
    recognition = new Klass()
    recognition.lang = 'th-TH'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    let finalText = ''
    recognition.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        if (result.isFinal) finalText += result[0].transcript
        else live += result[0].transcript
      }
      interim.value = finalText + live
    }
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') onError(ERRORS[event.error] ?? 'รู้จำเสียงไม่สำเร็จ ลองอีกครั้ง')
    }
    recognition.onend = () => {
      listening.value = false
      interim.value = ''
      recognition = null
      if (finalText.trim()) onFinal(finalText.trim())
    }
    listening.value = true
    recognition.start()
  }

  function stop() {
    recognition?.stop()
  }

  onBeforeUnmount(() => recognition?.abort())

  return { listening, interim, start, stop, supported: speechSupported() }
}
