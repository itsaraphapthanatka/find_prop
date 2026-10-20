import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { API_BASE } from '../lib/native'

// วิดีโอสอนใช้งาน — HLS เข้ารหัส AES-128 จาก /media/tutorial (ไฟล์อยู่บนเครื่องเซิร์ฟเวอร์ ดู deploy/media-hls.sh)
// กันดาวน์โหลด: ไม่มีไฟล์ .mp4 ให้บันทึก · ทุกชิ้นเข้ารหัส กุญแจขอจาก /api/media-key พร้อม token (เฉพาะสมาชิกที่ล็อกอิน)
// · ซ่อนปุ่มดาวน์โหลด/คลิกขวา/ภาพซ้อนภาพ · ลายน้ำ HOPAI.ONLINE + อีเมลผู้ชม + วันที่ ลอยบนวิดีโอ
//   (เต็มจอก็ยังอยู่ เพราะขยายทั้งกรอบ ไม่ใช่แค่ <video>)
// กัน 100% ไม่ได้ (อัดหน้าจอได้เสมอ) — อีเมลบนลายน้ำทำให้รู้ว่าใครเอาไปเผยแพร่

const MEDIA = `${API_BASE}/media/tutorial`
const WATERMARK = 'HOPAI.ONLINE'
const POS_KEY = 'hop_tutorial_pos'

type Chapter = { t: number; title: string }
type Manifest = { playlist: string; duration?: number; chapters?: Chapter[] }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function savedPosition(): number {
  try { return Number(localStorage.getItem(POS_KEY)) || 0 } catch { return 0 }
}

