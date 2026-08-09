import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { rememberMe, setRememberMe } from '../lib/authStorage'
import { API_BASE, isInstalledApp } from '../lib/native'
import BrandLogo from '../components/BrandLogo'

function Brand() {
  return <BrandLogo size={30} />
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [params] = useSearchParams()
  // มาจากปุ่ม "สมัครฟรี" บนหน้า landing (/login?mode=signup) → เปิดแท็บสมัครเลย
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(params.get('mode') === 'signup' ? 'signup' : 'login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // "จำการเข้าสู่ระบบในเครื่องนี้" — ติ๊กไว้ (ค่าเริ่มต้น) = ปิดเบราว์เซอร์แล้วยังล็อกอินอยู่
  // ไม่ติ๊ก = เก็บ session แค่ในแท็บนี้ (เครื่องสาธารณะ/เครื่องที่ใช้ร่วมกัน)
  const [remember, setRemember] = useState(() => rememberMe())

  function switchMode(m: 'login' | 'signup' | 'forgot') {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    if (mode === 'forgot') {
      // ลิงก์ในอีเมลต้องกลับมาที่เว็บ (ในแอปเปิดลิงก์นี้ไม่ได้) — ตั้งค่า Redirect URL ใน Supabase ให้ตรงด้วย
      const base = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '')
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${base}/#/login?reset=1`,
      })
      setBusy(false)
      // ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่ — กันคนไล่เดาว่าใครเป็นลูกค้าเรา
      if (err && !/rate|limit/i.test(err.message)) setError(`ส่งลิงก์ไม่สำเร็จ: ${err.message}`)
      else if (err) setError('ขอลิงก์บ่อยเกินไป — รอสักครู่แล้วลองใหม่')
      else setNotice(`ถ้ามีบัญชีของ ${email.trim()} ในระบบ เราส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว (ตรวจกล่องจดหมายและอีเมลขยะ) · ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง`)
      return
    }
    // จำการเข้าสู่ระบบหรือไม่ — ต้องตั้งก่อนล็อกอิน เพราะ session ถูกเขียนตอนล็อกอินสำเร็จ
    setRememberMe(remember)
    if (mode === 'login') {
      const err = await signIn(email.trim(), password)
      if (err) {
        setError(
          err.includes('Invalid login credentials')
            ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
            : `เข้าสู่ระบบไม่สำเร็จ: ${err}`,
        )
        setBusy(false)
      }
      // สำเร็จ: onAuthStateChange พาเข้าแอปเอง
    } else {
      const { error: err, needConfirm } = await signUp(email.trim(), password, fullName.trim())
      if (err) {
        setError(err)
        setBusy(false)
        return
      }
      if (needConfirm) {
        setNotice(`ส่งลิงก์ยืนยันไปที่ ${email.trim()} แล้ว — เปิดอีเมลกดยืนยัน แล้วกลับมาเข้าสู่ระบบ`)
        setMode('login')
        setBusy(false)
      }
      // ถ้าไม่ต้องยืนยันอีเมล: onAuthStateChange พาไปหน้า "ตั้งชื่อองค์กร" เอง
    }
  }

  async function handleGoogle() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const err = await signInWithGoogle()
    if (err) {
      setError(`เข้าสู่ระบบด้วย Google ไม่สำเร็จ: ${err}`)
      setBusy(false)
    }
    // เว็บ: กำลังเด้งไปหน้า Google · แอป: เปิด in-app browser แล้ว
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="sub">ฐานข้อมูลทรัพย์ให้เช่า/ขาย</p>

        {/* โหมดลืมรหัสผ่านเป็นขั้นตอนย่อย ไม่ใช่แท็บที่สาม — โชว์แท็บไว้จะกลายเป็นคอนโทรลที่ไม่มีอันไหนถูกเลือก
            (ทางออกของโหมดนี้คือปุ่ม "กลับไปหน้าเข้าสู่ระบบ" ด้านล่าง) */}
        {mode === 'forgot' ? (
          <h2 className="auth-title">ลืมรหัสผ่าน</h2>
        ) : (
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>
              เข้าสู่ระบบ
            </button>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>
              สมัครสมาชิก
            </button>
          </div>
        )}

        {notice && <div className="auth-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        {mode === 'forgot' && (
          <p className="auth-note" style={{ marginTop: 0 }}>
            กรอกอีเมลที่ใช้เข้าระบบ เราจะส่ง<b>ลิงก์ตั้งรหัสผ่านใหม่</b>ไปให้ — ลิงก์ใช้ได้ครั้งเดียว หมดอายุใน 1 ชั่วโมง
          </p>
        )}
        {mode === 'signup' && (
          <div className="form-field">
            <label>ชื่อ-สกุล</label>
            <input type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        )}
        <div className="form-field">
          <label>อีเมล</label>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div className="form-field">
            <label>รหัสผ่าน</label>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              placeholder={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {mode === 'login' && (
          <div className="auth-row">
            <label className="auth-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              จำการเข้าสู่ระบบในเครื่องนี้
            </label>
            <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
              ลืมรหัสผ่าน?
            </button>
          </div>
        )}
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'กำลังดำเนินการ…'
            : mode === 'login' ? 'เข้าสู่ระบบ'
              : mode === 'signup' ? 'สมัครสมาชิก' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
        </button>

        {mode !== 'forgot' && (
          <>
            <div className="auth-or"><span>หรือ</span></div>
            <button type="button" className="btn auth-google" onClick={() => void handleGoogle()} disabled={busy}>
              <GoogleIcon />
              {mode === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครด้วย Google'}
            </button>
          </>
        )}

        {mode === 'forgot' ? (
          <p className="auth-note">
            <button type="button" className="link-btn" onClick={() => switchMode('login')}>← กลับไปหน้าเข้าสู่ระบบ</button>
            <br />เข้าระบบด้วย Google อยู่? ไม่ต้องตั้งรหัสผ่าน — กด "เข้าสู่ระบบด้วย Google" ที่หน้าเข้าสู่ระบบได้เลย
          </p>
        ) : mode === 'login' ? (
          <p className="auth-note">ยังไม่มีบัญชี? กด “สมัครสมาชิก” ด้านบน — สมัครเสร็จตั้งชื่อองค์กรของคุณได้เลย</p>
        ) : (
          <p className="auth-note">สมัครแล้วคุณจะได้ตั้งชื่อองค์กรของตัวเอง และเป็นแอดมินเพิ่มลูกทีมได้</p>
        )}
        {/* ในแอป/PWA ไม่มีหน้า landing ให้กลับ · โหมดลืมรหัสผ่านมีลิงก์กลับของตัวเองแล้ว */}
        {!isInstalledApp && mode !== 'forgot' && <p className="auth-note"><a href="#/">← กลับหน้าแรก</a></p>}
      </form>
    </div>
  )
}

