import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconChart,
  IconCompare,
  IconMap,
  IconMic,
  IconPhone,
  IconRoute,
  IconShield,
  IconSparkles,
  IconUpload,
  IconUser,
  IconUsers,
} from '../components/icons'

// ── ช่องทางติดต่อ/ทีมขาย — แก้ตรงนี้จุดเดียว ──────────────────
const CONTACT = {
  phone: '081-234-5678', // TODO: ใส่เบอร์จริง
  lineId: '@hopplatform', // TODO: ใส่ LINE ID จริง (ยังเป็น placeholder)
  lineUrl: 'https://line.me/R/ti/p/@hopplatform', // TODO: ลิงก์ LINE OA จริง
  email: 'sales@hop-platform.com', // TODO: ใส่อีเมลจริง
}

// สกรีนช็อตจริงของแอป (อยู่ใน public/) — ครอปแถบบนที่มีชื่อผู้ใช้ออกแล้ว
const GALLERY = [
  { src: '/app-list.jpg', title: 'รายการทรัพย์', sub: 'ค้นหา/กรอง + ป้ายองค์กร' },
  { src: '/app-compare.jpg', title: 'เอกสารเปรียบเทียบ', sub: 'เทียบสเปก + พิมพ์ PDF' },
  { src: '/app-plan.jpg', title: 'แผนเยี่ยมชม', sub: 'จัดรูท + AI จับคู่ requirement' },
]

const FEATURES = [
  {
    title: 'สมัครเองใช้ได้ทันที',
    desc: 'กดสมัครด้วยอีเมลหรือ Google ตั้งองค์กรของทีมได้เองใน 1 นาที ไม่ต้องรอทีมงานเปิดบัญชี — เริ่มฟรี ไม่ต้องผูกบัตรเครดิต',
    icon: <IconUser size={22} />,
  },
  {
    title: 'ฐานข้อมูลทรัพย์ + แผนที่ดาวเทียม',
    desc: 'โกดัง โรงงาน โชว์รูม ออฟฟิศ — เก็บครบ ~50 ฟิลด์ต่อทรัพย์ พร้อมรูปภาพ ค้นหา/กรองทันใจ แผนที่หมุดแยกสีตามประเภท สลับภาพดาวเทียม และค้นหาที่อยู่เพื่อปักหมุดได้ฟรี',
    icon: <IconMap size={22} />,
  },
  {
    title: 'พูดปุ๊บ ถ่ายรูปปั๊บ ได้ข้อมูล',
    desc: 'เซลส์ยืนหน้างาน กดพูดเล่ารายละเอียดรวดเดียว AI แกะเป็นฟิลด์กรอกให้อัตโนมัติ (เข้าใจตัวเลขไทย) และถ่ายรูปทรัพย์ด้วยกล้องในแอปแนบได้ทันที',
    icon: <IconMic size={22} />,
  },
  {
    title: 'ทำงานเป็นทีมทั้งบริษัท',
    desc: 'เชิญลูกทีมด้วยลิงก์ทางอีเมล (แบบ Jira) กำหนดสิทธิ์แอดมิน/ลูกทีม และเห็นเฉพาะทรัพย์ของตัวเองหรือทั้งทีมก็ได้ — 1 บัญชีสลับได้หลายองค์กร',
    icon: <IconUsers size={22} />,
  },
  {
    title: 'แผนพาลูกค้าชมทรัพย์',
    desc: 'จัดรูทหลายจุดในคลิกเดียว เปิดนำทาง Google Maps จากตำแหน่งปัจจุบัน แจ้งเตือนแผนล่วงหน้าถึงมือถือ — ลูกค้าเปลี่ยนโจทย์กลางทาง AI หาตัวใหม่ให้ทันที',
    icon: <IconRoute size={22} />,
  },
  {
    title: 'เอกสารเปรียบเทียบเสนอลูกค้า',
    desc: 'เลือกทรัพย์ 2–4 ตัว ระบบสร้างตารางเทียบสเปก + บทวิเคราะห์จาก AI พิมพ์เป็น PDF แนวนอนสวยงาม ส่งลูกค้าทาง LINE ได้ทันที',
    icon: <IconCompare size={22} />,
  },
  {
    title: 'Dashboard เห็นภาพทั้งพอร์ต',
    desc: 'มูลค่าพอร์ต สัดส่วนประเภททรัพย์ ทำเลยอดนิยม ราคาเฉลี่ย/ตร.ม. สุขภาพข้อมูล และ AI วิเคราะห์พอร์ตรายวัน',
    icon: <IconChart size={22} />,
  },
  {
    title: 'ผู้ช่วย AI ประจำทีม',
    desc: 'ถามหาทรัพย์เป็นภาษาพูด สั่งเพิ่มจุดแวะ สร้างแผน เปิดหน้าเปรียบเทียบผ่านแชทได้เลย — ตอบจากข้อมูลจริงของทีมคุณ',
    icon: <IconSparkles size={22} />,
  },
]

