import { useNavigate } from 'react-router-dom'
import { IconCompare, IconPhone, IconRoute, IconSparkles } from '../components/icons'

// ── ช่องทางติดต่อ — แก้ตรงนี้จุดเดียว ──────────────────────────
const CONTACT = {
  phone: '081-234-5678', // TODO: ใส่เบอร์จริง
  lineId: '@hobproperty', // TODO: ใส่ LINE ID จริง
  lineUrl: 'https://line.me/R/ti/p/@hobproperty', // TODO: ลิงก์ LINE OA จริง
  email: 'contact@hob-property.com', // TODO: ใส่อีเมลจริง
  hours: 'ทุกวัน 8:30 – 18:00 น.',
}

const PROPERTY_TYPES = [
  {
    name: 'โกดัง / คลังสินค้า',
    desc: 'พื้นที่จัดเก็บ-กระจายสินค้า ใกล้ถนนหลักและนิคมฯ มีทั้งพร้อมใช้และสร้างตามแบบ',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8" /><path d="M7 17h10" /></svg>
    ),
  },
  {
    name: 'โรงงาน',
    desc: 'โซนสีม่วง/สีเหลือง ไฟ 3 เฟส เครน พื้นรับน้ำหนักสูง พร้อมใบอนุญาตที่เกี่ยวข้อง',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M2 20V8l6 4V8l6 4V4h8v16z" /><path d="M17 12h2M17 16h2" /></svg>
    ),
  },
  {
    name: 'โชว์รูม',
    desc: 'อาคารติดถนนใหญ่ หน้ากว้าง มองเห็นง่าย เหมาะทำโชว์รูมสินค้า-ศูนย์บริการ',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14" /><path d="M4 11h16" /><path d="M9 21v-6h6v6" /></svg>
    ),
  },
  {
    name: 'ออฟฟิศ / สำนักงาน',
    desc: 'สำนักงานพร้อมเข้า ทั้งแบบเดี่ยวและในโครงการ ใกล้ทางด่วนเดินทางสะดวก',
    icon: (
      <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /><path d="M11 21v-3h2v3" /></svg>
    ),
  },
  {
    name: 'ครัวกลาง',
    desc: 'พื้นที่ครัวผลิตอาหาร ระบบระบายอากาศ-บ่อดักไขมันพร้อม เริ่มธุรกิจได้เร็ว',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M7 3v7M10 3v7M8.5 10v11" /><path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8" /></svg>
    ),
  },
]

const WHY = [
  {
    title: 'จับคู่ความต้องการแม่นยำ',
    desc: 'บอกสเปกที่ต้องการครั้งเดียว ทีมงานใช้ระบบฐานข้อมูล + AI คัดทรัพย์ที่ตรงจริงมาให้ ไม่เสียเวลาดูของที่ไม่ใช่',
    icon: <IconSparkles size={22} />,
  },
  {
    title: 'ชอร์ตลิสต์เปรียบเทียบชัดเจน',
    desc: 'รับเอกสารเทียบสเปก-ราคา-ทำเลแบบเห็นภาพ พร้อมบทวิเคราะห์จุดเด่นข้อควรพิจารณา ประกอบการตัดสินใจ',
    icon: <IconCompare size={22} />,
  },
  {
    title: 'จัดรูทพาชมถึงที่',
    desc: 'นัดหมายครั้งเดียว ดูได้หลายทรัพย์ เราวางเส้นทางให้ครบจบในวันเดียว มีทีมงานพาชมทุกจุด',
    icon: <IconRoute size={22} />,
  },
  {
    title: 'ดูแลจนจบดีล',
    desc: 'ประสานเจ้าของทรัพย์ ต่อรอง เงื่อนไขสัญญา จนถึงวันส่งมอบ — บริการฟรีสำหรับผู้เช่า/ผู้ซื้อ',
    icon: <IconPhone size={22} />,
  },
]