/**
 * หน้าตั้งรหัสผ่านใหม่ — แสดงเมื่อผู้ใช้กดลิงก์จากอีเมล (event PASSWORD_RECOVERY)
 * ลิงก์นั้นล็อกอินให้แล้ว แต่ต้องบังคับตั้งรหัสก่อน ไม่งั้นรอบหน้าก็เข้าไม่ได้อีก
 */
export function ResetPasswordScreen() {
  const { clearRecovery, signOut, session } = useAuth()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw1.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }
    if (pw1 !== pw2) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (err) {
      setError(/expired|invalid/i.test(err.message)
        ? 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — กด "ลืมรหัสผ่าน?" ขอลิงก์ใหม่'
        : `ตั้งรหัสผ่านไม่สำเร็จ: ${err.message}`)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <Brand />
          <div className="auth-notice">ตั้งรหัสผ่านใหม่เรียบร้อย ✓ ใช้รหัสนี้เข้าระบบครั้งต่อไปได้เลย</div>
          <button className="btn primary auth-submit" onClick={() => clearRecovery()}>เข้าใช้งานต่อ</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={(e) => void handleSave(e)}>
        <Brand />
        <h2 className="auth-title">ตั้งรหัสผ่านใหม่</h2>
        <p className="auth-note" style={{ marginTop: 0 }}>
          สำหรับบัญชี <b>{session?.user.email}</b> — ตั้งเสร็จแล้วใช้เข้าระบบได้ทันที
        </p>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-field">
          <label>รหัสผ่านใหม่</label>
          <input
            type="password" autoComplete="new-password" required minLength={6}
            placeholder="อย่างน้อย 6 ตัวอักษร"
            value={pw1} onChange={(e) => setPw1(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>ยืนยันรหัสผ่านใหม่</label>
          <input
            type="password" autoComplete="new-password" required minLength={6}
            value={pw2} onChange={(e) => setPw2(e.target.value)}
          />
        </div>
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
        </button>
        <p className="auth-note">
          <button type="button" className="link-btn" onClick={() => void signOut()}>ออกจากระบบ</button>
        </p>
      </form>
    </div>
  )
}

export function CreateOrgScreen({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  const { refreshProfile } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_organization', { org_name: name.trim() })
    if (error) {
      setError(`สร้างองค์กรไม่สำเร็จ: ${error.message}`)
      setBusy(false)
      return
    }
    // ถ้ามาจากลิงก์ชวนเพื่อน → ผูกกับองค์กรผู้ชวน (ยังไม่ให้รางวัลตอนนี้)
    // ผู้ชวนได้รางวัลตอนองค์กรนี้ "ชำระเงินครั้งแรก" — ดู grant_referral_reward ใน supabase/referral-cap.sql
    let ref: string | null = null
    try { ref = localStorage.getItem('hop_ref') } catch { /* ข้าม */ }
    if (ref) {
      await supabase.rpc('apply_referral', { ref_code: ref })
      try { localStorage.removeItem('hop_ref') } catch { /* ข้าม */ }
    }
    await refreshProfile()
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleCreate}>
        <Brand />
        <p className="sub" style={{ marginTop: 14 }}>
          บัญชี <b>{email}</b> ยังไม่ได้อยู่ในองค์กรใด
          <br />
          ตั้งชื่อองค์กรของคุณเพื่อเริ่มใช้งาน — คุณจะเป็นแอดมินขององค์กรนี้
          และเพิ่มลูกทีมได้จากเมนู "ทีม"
        </p>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-field">
          <label>ชื่อองค์กร <span className="req">*</span></label>
          <input
            type="text"
            required
            placeholder="เช่น JKP Property"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'กำลังสร้าง…' : 'สร้างองค์กร'}
        </button>
        <p className="auth-note">
          ถ้าทีมของคุณมีองค์กรอยู่แล้ว ให้แอดมินเป็นคนเพิ่มบัญชีคุณแทน{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSignOut() }}>ออกจากระบบ</a>
        </p>
      </form>
    </div>
  )
}

