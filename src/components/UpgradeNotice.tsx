import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** หน้าจอ "ฟีเจอร์นี้เฉพาะ Pro" — โชว์แทนหน้าที่ถูกล็อกสำหรับแพ็กเกจ Free */
export default function UpgradeNotice({ feature }: { feature: string }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  return (
    <div className="empty-state" style={{ maxWidth: 460, margin: '48px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>🔒</div>
      <h2 style={{ margin: '0 0 8px' }}>{feature} — ฟีเจอร์ Pro</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
        แพ็กเกจ Free ใช้ได้: แผนที่ · ฟอร์ม · รายการทรัพย์ (สูงสุด 10 ชิ้น) · ค้นหา
        <br />
        อัปเกรดเป็น <b>Pro</b> เพื่อปลดล็อก <b>{feature}</b> พร้อม AI · นำเข้า Excel · ทรัพย์/ลูกทีมไม่จำกัด
      </p>
      <div style={{
        marginBottom: 16, padding: '10px 14px', borderRadius: 10,
        background: 'var(--purple-subtle)', color: 'var(--purple)', fontSize: 13.5,
      }}>
        🎁 <b>ชวนเพื่อน 2 คน = Pro ฟรี 30 วัน</b> (สะสมได้)
        {isAdmin && <> — รับลิงก์ชวนที่เมนู “ทีม”</>}
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/upgrade" className="btn primary">อัปเกรดเป็น Pro</Link>
          <Link to="/team" className="btn">รับลิงก์ชวนเพื่อน</Link>
        </div>
      )}
    </div>
  )
}