export default function TutorialPage() {
  const { session, profile } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLDivElement>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [mark, setMark] = useState({ x: 12, y: 12 })
  const [fullscreen, setFullscreen] = useState(false)
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled
  const email = profile?.email || session?.user.email || ''

  // 1) รุ่นล่าสุด + สารบัญ (current.json ไม่แคช — อัปวิดีโอใหม่แล้วเห็นทันที)
  useEffect(() => {
    let alive = true
    fetch(`${MEDIA}/current.json`, { cache: 'no-store' })
      .then((r) => {
        if (r.status === 404) throw new Error('ยังไม่มีวิดีโอสอนใช้งาน — ผู้ดูแลระบบยังไม่ได้อัปโหลด')
        if (!r.ok) throw new Error('โหลดวิดีโอไม่สำเร็จ ลองใหม่อีกครั้ง')
        return r.json() as Promise<Manifest>
      })
      .then((m) => { if (alive) setManifest(m) })
      .catch((e: Error) => { if (alive) setError(e.message || 'โหลดวิดีโอไม่สำเร็จ') })
    return () => { alive = false }
  }, [])

  // 2) ตัวเล่น — hls.js แนบ token เฉพาะตอนขอกุญแจ (ชิ้นวิดีโอไม่ต้องใช้ เพราะเข้ารหัสอยู่แล้ว)
  useEffect(() => {
    const video = videoRef.current
    if (!manifest || !video) return
    let destroyed = false
    let hls: Hls | null = null
    let token = ''
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, s) => { token = s?.access_token || '' })

    void (async () => {
      token = (await supabase.auth.getSession()).data.session?.access_token || ''
      const { default: HlsLib } = await import('hls.js')
      if (destroyed) return
      if (!HlsLib.isSupported()) {
        setError('เบราว์เซอร์นี้เล่นวิดีโอแบบป้องกันไม่ได้ — อัปเดตเบราว์เซอร์ (iPhone ต้อง iOS 17.1 ขึ้นไป) หรือใช้ Chrome')
        return
      }
      let networkRetries = 0
      hls = new HlsLib({
        xhrSetup: (xhr, url) => {
          if (url.includes('/api/media-key')) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        },
        // ไม่มีสิทธิ์ (401/403) → หยุดทันทีแล้วบอกผู้ใช้ · ค่าเริ่มของ hls.js ลองซ้ำ ~8 ครั้ง (รอเปล่าราวครึ่งนาที)
        keyLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 8000,
            maxLoadTimeMs: 20000,
            timeoutRetry: { maxNumRetry: 1, retryDelayMs: 1000, maxRetryDelayMs: 0 },
            errorRetry: {
              maxNumRetry: 2,
              retryDelayMs: 1000,
              maxRetryDelayMs: 4000,
              shouldRetry: (_cfg, count, _timeout, res) => count < 2 && res?.code !== 401 && res?.code !== 403,
            },
          },
        },
      })
      hls.on(HlsLib.Events.ERROR, (_ev, data) => {
        if (!data.fatal) return
        if (data.details === HlsLib.ErrorDetails.KEY_LOAD_ERROR) {
          const code = (data.response as { code?: number } | undefined)?.code
          setError(code === 401 || code === 403
            ? 'สิทธิ์ดูวิดีโอหมดอายุ — ออกจากระบบแล้วเข้าสู่ระบบใหม่'
            : 'โหลดกุญแจวิดีโอไม่สำเร็จ ลองรีเฟรชหน้า')
          hls?.destroy()
        } else if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && networkRetries++ < 3) {
          hls?.startLoad()
        } else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError()
        } else {
          setError('เล่นวิดีโอไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า')
          hls?.destroy()
        }
      })
      hls.loadSource(`${MEDIA}/${manifest.playlist}`)
      hls.attachMedia(video)
    })()

    return () => {
      destroyed = true
      authSub.subscription.unsubscribe()
      hls?.destroy()
    }
  }, [manifest])

  // ดูต่อจากที่ค้างไว้ (เก็บในเครื่องนี้เท่านั้น)
  function onLoadedMetadata() {
    const v = videoRef.current
    const pos = savedPosition()
    if (v && pos > 5 && pos < (v.duration || Infinity) - 10) v.currentTime = pos
  }
  function onTimeUpdate() {
    const t = videoRef.current?.currentTime || 0
    setNow(t)
    if (Math.floor(t) % 5 === 0) {
      try { localStorage.setItem(POS_KEY, String(Math.floor(t))) } catch { /* โหมดส่วนตัว — ข้าม */ }
    }
  }

  // ลายน้ำย้ายที่ทุก 20 วินาที — ครอปออกยาก · คำนวณจากขนาดจริง (อีเมลยาวบนจอมือถือห้ามล้นขอบ)
  // และเว้นแถบปุ่มควบคุมด้านล่างของ <video>
  const moveMark = useCallback(() => {
    const wrap = wrapRef.current
    const el = markRef.current
    if (!wrap || !el) return
    const maxX = Math.max(0, wrap.clientWidth - el.offsetWidth - 16)
    const maxY = Math.max(0, wrap.clientHeight - el.offsetHeight - 64)
    setMark({ x: 8 + Math.random() * maxX, y: 8 + Math.random() * maxY })
  }, [])
  useEffect(() => {
    const id = setInterval(moveMark, 20000)
    return () => clearInterval(id)
  }, [moveMark])

  // เต็มจอทั้งกรอบ (วิดีโอ + ลายน้ำ) — ปุ่มเต็มจอของ <video> ถูกซ่อนไว้ เพราะจะทิ้งลายน้ำไว้ข้างนอก
  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement))
      setTimeout(moveMark, 100) // ขนาดกรอบเปลี่ยน — วางลายน้ำใหม่ให้อยู่ในกรอบ
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [moveMark])
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrapRef.current?.requestFullscreen()
  }

  function seek(t: number) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    void v.play().catch(() => {})
    wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const chapters = manifest?.chapters || []
  const current = chapters.reduce((idx, c, i) => (c.t <= now ? i : idx), 0)
  const stamp = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

  return (
    <>
      <div className="view-header">
        <h1>วิดีโอสอนใช้งาน</h1>
      </div>

      <div className="tutorial-wrap">
        <div
          ref={wrapRef}
          className={`tutorial-player${fullscreen ? ' is-fs' : ''}`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
          />
          <div ref={markRef} className="tutorial-watermark" style={{ left: mark.x, top: mark.y }} aria-hidden="true">
            <strong>{WATERMARK}</strong>
            <br />
            {email ? `${email} · ${stamp}` : stamp}
          </div>
          {canFullscreen && !error && (
            <button type="button" className="tutorial-fs" onClick={toggleFullscreen} aria-label={fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}>
              {fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
            </button>
          )}
          {error && <div className="tutorial-error" role="alert">{error}</div>}
        </div>

        <p className="tutorial-note">
          สำหรับสมาชิก HOP เท่านั้น · ไม่อนุญาตให้ดาวน์โหลดหรือเผยแพร่ต่อ (บนวิดีโอมีลายน้ำอีเมลของผู้ชม)
        </p>

        {chapters.length > 0 && (
          <section className="form-card">
            <h3>สารบัญ ({chapters.length} บท)</h3>
            <ol className="tutorial-chapters">
              {chapters.map((c, i) => (
                <li key={`${c.t}-${i}`}>
                  <button type="button" className={i === current ? 'active' : ''} onClick={() => seek(c.t)}>
                    <span className="tc-time">{fmt(c.t)}</span>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  )
}
