import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPlanPrices, DEFAULT_PRICES, TIERS, type PlanPrices, type Tier } from '../lib/payments'
import { fetchTrialSetting, DEFAULT_TRIAL, fetchReferralSetting, DEFAULT_REFERRAL, fetchContactSetting, DEFAULT_CONTACT } from '../lib/plan'
import {
  IconBell,
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

// ช่องทางติดต่อ/ทีมขาย — super admin ตั้งจากหน้า Super Admin (app_settings 'contact')
// ค่ามาตรฐานระหว่างโหลด/ยังไม่ตั้ง = DEFAULT_CONTACT ใน lib/plan.ts

// สกรีนช็อตจริงของแอป (อยู่ใน public/) — ครอปแถบบนที่มีชื่อผู้ใช้ออกแล้ว
const GALLERY = [
  { src: '/app-list.jpg', title: 'รายการทรัพย์', sub: 'ค้นหา/กรอง + ป้ายองค์กร' },
  { src: '/app-compare.jpg', title: 'เอกสารเปรียบเทียบ', sub: 'เทียบสเปก + พิมพ์ PDF' },
  { src: '/app-plan.jpg', title: 'แผนเยี่ยมชม', sub: 'จัดรูท + AI จับคู่ requirement' },
]

const FEATURES = [
  {
    title: 'สมัครเองใช้ได้ทันที',
    // {trial} ถูกแทนด้วยข้อความจริงตอน render (จำนวนวันมาจากตั้งค่าใน Super Admin)
    desc: 'กดสมัครด้วยอีเมลหรือ Google ตั้งองค์กรของทีมได้เองใน 1 นาที ไม่ต้องรอทีมงานเปิดบัญชี — {trial} ไม่ต้องผูกบัตรเครดิต',
    icon: <IconUser size={22} />,
  },
  {
    title: 'ฐานข้อมูลทรัพย์ + แผนที่ดาวเทียม',
    desc: 'โกดัง โรงงาน โชว์รูม ออฟฟิศ บ้าน คอนโด ที่ดินเปล่า — ฟอร์มปรับฟิลด์ให้ตามประเภทอัตโนมัติ (บ้านถามห้องนอน ที่ดินถาม FAR/ผังเมืองพร้อมแถบสี) เลือกทำเลต่อเนื่อง จังหวัด→อำเภอ→ตำบล ครบทั้งประเทศ พร้อมรูปภาพ เอกสารสิทธิ์แนบไฟล์ ค้นหา/กรองทันใจ (รวมสถานะ ว่าง/เช่าแล้ว/ขายแล้ว) และแผนที่หมุดแยกสีตามประเภท',
    icon: <IconMap size={22} />,
  },
  {
    title: 'พูดปุ๊บ ถ่ายรูปปั๊บ ได้ข้อมูล',
    desc: 'เซลส์ยืนหน้างาน กดพูดเล่ารายละเอียดรวดเดียว AI แกะเป็นฟิลด์กรอกให้อัตโนมัติ (เข้าใจตัวเลขไทย) และถ่ายรูปทรัพย์ด้วยกล้องในแอปแนบได้ทันที',
    icon: <IconMic size={22} />,
  },
  {
    title: 'ทำงานเป็นทีม พร้อมสิทธิ์ 8 ระดับ',
    desc: 'เชิญลูกทีมด้วยลิงก์ทางอีเมล เลือกบทบาทให้ตรงหน้าที่ — เจ้าของ ผู้จัดการ นายหน้าร่วม นักวิเคราะห์ ทีมสำรวจ ชั่วคราว แอดมินเพจ ฝึกงาน · ปิดเบอร์เจ้าของทรัพย์/พิกัดกับบทบาทที่ไม่ควรเห็น กันดีลหลุดและข้อมูลรั่ว · กำหนดเขตพื้นที่ให้ทีมสำรวจเป็นรายจังหวัด/อำเภอ — 1 บัญชีสลับได้หลายองค์กร',
    icon: <IconUsers size={22} />,
  },
  {
    title: 'แผนพาลูกค้าชมทรัพย์',
    desc: 'จัดรูทหลายจุดในคลิกเดียว เปิดนำทาง Google Maps จากตำแหน่งปัจจุบัน แจ้งเตือนแผนล่วงหน้าถึงมือถือ — ลูกค้าเปลี่ยนโจทย์กลางทาง AI หาตัวใหม่ให้ทันที',
    icon: <IconRoute size={22} />,
  },
  {
    title: 'ติดตามเจ้าของ/ลูกค้า ไม่หลุดสักดีล',
    desc: 'นัดติดตามผูกกับทรัพย์แต่ละตัว จดผลทุกครั้ง (โทรไม่รับ นัดเลื่อน เจ้าของขอคิดก่อน) เป็นประวัติย้อนดูได้ แจ้งเตือนถึงมือถือเช้าวันนัด และเตือนล่วงหน้าเมื่อสัญญาเช่าใกล้หมด (ทีมคุณตั้งเกณฑ์วันเองได้) — ปิดดีลแล้วกด "เช่าแล้ว/ขายแล้ว" ป้ายสถานะขึ้นทุกหน้าทันที',
    icon: <IconBell size={22} />,
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
    desc: 'ถามหาทรัพย์เป็นภาษาพูด สั่งเพิ่มจุดแวะ สร้างแผน สร้างนัดติดตาม เปิดหน้าเปรียบเทียบผ่านแชทได้เลย — ตอบจากข้อมูลจริงของทีมคุณ และรู้ว่าทรัพย์ไหนเช่า/ขายไปแล้ว',
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
    desc: 'แต่ละบริษัทเห็นเฉพาะข้อมูลตัวเอง บังคับที่ชั้นฐานข้อมูล (Row Level Security) — ข้อมูลติดต่อเจ้าของ/พิกัดถูกปิดตามบทบาทตั้งแต่ฐานข้อมูล ไม่ใช่แค่ซ่อนบนหน้าจอ · 1 บัญชีล็อกอินได้ทีละเครื่อง กันแชร์บัญชีกันใช้ · พร้อมประวัติการใช้งานให้ตรวจย้อนหลัง',
    icon: <IconShield size={22} />,
  },
  {
    title: 'ใช้บนมือถือได้เต็มรูปแบบ',
    desc: 'เปิดผ่านเบราว์เซอร์มือถือแล้วเพิ่มไปยังหน้าจอหลัก ใช้เหมือนแอป — ถ่ายรูปทรัพย์จากกล้อง ปักหมุดจากตำแหน่งปัจจุบัน และรับแจ้งเตือนถึงเครื่อง ใช้หน้างานด้วยมือเดียว',
    icon: <IconPhone size={22} />,
  },
]

const PLANS = [
  {
    key: 'starter' as const,
    name: 'Basic',
    tag: 'ครบสำหรับงานฐานข้อมูลทีม',
    points: [
      'จำนวนทรัพย์ตามระดับที่เลือก',
      'ทีม 3-10 ที่นั่ง ตามระดับ (ซื้อเพิ่มได้)',
      'ฐานข้อมูล + แผนที่ดาวเทียม + ฟอร์มตามประเภททรัพย์',
      'บทบาททีม 8 ระดับ — ปิดข้อมูลสำคัญตามหน้าที่',
    ],
    cta: '{trial}',
    featured: false,
  },
  {
    key: 'pro' as const,
    name: 'Pro',
    tag: 'ทีมที่กำลังเติบโต',
    points: [
      'ทุกอย่างใน Basic + ทีม 5-20 ที่นั่ง (ซื้อเพิ่มได้)',
      'ผู้ช่วย AI ครบชุด (พูด/ถ่ายรูป/แชท)',
      'Dashboard + นำเข้า Excel/CSV',
      'แผนเยี่ยมชม + นัดติดตาม + แจ้งเตือนสัญญาถึงมือถือ',
    ],
    cta: '{trial}',
    featured: true,
  },
]

// ตารางเทียบฟีเจอร์ Free vs Pro — ต้องตรงกับ plan.ts + route gating ใน App.tsx
// (true = มี, false = ไม่มี, string = ค่าที่แสดง) · /compare ไม่ถูกล็อก → Free ก็มีเอกสารเปรียบเทียบ
const COMPARE: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: 'จำนวนทรัพย์', free: 'ตามระดับ (100/250/500)', pro: 'ตามระดับ (100/250/500)' },
  // ที่นั่ง = จำนวนบัญชีในองค์กร (รวมแอดมิน) ตามระดับ 100/250/500 — ต้องตรงกับ SEATS_BY_PLAN ใน plan.ts
  { label: 'ที่นั่งทีม (ซื้อเพิ่มได้)', free: '3 / 5 / 10', pro: '5 / 10 / 20' },
  { label: 'ฐานข้อมูลทรัพย์ + รูปภาพ + เอกสารสิทธิ์', free: true, pro: true },
  { label: 'ฟอร์มตามประเภท (โกดัง/บ้าน/คอนโด/ที่ดิน)', free: true, pro: true },
  { label: 'แผนที่ดาวเทียม + ค้นหาที่อยู่', free: true, pro: true },
  { label: 'ค้นหา/กรองทรัพย์', free: true, pro: true },
  { label: 'เชิญลูกทีมทางอีเมล', free: true, pro: true },
  // บทบาท 8 ระดับ + masking + ล็อกอินทีละเครื่อง — มีทุกแพ็กเกจ (supabase/roles.sql, single-device.sql)
  { label: 'บทบาททีม 8 ระดับ + ปิดข้อมูลเจ้าของ/พิกัดตามสิทธิ์', free: true, pro: true },
  { label: 'กำหนดเขตพื้นที่ให้ทีมสำรวจ (รายจังหวัด/อำเภอ)', free: true, pro: true },
  { label: 'ล็อกอิน 1 บัญชี 1 เครื่อง (กันแชร์บัญชี)', free: true, pro: true },
  { label: 'เอกสารเปรียบเทียบ + พิมพ์ PDF', free: true, pro: true },
  { label: 'ใช้บนมือถือ (เพิ่มไปยังหน้าจอหลักได้)', free: true, pro: true },
  { label: 'Dashboard สรุปภาพรวม', free: false, pro: true },
  { label: 'ผู้ช่วย AI (พูดกรอก/แชท/วิเคราะห์)', free: false, pro: true },
  { label: 'นำข้อมูลออก Excel (เฉพาะเจ้าขององค์กร)', free: true, pro: true },
  { label: 'นำเข้า Excel/CSV', free: false, pro: true },
  { label: 'แผนเยี่ยมชม (จัดรูท + แจ้งเตือน)', free: false, pro: true },
  { label: 'นัดติดตามลูกค้า/เจ้าของ + ประวัติผล + แจ้งเตือน', free: false, pro: true },
  { label: 'แจ้งเตือนสัญญาเช่าใกล้หมด (ตั้งเกณฑ์วันเองได้)', free: false, pro: true },
  // ปุ่มปิดงานอยู่ในส่วนนัดติดตาม (Pro) — แพ็กเกจอื่นเห็นป้าย/ตัวกรองแต่ตั้งสถานะไม่ได้
  { label: 'สถานะปิดงาน (เช่าแล้ว/ขายแล้ว) + ตัวกรอง', free: false, pro: true },
]

