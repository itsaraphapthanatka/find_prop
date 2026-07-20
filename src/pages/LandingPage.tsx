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
    title: 'แอปมือถือแท้ ทั้ง Android & iPhone',
    desc: 'ดาวน์โหลดเป็นแอปจริง ใช้กล้อง GPS และแจ้งเตือน push ได้เต็มที่ ทำงาน offline ได้ และอัปเดตตัวเองอัตโนมัติ — ออกแบบให้ใช้หน้างานด้วยมือเดียว',
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
          <a href="#pricing" className="btn sm ghost">แพ็กเกจ</a>
          <a href={CONTACT.lineUrl} target="_blank" rel="noreferrer" className="btn sm">
            ติดต่อทีมขาย
          </a>
          <button className="btn sm ghost" onClick={() => navigate('/login')}>
            เข้าสู่ระบบ
          </button>
        </nav>
      </header>

      <section className="ld-hero">
        <p className="ld-eyebrow">แพลตฟอร์มบริหารทรัพย์สำหรับทีมนายหน้าอสังหาฯ</p>
        <h1>
          บริหารทรัพย์ทั้งพอร์ต ทีมทั้งบริษัท<br />
          <span className="hl">จบในแพลตฟอร์มเดียว พร้อม AI</span>
        </h1>
        <p className="ld-sub">
          โกดัง โรงงาน โชว์รูม ออฟฟิศ — จากกระดาษ/Excel/AppSheet ที่กระจัดกระจาย
          สู่ระบบเดียวที่ทั้งทีมใช้ร่วมกัน: ฐานข้อมูล แผนที่ แผนพาชม เอกสารเสนอลูกค้า
          และผู้ช่วย AI ที่รู้จักทรัพย์ของคุณทุกตัว
        </p>
        <div className="ld-cta-row">
          <a className="btn primary ld-cta" href={CONTACT.lineUrl} target="_blank" rel="noreferrer">
            ทดลองใช้ฟรี 14 วัน — ทัก LINE {CONTACT.lineId}
          </a>
          <a className="btn ld-cta" href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> นัดดูเดโม {CONTACT.phone}
          </a>
        </div>
        <p className="ld-hours">ทดลองฟรี 14 วัน ครบทุกฟีเจอร์ · ไม่ต้องผูกบัตรเครดิต · ย้ายข้อมูลจากระบบเดิมได้ในวันเดียว</p>
      </section>

      <section className="ld-section">
        <h2>เครื่องมือครบ ตั้งแต่รับทรัพย์จนปิดดีล</h2>
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
        <h2>ออกแบบมาให้ทีมจริงใช้ได้จริง</h2>
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
        <h2>แพ็กเกจ</h2>
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
        <h2>เริ่มใช้งานใน 3 ขั้นตอน</h2>
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
        <span>© {new Date().getFullYear()} HOB — แพลตฟอร์มบริหารทรัพย์</span>
        <button className="linklike" onClick={() => navigate('/login')}>ลูกค้าปัจจุบัน: เข้าสู่ระบบ</button>
      </footer>
    </div>
  )
}
