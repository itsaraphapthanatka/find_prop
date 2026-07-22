import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { isInstalledApp } from '../lib/native'

function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#7132f5" />
        <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
      </svg>
      <span>H<span className="brand-accent">OP</span></span>
    </div>
  )
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
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function switchMode(m: 'login' | 'signup') {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
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

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>
            เข้าสู่ระบบ
          </button>
          <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>
            สมัครสมาชิก
          </button>
        </div>

        {notice && <div className="auth-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

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
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
        </button>

        <div className="auth-or"><span>หรือ</span></div>
        <button type="button" className="btn auth-google" onClick={() => void handleGoogle()} disabled={busy}>
          <GoogleIcon />
          {mode === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครด้วย Google'}
        </button>

        {mode === 'login' ? (
          <p className="auth-note">ยังไม่มีบัญชี? กด “สมัครสมาชิก” ด้านบน — สมัครเสร็จตั้งชื่อองค์กรของคุณได้เลย</p>
        ) : (
          <p className="auth-note">สมัครแล้วคุณจะได้ตั้งชื่อองค์กรของตัวเอง และเป็นแอดมินเพิ่มลูกทีมได้</p>
        )}
        {/* ในแอป/PWA ไม่มีหน้า landing ให้กลับ */}
        {!isInstalledApp && <p className="auth-note"><a href="#/">← กลับหน้าแรก</a></p>}
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
    // ถ้ามาจากลิงก์ชวนเพื่อน → ผูกกับองค์กรผู้ชวน (ผู้ชวนจะได้รางวัลเมื่อครบ 2 คน)
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

export function SuspendedScreen({
  orgName, expired, onSignOut,
}: { orgName?: string; expired: boolean; onSignOut: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Brand />
        <p className="sub" style={{ marginTop: 14 }}>
          องค์กร <b>{orgName}</b> {expired ? 'หมดอายุการใช้งานแล้ว' : 'ถูกระงับการใช้งานชั่วคราว'}
          <br />
          กรุณาติดต่อผู้ดูแลระบบเพื่อต่ออายุ/เปิดใช้งาน แล้วเข้าสู่ระบบใหม่อีกครั้ง
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