const STEPS = [
  { n: '1', title: 'สมัครใน 1 นาที', desc: 'กดสมัครด้วยอีเมลหรือ Google แล้วตั้งชื่อองค์กรของทีม — {trial}ทันที ไม่ต้องรอใคร' },
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
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  // ระดับ = โควตาทรัพย์ (100/250/500) — ราคาทั้งสองแพ็กเปลี่ยนตามระดับ
  const [tier, setTier] = useState<Tier>(100)
  // ราคาจริงจากตาราง plan_prices (super admin ตั้งเอง) — ระหว่างโหลด/พลาดใช้ราคามาตรฐาน
  const [prices, setPrices] = useState<PlanPrices>(DEFAULT_PRICES)
  // จำนวนวันทดลองใช้จริงจากตั้งค่า (super admin) — 0 = ปิดช่วงทดลอง
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL.days)
  // เกณฑ์ชวนเพื่อน (super admin ตั้งได้)
  const [refSet, setRefSet] = useState(DEFAULT_REFERRAL)
  // ช่องทางติดต่อจริง (LINE OA / โทร / อีเมล) — super admin ตั้งเอง
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  useEffect(() => {
    void fetchPlanPrices().then(setPrices)
    void fetchTrialSetting().then((t) => setTrialDays(t.days))
    void fetchReferralSetting().then(setRefSet)
    void fetchContactSetting().then(setContact)
  }, [])
  const trialTxt = trialDays > 0 ? `ทดลองฟรี ${trialDays} วัน` : 'สมัครใช้งานฟรี'
  // แทน {trial} ในข้อความจาก FEATURES/STEPS/PLANS
  const tt = (s: string) => s.replace('{trial}', trialTxt)
  // % ประหยัดเมื่อจ่ายรายปี (คำนวณจากราคาจริงของแพ็ก Basic ระดับที่เลือก)
  const savePct = Math.max(0, Math.round((1 - prices.starter[tier].yearly / (prices.starter[tier].monthly * 12)) * 100))
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goSignup = () => navigate('/login?mode=signup')
  const goLogin = () => navigate('/login')

  // เซลล์ในตารางเทียบ: true = ✓, false = –, ข้อความ = ค่าที่แสดง
  const cmpCell = (v: boolean | string) =>
    v === true ? <span className="cmp-yes" aria-label="มี">✓</span>
      : v === false ? <span className="cmp-no" aria-label="ไม่มี">–</span>
        : <span className="cmp-val">{v}</span>

  return (
    <div className="landing">
      <header className={`ld-topbar ${scrolled ? 'scrolled' : ''}`}>
        <Brand />
        <nav className="ld-nav">
          <a href="#features" className="btn sm ghost">ฟีเจอร์</a>
          <a href="#pricing" className="btn sm ghost">แพ็กเกจ</a>
          <button className="btn sm ghost" onClick={goLogin}>เข้าสู่ระบบ</button>
          <button className="btn sm primary" onClick={goSignup}>ทดลองฟรี</button>
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
              โกดัง โรงงาน โชว์รูม ออฟฟิศ บ้าน คอนโด ที่ดิน — จากกระดาษ/Excel/AppSheet ที่กระจัดกระจาย
              สู่ระบบเดียวที่ทั้งทีมใช้ร่วมกัน: ฐานข้อมูล แผนที่ แผนพาชม เอกสารเสนอลูกค้า
              และผู้ช่วย AI ที่รู้จักทรัพย์ของคุณทุกตัว
            </p>
            <div className="ld-cta-row">
              <button className="btn primary ld-cta" onClick={goSignup}>
                {trialTxt}
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
              <small>ทีมนายหน้าอสังหาฯ ใช้จริง<br /><b>{trialTxt}</b> · ไม่ต้องผูกบัตรเครดิต · ยกเลิกได้ทุกเมื่อ</small>
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
          ใช้ได้ทั้งบนคอมและมือถือ
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
              <p>{tt(f.desc)}</p>
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
        <h2>{trialDays > 0 ? `ราคาโปร่งใส ทดลองฟรี ${trialDays} วัน` : 'ราคาโปร่งใส'}</h2>
        <p className="ld-lead">
          {trialDays > 0 ? `สมัครแล้วทดลองใช้ฟรี ${trialDays} วัน ` : 'สมัครใช้งานได้ทันที '}
          ไม่ต้องผูกบัตรเครดิต — จ่ายรายปีถูกกว่า
        </p>
        {/* .ld-billing เป็น inline-flex — ครอบด้วย div block เพื่อบังคับให้อยู่คนละบรรทัด */}
        <div style={{ textAlign: 'center' }}>
          <div className="ld-billing" role="group" aria-label="รอบการชำระเงิน" style={{ marginBottom: 0 }}>
            <button type="button" className={billing === 'monthly' ? 'on' : ''} onClick={() => setBilling('monthly')}>รายเดือน</button>
            <button type="button" className={billing === 'yearly' ? 'on' : ''} onClick={() => setBilling('yearly')}>
              รายปี <span className="save">−{savePct}%</span>
            </button>
          </div>
        </div>
        {/* ตัวเลือกระดับอยู่บรรทัดล่าง — ชิดการ์ดราคาที่ราคาเปลี่ยนตาม */}
        <div style={{ textAlign: 'center' }}>
          <div className="ld-billing" role="group" aria-label="ระดับตามจำนวนทรัพย์" style={{ marginTop: 10 }}>
            {TIERS.map((t) => (
              <button key={t} type="button" className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>
                ≤ {t} ทรัพย์
              </button>
            ))}
          </div>
        </div>
        <div className="ld-pricing">
          {PLANS.map((p) => {
            const pr = prices[p.key][tier]
            const perMonth = billing === 'yearly' ? Math.round(pr.yearly / 12) : pr.monthly
            const yearTotal = billing === 'yearly' ? pr.yearly : null
            return (
              <div key={p.name} className={`ld-price-card ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="ld-price-badge">คุ้มสุด</span>}
                <h3>{p.name}</h3>
                <p className="ld-price-tag">{p.tag} · ทรัพย์ไม่เกิน {tier} รายการ</p>
                <div className="ld-price-amt">
                  <span className="cur">฿</span>{perMonth.toLocaleString()}<span className="per">/เดือน</span>
                </div>
                <p className="ld-price-note">
                  {yearTotal ? `เรียกเก็บ ฿${yearTotal.toLocaleString()}/ปี` : 'จ่ายรายปีเหลือ ฿' + Math.round(pr.yearly / 12).toLocaleString() + '/เดือน'}
                </p>
                <ul>
                  {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
                <button className={`btn ld-cta ${p.featured ? 'primary' : ''}`} onClick={goSignup}>
                  {tt(p.cta)}
                </button>
              </div>
            )
          })}
        </div>
        <div className="ld-compare">
          <p className="ld-compare-title">เทียบฟีเจอร์แบบละเอียด</p>
          <div className="ld-compare-scroll">
            <table className="ld-compare-table">
              <thead>
                <tr>
                  <th>ฟีเจอร์</th>
                  <th>Basic</th>
                  <th className="pro-col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{cmpCell(r.free)}</td>
                    <td className="pro-col">{cmpCell(r.pro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--muted, #6b7280)', margin: '14px 0 0' }}>
          ทรัพย์มากกว่า 500 รายการ / ต้องการ SLA พิเศษ → <b>Enterprise</b> คุยกับทีมงานเพื่อใบเสนอราคา (LINE {contact.lineId})
        </p>
        <div className="ld-referral">
          <span className="ld-referral-emoji">🎁</span>
          <div>
            <b>ชวนเพื่อน {refSet.need} คน รับ Pro ฟรี {refSet.days} วัน</b>
            {/* เงื่อนไขจริง: นับเมื่อเพื่อนชำระเงินครั้งแรก + มีเพดานรวม — เขียนให้ตรง ไม่ให้เข้าใจผิด */}
            <span>
              เพื่อนสมัครแล้วเลือกแพ็กเกจ (ชำระเงินครั้งแรก) ครบทุก {refSet.need} คน องค์กรคุณได้ Pro เพิ่ม {refSet.days} วัน
              {refSet.maxDays > 0 ? ` — สะสมได้สูงสุด ${refSet.maxDays} วัน` : ''}
            </span>
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
              <p>{tt(s.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-contact" id="contact">
        <h2>พร้อมยกระดับทีมของคุณหรือยัง?</h2>
        <p>
          {trialDays > 0 ? `ทดลองใช้ฟรี ${trialDays} วันแล้วเริ่มได้ทันที` : 'สมัครแล้วเริ่มได้ทันที'}
          {' '}— หรือถ้ามีคำถาม/อยากให้ช่วยย้ายข้อมูลเดิม ทักทีมงานได้เลย ไม่มีค่าใช้จ่าย
        </p>
        <div className="ld-cta-row">
          <button className="btn primary ld-cta" onClick={goSignup}>
            {trialTxt}
          </button>
          <a className="btn ld-cta on-dark" href={contact.lineUrl} target="_blank" rel="noreferrer">
            LINE {contact.lineId}
          </a>
          <a className="btn ld-cta on-dark" href={`tel:${contact.phone.replace(/-/g, '')}`}>
            <IconPhone size={18} /> {contact.phone}
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
