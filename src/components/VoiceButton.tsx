import { useSpeech } from '../hooks/useSpeech'
import { IconMic, IconStop } from './icons'

interface Props {
  /** ได้รับข้อความทีละท่อนเมื่อผู้พูดจบประโยค */
  onText: (finalText: string) => void
}

/** ปุ่มกดพูด (toggle เริ่ม/หยุดฟัง) — ซ่อนตัวเองถ้าเบราว์เซอร์ไม่รองรับการถอดเสียง */
export default function VoiceButton({ onText }: Props) {
  const { supported, listening, interim, error, start, stop } = useSpeech(onText)
  if (!supported) return null
  return (
    <span className="voice-wrap">
      <button
        type="button"
        className={`btn voice-btn ${listening ? 'listening' : ''}`}
        onClick={() => (listening ? stop() : start())}
        title={listening ? 'แตะเพื่อหยุดฟัง' : 'กดแล้วพูดได้เลย'}
      >
        {listening ? <IconStop size={16} /> : <IconMic size={16} />}
        {listening ? 'กำลังฟัง… แตะเพื่อหยุด' : 'พูด'}
      </button>
      {listening && interim && <span className="voice-live">{interim}</span>}
      {error && <span className="voice-error">{error}</span>}
    </span>
  )
}
