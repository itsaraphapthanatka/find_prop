import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ── ประกาศ type ของ Web Speech API เท่าที่ใช้ (lib.dom ยังไม่ครอบทุกเบราว์เซอร์) ──
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [index: number]: SRResult } }
interface SRErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SREvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  start(): void
  stop(): void
}
type SRCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** ถอดเสียงพูดภาษาไทยแบบต่อเนื่อง — ข้อความที่จบประโยคแล้วส่งผ่าน onFinal
    ระหว่างพูดดูได้จาก interim (ยังเปลี่ยนได้จนกว่าจะจบประโยค) */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const supported = useMemo(() => getSpeechCtor() !== null, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechCtor()
    if (!Ctor || recRef.current) return
    setError(null)
    const rec = new Ctor()
    rec.lang = 'th-TH'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        if (r.isFinal && text) onFinalRef.current(text)
        else live += r[0].transcript
      }
      setInterim(live)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // เงียบเฉยๆ ไม่ใช่ปัญหา
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์'
          : `ถอดเสียงผิดพลาด (${e.error})`,
      )
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [])

  // ปิดไมค์เมื่อออกจากหน้า
  useEffect(() => () => recRef.current?.stop(), [])

  return { supported, listening, interim, error, start, stop }
}