export function JoinOrgScreen({
  token, onDecline, onSignOut,
}: { token: string; onDecline: () => void; onSignOut: () => void }) {
  const { refreshProfile } = useAuth()
  const [info, setInfo] = useState<{ org_name: string; email: string; status: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void supabase.rpc('invite_info', { p_token: token }).then(({ data }) => {
      const row = (data as { org_name: string; email: string; status: string }[] | null)?.[0]
      setInfo(row ?? null)
      setLoading(false)
    })
  }, [token])

  async function accept() {
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = data as string
    if (r === 'ok') {
      try { localStorage.removeItem('hop_invite') } catch { /* ข้าม */ }
      await refreshProfile()
      return
    }
    setErr(
      r === 'email_mismatch' ? `ต้องล็อกอินด้วยอีเมลที่ถูกเชิญ (${info?.email ?? ''})`
        : r === 'org_full' ? 'องค์กรนี้เต็มแล้ว (แพ็กเกจ Free) — ให้แอดมินอัปเกรด Pro'
          : r === 'already_in_org' ? 'บัญชีนี้อยู่ในองค์กรอื่นอยู่แล้ว'
            : 'คำเชิญนี้ใช้ไม่ได้แล้ว',
    )
  }

  const valid = info && info.status === 'pending'
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Brand />
        {loading ? (
          <p className="sub" style={{ marginTop: 14 }}>กำลังโหลดคำเชิญ…</p>
        ) : valid ? (
          <p className="sub" style={{ marginTop: 14 }}>
            คุณได้รับเชิญเข้าร่วมองค์กร <b>{info!.org_name}</b> ในฐานะลูกทีม
            <br />
            กดยอมรับเพื่อเริ่มใช้งาน (ต้องล็อกอินด้วยอีเมล <b>{info!.email}</b>)
          </p>
        ) : (
          <p className="sub" style={{ marginTop: 14 }}>คำเชิญนี้ใช้ไม่ได้แล้ว (ถูกยกเลิกหรือรับไปแล้ว)</p>
        )}
        {err && <div className="auth-error">{err}</div>}
        {valid && (
          <button className="btn primary auth-submit" onClick={() => void accept()} disabled={busy}>
            {busy ? 'กำลังเข้าร่วม…' : `เข้าร่วม ${info!.org_name}`}
          </button>
        )}
        <p className="auth-note">
          <a href="#" onClick={(e) => { e.preventDefault(); onDecline() }}>ข้ามไปก่อน</a>
          {' · '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSignOut() }}>ออกจากระบบ</a>
        </p>
      </div>
    </div>
  )
}