const TRUST = [
  {
    title: 'ย้ายจากระบบเดิมได้ในวันเดียว',
    desc: 'นำเข้า Excel / CSV / ข้อมูลจาก AppSheet หรือ Google Sheets เดิม — จับคู่คอลัมน์อัตโนมัติ รองรับวันที่ พ.ศ. ตรวจรหัสซ้ำให้',
    icon: <IconUpload size={22} />,
  },
  {
    title: 'ข้อมูลแยกองค์กร ปลอดภัยจริง',
    desc: 'แต่ละบริษัทเห็นเฉพาะข้อมูลตัวเอง บังคับที่ชั้นฐานข้อมูล (Row Level Security) พร้อมประวัติการใช้งานสำหรับแอดมิน',
    icon: <IconShield size={22} />,
  },
  {
    title: 'แอปมือถือแท้ Android & iPhone',
    desc: 'ดาวน์โหลดเป็นแอปจริง ใช้กล้อง GPS และแจ้งเตือน push ได้เต็มที่ ทำงาน offline ได้ และอัปเดตตัวเองอัตโนมัติ — ใช้หน้างานด้วยมือเดียว',
    icon: <IconPhone size={22} />,
  },
]

const PLANS = [
  {
    name: 'ฟรี',
    tag: 'เริ่มต้นใช้งาน · ฟรีตลอด ไม่มีวันหมดอายุ',
    points: [
      'ทรัพย์สูงสุด 10 รายการ',
      'ทีมสูงสุด 2 คน',
      'ฐานข้อมูล + แผนที่ดาวเทียม + ฟอร์มบันทึก',
      'ใช้ได้ทั้งเว็บและแอปมือถือ',
    ],
    cta: 'สมัครฟรี',
    featured: false,
  },
  {
    name: 'Pro',
    tag: 'ทีมที่กำลังเติบโต · อัปเกรดได้ในแอป',
    points: [
      'ทรัพย์และลูกทีม ไม่จำกัด',
      'ผู้ช่วย AI ครบชุด (พูด/ถ่ายรูป/แชท)',
      'Dashboard + นำเข้า Excel/CSV',
      'แผนเยี่ยมชม + เอกสารเปรียบเทียบ',
    ],
    cta: 'เริ่มใช้ฟรี แล้วอัปเกรด',
    featured: true,
  },
]

const STEPS = [
  { n: '1', title: 'สมัครฟรีใน 1 นาที', desc: 'กดสมัครด้วยอีเมลหรือ Google แล้วตั้งชื่อองค์กรของทีม — เริ่มใช้ได้เองทันที ไม่ต้องรอใคร' },
  { n: '2', title: 'เพิ่มทรัพย์ + เชิญทีม', desc: 'เพิ่มทรัพย์เองหรือนำเข้าจาก Excel/CSV (Pro) แล้วเชิญลูกทีมด้วยลิงก์ทางอีเมล' },
  { n: '3', title: 'ใช้ได้เลยทั้งทีม', desc: 'ทำงานพร้อมกันทั้งคอมและมือถือ พร้อมแผนที่ แผนพาชม เอกสารเสนอลูกค้า และผู้ช่วย AI' },
]

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

/** กรอบเบราว์เซอร์ครอบสกรีนช็อตจริง */
function BrowserShot({ src, url, alt, eager }: { src: string; url: string; alt: string; eager?: boolean }) {
  return (
    <div className="mock mock-browser">
      <div className="mock-bar">
        <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
        <div className="mock-url">{url}</div>
      </div>
      <img className="mock-img" src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} />
    </div>
  )
}

