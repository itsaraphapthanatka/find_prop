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
} from '../components/icons'

// ── ช่องทางติดต่อ/ทีมขาย — แก้ตรงนี้จุดเดียว ──────────────────
const CONTACT = {
  phone: '081-234-5678', // TODO: ใส่เบอร์จริง
  lineId: '@hobplatform', // TODO: ใส่ LINE ID จริง
  lineUrl: 'https://line.me/R/ti/p/@hobplatform', // TODO: ลิงก์ LINE OA จริง
  email: 'sales@hob-platform.com', // TODO: ใส่อีเมลจริง
}

// หมุดตัวอย่างบน mockup แผนที่ — สี+ไอคอนชุดเดียวกับในแอปจริง (MapPage PIN_STYLE)
const PINS = [
  { top: '34%', left: '26%', c: '#2563eb', g: '<path d="M2 21V9.5l6 3.2V9.5l6 3.2V9.5l6 3.2V21H2z"/><path d="M17 3h4v8h-4z"/>' },
  { top: '54%', left: '52%', c: '#d97706', g: '<path d="M3 21V9l9-5 9 5v12h-5v-7H8v7H3z"/>' },
  { top: '40%', left: '70%', c: '#0d9488', g: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21h-4v-4h-6v4H5z"/>' },
  { top: '66%', left: '34%', c: '#db2777', g: '<path d="M3.5 8 5 3h14l1.5 5c0 1.5-1.2 2.7-2.7 2.7-1.2 0-2.2-.7-2.6-1.8-.4 1.1-1.4 1.8-2.6 1.8s-2.2-.7-2.6-1.8c-.4 1.1-1.4 1.8-2.6 1.8C4.7 10.7 3.5 9.5 3.5 8z"/><path d="M5 12.5h14V21h-4.5v-5h-5v5H5z"/>' },
  { top: '60%', left: '78%', c: '#dc2626', g: '<path d="M3.5 10h17v1.5c0 3-1.7 5.6-4.5 6.9v1.1c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5v-1.1C5.2 17.1 3.5 14.5 3.5 11.5V10z"/>' },
]
const LEGEND = [
  { c: '#2563eb', t: 'โรงงาน' },
  { c: '#d97706', t: 'โกดัง' },
  { c: '#0d9488', t: 'ออฟฟิศ' },
  { c: '#db2777', t: 'โชว์รูม' },
]

const FEATURES = [
  {
    title: 'ฐานข้อมูลทรัพย์ + แผนที่',
    desc: 'โกดัง โรงงาน โชว์รูม ออฟฟิศ — เก็บครบ ~50 ฟิลด์ต่อทรัพย์ พร้อมรูปภาพ ค้นหา/กรองทันใจ และแผนที่รวมทรัพย์ที่หมุดแยกสีตามประเภท เห็นภาพรวมทำเลทันที',
    icon: <IconMap size={22} />,
  },
  {
    title: 'พูดปุ๊บ ถ่ายรูปปั๊บ ได้ข้อมูล',
    desc: 'เซลส์ยืนหน้างาน กดพูดเล่ารายละเอียดรวดเดียว AI แกะเป็นฟิลด์กรอกให้อัตโนมัติ (เข้าใจตัวเลขไทย) และถ่ายรูปทรัพย์ด้วยกล้องในแอปแนบได้ทันที',
    icon: <IconMic size={22} />,
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
    name: 'ทดลองใช้ฟรี',
    tag: '14 วัน · ครบทุกฟีเจอร์',
    points: ['ใช้ได้ครบทุกฟีเจอร์ รวม AI', 'ไม่ต้องผูกบัตรเครดิต', 'มีทีมช่วยตั้งค่า + ย้ายข้อมูลเดิมให้'],
    cta: 'เริ่มทดลองใช้',
    featured: false,
  },
  {
    name: 'Pro',
    tag: 'ทีมที่กำลังเติบโต',
    points: ['ทุกอย่างในช่วงทดลอง', 'ฟีเจอร์ AI ครบชุด (เสียง/จับคู่/ผู้ช่วย)', 'Dashboard + เอกสารเปรียบเทียบ + แอปมือถือ'],
    cta: 'สอบถามราคา',
    featured: true,
  },
  {
    name: 'Enterprise',
    tag: 'องค์กรขนาดใหญ่',
    points: ['ทุกอย่างใน Pro', 'จำนวนผู้ใช้ไม่จำกัด', 'ซัพพอร์ตแบบ dedicated'],
    cta: 'สอบถามราคา',
    featured: false,
  },
]

const STEPS = [
  { n: '1', title: 'ทักมาคุยกับเรา', desc: 'เล่าหน้างานทีมคุณให้ฟัง เราเปิดบัญชีองค์กรพร้อมพาตั้งค่าให้' },
  { n: '2', title: 'นำเข้าข้อมูลเดิม', desc: 'อัปโหลดไฟล์ Excel / ข้อมูล AppSheet เดิม ระบบจับคู่คอลัมน์ให้อัตโนมัติ' },
  { n: '3', title: 'ทีมเริ่มใช้ได้เลย', desc: 'เพิ่มสมาชิกทีม แล้วใช้งานได้ทันทีทั้งคอมและมือถือ พร้อม AI ครบชุด' },
]

function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#7132f5" />
        <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
      </svg>
      <span>H<span className="brand-accent">UP</span></span>
    </div>
  )
}