export function SuspendedScreen({
  orgName, reason, onSignOut,
}: { orgName?: string; reason: 'suspended' | 'expired' | 'trial_ended'; onSignOut: () => void }) {
  // 'suspended' = super ระงับ → ติดต่อผู้ดูแลระบบ · 'expired'/'trial_ended' = เรื่องเงิน →
  // ลูกทีมเห็นจอนี้ (แอดมินองค์กรไม่มาถึงจอนี้ — App.tsx พาไปหน้าเลือกแพ็กเกจ/จ่ายเงินแทน)
  const title =
    reason === 'suspended' ? 'ถูกระงับการใช้งานชั่วคราว'
      : reason === 'expired' ? 'แพ็กเกจหมดอายุแล้ว'
        : 'หมดช่วงทดลองใช้แล้ว'
  const hint =
    reason === 'suspended'
      ? 'กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน แล้วเข้าสู่ระบบใหม่อีกครั้ง'
      : 'แจ้งแอดมินของทีมคุณให้เข้าสู่ระบบเพื่อเลือกแพ็กเกจ/ต่ออายุ — ข้อมูลทั้งหมดยังอยู่ครบ'
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Brand />
        <p className="sub" style={{ marginTop: 14 }}>
          องค์กร <b>{orgName}</b> {title}
          <br />
          {hint}
        </p>
        <button className="btn" onClick={onSignOut}>ออกจากระบบ</button>
      </div>
    </div>
  )
}

export function PendingScreen({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Brand />
        <p className="sub" style={{ marginTop: 14 }}>
          บัญชี <b>{email}</b> ยังไม่ได้รับอนุมัติจากผู้ดูแลทีม
          <br />
          กรุณาแจ้งผู้ดูแลให้เปิดใช้งานบัญชีของคุณ แล้วเข้าสู่ระบบใหม่อีกครั้ง
        </p>
        <button className="btn" onClick={onSignOut}>ออกจากระบบ</button>
      </div>
    </div>
  )
}