/** กรอบมือถือครอบสกรีนช็อตจริง */
function PhoneShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mock-phone">
      <div className="mock-phone-notch" />
      <div className="mock-phone-screen">
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </div>
  )
}

/** ฮีโร่: เบราว์เซอร์โชว์แผนที่จริง + มือถือโชว์รายการทรัพย์ซ้อนมุม */
function MapMock() {
  return (
    <div className="mock mock-browser mock-hero">
      <div className="mock-bar">
        <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
        <div className="mock-url">hop.app</div>
      </div>
      <img className="mock-img" src="/app-map.jpg" alt="หน้าแผนที่รวมทรัพย์ของ HOP" loading="eager" />
      <PhoneShot src="/app-mobile.jpg" alt="แอป HOP บนมือถือ — รายการทรัพย์" />
    </div>
  )
}

/** โซนดำ: เบราว์เซอร์โชว์ Dashboard จริง + มือถือโชว์ Dashboard ซ้อนมุม */
function DashboardMock() {
  return (
    <div className="ld-showcase-stage">
      <BrowserShot src="/app-dashboard.jpg" url="hop.app/#/dashboard" alt="หน้าสรุปภาพรวม (Dashboard) ของ HOP" eager />
      <PhoneShot src="/app-mobile-dash.jpg" alt="Dashboard บนมือถือ" />
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goSignup = () => navigate('/login?mode=signup')
  const goLogin = () => navigate('/login')

  return (
    <div className="landing">
      <header className={`ld-topbar ${scrolled ? 'scrolled' : ''}`}>
        <Brand />
        <nav className="ld-nav">
          <a href="#features" className="btn sm ghost">ฟีเจอร์</a>
          <a href="#pricing" className="btn sm ghost">แพ็กเกจ</a>
          <button className="btn sm ghost" onClick={goLogin}>เข้าสู่ระบบ</button>
          <button className="btn sm primary" onClick={goSignup}>สมัครฟรี</button>
        </nav>
      </header>

      <section className="ld-hero">
        <div className="ld-hero-inner">
          <div className="ld-hero-copy">
            <span className="ld-eyebrow">แพลตฟอร์มบริหารทรัพย์ · สำหรับทีมนายหน้า</span>
            <h1>
              บริหารทรัพย์ทั้งพอร์ต<br />
              ทีมทั้งบริษัท <span className="hl">จบในที่เดียว</span>
            </h1>
            <p className="ld-sub">
              โกดัง โรงงาน โชว์รูม ออฟฟิศ — จากกระดาษ/Excel/AppSheet ที่กระจัดกระจาย
              สู่ระบบเดียวที่ทั้งทีมใช้ร่วมกัน: ฐานข้อมูล แผนที่ แผนพาชม เอกสารเสนอลูกค้า
              และผู้ช่วย AI ที่รู้จักทรัพย์ของคุณทุกตัว
            </p>
            <div className="ld-cta-row">
              <button className="btn primary ld-cta" onClick={goSignup}>
                สมัครฟรี — ใช้ได้ทันที
              </button>
              <button className="btn ld-cta" onClick={goLogin}>
                เข้าสู่ระบบ
              </button>
            </div>
            <div className="ld-proof">
              <div className="ld-proof-dots">
                <span style={{ background: '#7132f5' }}>ก</span>
                <span style={{ background: '#0d9488' }}>บ</span>
                <span style={{ background: '#d97706' }}>ค</span>
              </div>
              <small>ทีมนายหน้าอสังหาฯ ใช้จริง<br /><b>เริ่มฟรี</b> · สมัครด้วยอีเมลหรือ Google · ไม่ต้องผูกบัตรเครดิต</small>
            </div>
          </div>
          <div className="ld-hero-visual">
            <MapMock />
          </div>
        </div>
      </section>

      <section className="ld-showcase">
        <span className="ld-kicker">เห็นระบบจริง</span>
        <h2>ทั้งพอร์ตอยู่ในมือ ทุกที่ทุกเวลา</h2>
        <p className="ld-lead">
          Dashboard สรุปภาพรวมแบบเรียลไทม์ พร้อมผู้ช่วย AI ที่ตอบจากข้อมูลจริงของทีมคุณ —
          ใช้ได้ทั้งบนคอมและแอปมือถือ
        </p>
        <DashboardMock />
      </section>

      <section className="ld-section">
        <span className="ld-kicker">ภาพจากระบบจริง</span>
        <h2>ดูทุกหน้าที่ทีมใช้งานจริง</h2>
        <p className="ld-lead">ไม่ใช่ภาพจำลอง — ทุกหน้าจอด้านล่างมาจากระบบ HOP ที่ใช้งานอยู่จริง</p>
        <div className="ld-gallery">
          {GALLERY.map((g) => (
            <figure key={g.src}>
              <BrowserShot src={g.src} url="hop.app" alt={g.title} />
              <figcaption>{g.title}<small>{g.sub}</small></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="ld-section" id="features">
        <span className="ld-kicker">เครื่องมือครบวงจร</span>
        <h2>ตั้งแต่รับทรัพย์ จนปิดดีล</h2>
        <p className="ld-lead">ทุกขั้นตอนงานนายหน้าอยู่ในระบบเดียว ไม่ต้องสลับหลายแอปอีกต่อไป</p>
        <div className="ld-grid why">
          {FEATURES.map((f) => (
            <div key={f.title} className="ld-card">
              <div className="ld-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-section tint">
        <span className="ld-kicker">ออกแบบให้ทีมจริง</span>
        <h2>ใช้ได้จริง ตั้งแต่วันแรก</h2>
        <div className="ld-grid why">
          {TRUST.map((t) => (
            <div key={t.title} className="ld-card">
              <div className="ld-icon">{t.icon}</div>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-section" id="pricing">
        <span className="ld-kicker">แพ็กเกจ</span>
        <h2>เริ่มฟรี อัปเกรดเมื่อพร้อม</h2>
        <p className="ld-lead">เริ่มใช้ฟรีได้เลยไม่มีวันหมดอายุ — อยากได้ AI, Dashboard, นำเข้าข้อมูล และทีมไม่จำกัด ค่อยอัปเกรดเป็น Pro</p>
        <div className="ld-pricing">
          {PLANS.map((p) => (
            <div key={p.name} className={`ld-price-card ${p.featured ? 'featured' : ''}`}>
              {p.featured && <span className="ld-price-badge">คุ้มสุด</span>}
              <h3>{p.name}</h3>
              <p className="ld-price-tag">{p.tag}</p>
              <ul>
                {p.points.map((pt) => <li key={pt}>{pt}</li>)}
              </ul>
              <button className={`btn ld-cta ${p.featured ? 'primary' : ''}`} onClick={goSignup}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
        <div className="ld-referral">
          <span className="ld-referral-emoji">🎁</span>
          <div>
            <b>ชวนเพื่อน 2 คน รับ Pro ฟรี 30 วัน</b>
            <span>เพื่อนสมัครแล้วเปิดองค์กรของตัวเอง ครบทุก 2 คน องค์กรคุณได้ Pro เพิ่ม 30 วัน — สะสมได้ไม่จำกัด</span>
          </div>
        </div>
      </section>

      <section className="ld-section tint">
        <span className="ld-kicker">เริ่มใช้ใน 3 ขั้นตอน</span>
        <h2>ย้ายมาใช้ง่ายกว่าที่คิด</h2>
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
        <h2>พร้อมยกระดับทีมของคุณหรือยัง?</h2>
        <p>สมัครฟรีแล้วเริ่มใช้ได้เองทันที — หรือถ้ามีคำถาม/อยากให้ช่วยย้ายข้อมูลเดิม ทักทีมงานได้เลย ไม่มีค่าใช้จ่าย</p>
        <div className="ld-cta-row">
          <button className="btn primary ld-cta" onClick={goSignup}>
            สมัครฟรีเลย
          </button>
          <a className="btn ld-cta on-dark" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
            LINE {CONTACT.lineId}
          </a>
          <a className="btn ld-cta on-dark" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> {CONTACT.phone}
          </a>
        </div>
      </section>

      <footer className="ld-footer">
        <span>© {new Date().getFullYear()} HOP — แพลตฟอร์มบริหารทรัพย์</span>
        <button className="linklike" onClick={goLogin}>ลูกค้าปัจจุบัน: เข้าสู่ระบบ</button>
      </footer>
    </div>
  )
}