/** mockup เบราว์เซอร์โชว์หน้าแผนที่ของแอป (หมุดแยกสี + legend + การ์ดทรัพย์ + มือถือซ้อน) */
function MapMock() {
  return (
    <div className="mock mock-browser">
      <div className="mock-bar">
        <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
        <div className="mock-url">hob-alpha.vercel.app</div>
      </div>
      <div className="mock-screen appmap">
        <div className="appmap-water" />
        {PINS.map((p, i) => (
          <span key={i} className="appmap-pin" style={{ top: p.top, left: p.left, background: p.c }}>
            <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: p.g }} />
          </span>
        ))}
        <div className="appcard">
          <div className="appcard-img" />
          <div className="appcard-body">
            <b>WH-BP-114</b>
            <div className="appcard-chips">
              <i style={{ background: '#e7efff', color: '#2563eb' }}>โกดัง</i>
              <i style={{ background: '#e7f6ef', color: '#149e61' }}>เช่า</i>
            </div>
            <div className="appcard-price">85,000 ฿/เดือน</div>
          </div>
        </div>
        <div className="appmap-legend">
          {LEGEND.map((l) => (
            <span key={l.t}><i style={{ background: l.c }} />{l.t}</span>
          ))}
        </div>
      </div>
      <div className="mock-phone">
        <div className="mock-phone-notch" />
        <div className="mock-phone-screen">
          <div className="applist">
            <div className="applist-bar" />
            {[
              { c: '#2563eb', code: 'JKP-377', em: '120,000 ฿' },
              { c: '#d97706', code: 'JKP-280', em: '96,000 ฿' },
              { c: '#0d9488', code: 'JKP-373', em: '58,000 ฿' },
            ].map((r) => (
              <div key={r.code} className="applist-item">
                <span className="thumb" style={{ background: r.c }}>🏢</span>
                <span className="lines"><b>{r.code}</b><i /><em>{r.em}</em></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** mockup เบราว์เซอร์โชว์ Dashboard + การ์ดแชท AI ลอยมุม (โซนโชว์แอปพื้นดำ) */
function DashboardMock() {
  return (
    <div className="ld-showcase-stage">
      <div className="mock mock-browser">
        <div className="mock-bar">
          <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
          <div className="mock-url">hob-alpha.vercel.app/#/dashboard</div>
        </div>
        <div className="mock-screen appdash">
          <div className="appdash-stats">
            <div className="appstat"><b>฿284<i>M</i></b><span>มูลค่าพอร์ตรวม</span></div>
            <div className="appstat"><b>1,240</b><span>ทรัพย์ในระบบ</span></div>
            <div className="appstat"><b>+38</b><span>ใหม่เดือนนี้</span></div>
            <div className="appstat"><b>92<i>%</i></b><span>ข้อมูลครบ</span></div>
          </div>
          <div className="appdash-row">
            <div className="appbars">
              {[42, 58, 50, 72, 66, 88, 80].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="appinsight">
              <span className="tag">✨ AI วิเคราะห์พอร์ต</span>
              <p><i /><i /><i /></p>
            </div>
          </div>
        </div>
      </div>
      <div className="appchat">
        <div className="appchat-head">
          <span className="sp"><IconSparkles size={13} /></span> ผู้ช่วย HUP
        </div>
        <div className="bubble me">โกดังแถวบางพลี งบไม่เกินแสนมีไหม</div>
        <div className="bubble ai">เจอ <b>3 รายการ</b> ตรงเงื่อนไข — WH-BP-114 เช่า 85,000 ฿ ใกล้สุด แตะดูรายละเอียดได้เลย</div>
      </div>
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

  return (
    <div className="landing">
      <header className={`ld-topbar ${scrolled ? 'scrolled' : ''}`}>
        <Brand />
        <nav className="ld-nav">
          <a href="#features" className="btn sm ghost">ฟีเจอร์</a>
          <a href="#pricing" className="btn sm ghost">แพ็กเกจ</a>
          <button className="btn sm ghost" onClick={() => navigate('/login')}>เข้าสู่ระบบ</button>
          <a href={CONTACT.lineUrl} target="_blank" rel="noreferrer" className="btn sm primary">
            ทดลองใช้ฟรี
          </a>
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
              <a className="btn primary ld-cta" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
                ทดลองใช้ฟรี 14 วัน
              </a>
              <a className="btn ld-cta" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
                <IconPhone size={18} /> นัดดูเดโม
              </a>
            </div>
            <div className="ld-proof">
              <div className="ld-proof-dots">
                <span style={{ background: '#7132f5' }}>ก</span>
                <span style={{ background: '#0d9488' }}>บ</span>
                <span style={{ background: '#d97706' }}>ค</span>
              </div>
              <small>ทีมนายหน้าอสังหาฯ ใช้จริง<br /><b>ทดลองฟรี 14 วัน</b> · ไม่ต้องผูกบัตรเครดิต</small>
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
        <p className="ld-lead">ทดลองครบทุกฟีเจอร์ 14 วันก่อน ไม่ต้องผูกบัตรเครดิต</p>
        <div className="ld-pricing">
          {PLANS.map((p) => (
            <div key={p.name} className={`ld-price-card ${p.featured ? 'featured' : ''}`}>
              {p.featured && <span className="ld-price-badge">ยอดนิยม</span>}
              <h3>{p.name}</h3>
              <p className="ld-price-tag">{p.tag}</p>
              <ul>
                {p.points.map((pt) => <li key={pt}>{pt}</li>)}
              </ul>
              <a
                className={`btn ld-cta ${p.featured ? 'primary' : ''}`}
                href={CONTACT.lineUrl}
                target="_blank"
                rel="noreferrer"
              >
                {p.cta}
              </a>
            </div>
          ))}
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
        <p>ทักมาคุยก่อนได้ ไม่มีค่าใช้จ่าย — เล่าหน้างานของทีมคุณ เดี๋ยวเราพาดูว่าระบบช่วยตรงไหนได้บ้าง</p>
        <div className="ld-cta-row">
          <a className="btn primary ld-cta" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
            LINE {CONTACT.lineId}
          </a>
          <a className="btn ld-cta on-dark" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> {CONTACT.phone}
          </a>
          <a className="btn ld-cta on-dark" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </div>
      </section>

      <footer className="ld-footer">
        <span>© {new Date().getFullYear()} HUP — แพลตฟอร์มบริหารทรัพย์</span>
        <button className="linklike" onClick={() => navigate('/login')}>ลูกค้าปัจจุบัน: เข้าสู่ระบบ</button>
      </footer>
    </div>
  )
}
