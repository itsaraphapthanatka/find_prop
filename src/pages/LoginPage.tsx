import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#7132f5" />
        <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
      </svg>
      Find<span className="brand-accent">Prop</span>
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email.trim(), password)
    if (err) {
      setError(
        err.includes('Invalid login credentials')
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : `เข้าสู่ระบบไม่สำเร็จ: ${err}`,
      )
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="sub">ฐานข้อมูลทรัพย์ให้เช่า/ขาย — เข้าสู่ระบบเพื่อใช้งาน</p>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-field">
          <label>อีเมล</label>
          <input
            type="text"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>รหัสผ่าน</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
        <p className="auth-note">ยังไม่มีบัญชี? ติดต่อผู้ดูแลทีมเพื่อเพิ่มคุณเข้าระบบ</p>
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
