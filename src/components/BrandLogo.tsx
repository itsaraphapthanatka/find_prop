import { useLogoUrl } from '../lib/branding'

/**
 * โลโก้ระบบ — super เปลี่ยนรูปได้จากหน้า Super Admin (การ์ด "โลโก้ระบบ")
 * มีรูปที่ตั้งไว้ = แสดงรูปแทนทั้งชุด (ไอคอน+ชื่อ HOP) เพราะโลโก้ส่วนใหญ่มีชื่ออยู่ในรูปแล้ว
 */
export default function BrandLogo({ size = 26 }: { size?: number }) {
  const logoUrl = useLogoUrl()
  return (
    <div className="brand">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="โลโก้"
          style={{ height: size + 8, maxWidth: 180, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <>
          <svg width={size} height={size} viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#7132f5" />
            <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
          </svg>
          <span>H<span className="brand-accent">OP</span></span>
        </>
      )}
    </div>
  )
}