const STEPS = [
  { n: '1', title: 'บอกความต้องการ', desc: 'ประเภททรัพย์ ขนาด งบประมาณ ทำเล — ทางโทรศัพท์หรือ LINE' },
  { n: '2', title: 'รับชอร์ตลิสต์', desc: 'ภายใน 1-2 วัน รับรายการทรัพย์ที่คัดแล้ว พร้อมเอกสารเปรียบเทียบ' },
  { n: '3', title: 'นัดชม-ปิดดีล', desc: 'เลือกวันสะดวก เราจัดเส้นทางพาชม แล้วดูแลต่อจนเซ็นสัญญา' },
]

function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#7132f5" />
        <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
      </svg>
      <span>H<span className="brand-accent">OB</span></span>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="landing">
      <header className="ld-topbar">
        <Brand />
        <nav className="ld-nav">
          <a href={`tel:${CONTACT.phone.replace(/-/g, '')}`} className="btn sm">
            <IconPhone size={15} /> {CONTACT.phone}
          </a>
          <button className="btn sm ghost" onClick={() => navigate('/login')}>
            เข้าสู่ระบบทีมงาน
          </button>
        </nav>
      </header>

      <section className="ld-hero">
        <p className="ld-eyebrow">นายหน้าอสังหาริมทรัพย์เชิงอุตสาหกรรมและพาณิชย์</p>
        <h1>
          หาโกดัง โรงงาน โชว์รูม ออฟฟิศ<br />
          <span className="hl">ที่ใช่สำหรับธุรกิจคุณ</span>
        </h1>
        <p className="ld-sub">
          ให้เช่าและขาย ทำเลกรุงเทพฯ ตะวันออก – สมุทรปราการ ใกล้สนามบิน ท่าเรือ และนิคมอุตสาหกรรม
          บริการฟรีสำหรับผู้เช่า/ผู้ซื้อ ตั้งแต่คัดทรัพย์จนถึงวันเซ็นสัญญา
        </p>
        <div className="ld-cta-row">
          <a className="btn primary ld-cta" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> โทร {CONTACT.phone}
          </a>
          <a className="btn ld-cta" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
            LINE {CONTACT.lineId}
          </a>
        </div>
        <p className="ld-hours">เปิดให้บริการ{CONTACT.hours}</p>
      </section>

      <section className="ld-section">
        <h2>ทรัพย์ที่เรามีให้บริการ</h2>
        <div className="ld-grid types">
          {PROPERTY_TYPES.map((t) => (
            <div key={t.name} className="ld-card">
              <div className="ld-icon">{t.icon}</div>
              <h3>{t.name}</h3>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-section tint">
        <h2>ทำไมลูกค้าเลือกเรา</h2>
        <div className="ld-grid why">
          {WHY.map((w) => (
            <div key={w.title} className="ld-card">
              <div className="ld-icon">{w.icon}</div>
              <h3>{w.title}</h3>
              <p>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-section">
        <h2>เริ่มต้นง่ายๆ 3 ขั้นตอน</h2>
        <div className="ld-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="ld-step">
              <div className="ld-step-n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-contact" id="contact">
        <h2>พร้อมเริ่มหาทรัพย์ที่ใช่แล้วหรือยัง?</h2>
        <p>ทักมาคุยก่อนได้ ไม่มีค่าใช้จ่าย — บอกความต้องการคร่าวๆ เดี๋ยวเราคัดของมาให้เลือก</p>
        <div className="ld-cta-row">
          <a className="btn primary ld-cta" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> {CONTACT.phone}
          </a>
          <a className="btn ld-cta on-dark" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
            LINE {CONTACT.lineId}
          </a>
          <a className="btn ld-cta on-dark" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </div>
      </section>

      <footer className="ld-footer">
        <span>© {new Date().getFullYear()} HOB Property</span>
        <button className="linklike" onClick={() => navigate('/login')}>สำหรับทีมงาน: เข้าสู่ระบบ</button>
      </footer>
    </div>
  )
}
