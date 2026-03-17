'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Building2, Bell, User, Save, CheckCircle2 } from 'lucide-react'

const TABS = [
  { id:'company',       label:'회사 정보', icon:Building2 },
  { id:'account',       label:'계정 관리', icon:User },
  { id:'notifications', label:'알림 설정', icon:Bell },
]

const LS_COMPANY = 'pm_settings_company'
const LS_ACCOUNT = 'pm_settings_account'
const LS_NOTIFS  = 'pm_settings_notifs'

const DEFAULT_COMPANY = { name:'', reg_no:'', ceo:'', address:'', tel:'', email:'', courier:'CJ대한통운' }
const DEFAULT_ACCOUNT = { name:'', email:'' }
const DEFAULT_NOTIFS = [
  { id:'stock',    label:'재고 부족 알림',   desc:'최소 재고 이하로 떨어질 때',        on:true  },
  { id:'order',    label:'신규 주문 알림',   desc:'새 주문이 들어올 때',              on:true  },
  { id:'cs',       label:'새 CS 접수 알림', desc:'새 고객 문의가 접수될 때',         on:true  },
  { id:'cs_urg',   label:'긴급 CS 알림',    desc:'긴급 CS가 접수될 때 즉시 알림',    on:true  },
  { id:'delay',    label:'배송 지연 알림',   desc:'배송이 지연될 때',                on:false },
  { id:'report',   label:'일일 리포트',      desc:'매일 오전 9시 영업 현황 요약',     on:false },
  { id:'purchase', label:'발주 입고 알림',   desc:'발주 입고 완료 시 알림',           on:true  },
]

/* ── localStorage 헬퍼 ── */
function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch { return fallback }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

/* ─── 토글 ──────────────────────────────────────────────────── */
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      style={{
        width:44, height:24, borderRadius:99, display:'flex', alignItems:'center',
        padding:'0 2px', cursor:'pointer', border:'none', transition:'background 200ms',
        background: on ? '#2563eb' : '#e2e8f0', flexShrink:0,
      }}>
      <div style={{
        width:20, height:20, background:'white', borderRadius:'50%',
        boxShadow:'0 1px 4px rgba(0,0,0,0.18)', transition:'transform 200ms',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
      }}/>
    </button>
  )
}

/* ─── 필드 ──────────────────────────────────────────────────── */
function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{label}</label>
      {children}
    </div>
  )
}

/* ─── 저장 완료 피드백 ──────────────────────────────────────── */
function useSaved() {
  const [saved, setSaved] = useState(false)
  const trigger = () => { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  return { saved, trigger }
}

/* ─── 카드 래퍼 ─────────────────────────────────────────────── */
function Card({ title, children }: { title:string; children:React.ReactNode }) {
  return (
    <div className="pm-card p-6">
      <h2 style={{ fontSize:15, fontWeight:900, color:'#1e293b', marginBottom:20 }}>{title}</h2>
      {children}
    </div>
  )
}

/* ─── 메인 ──────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [tab, setTab] = useState('company')
  const [hydrated, setHydrated] = useState(false)

  /* 회사 정보 */
  const [company, setCompany] = useState(DEFAULT_COMPANY)
  const companySaved = useSaved()

  /* 계정 관리 */
  const [account, setAccount] = useState(DEFAULT_ACCOUNT)
  const [pw, setPw] = useState({ current:'', next:'', confirm:'' })
  const [pwErr, setPwErr] = useState('')
  const accountSaved = useSaved()

  /* 알림 설정 */
  const [notifs, setNotifs] = useState(DEFAULT_NOTIFS)
  const notifSaved = useSaved()

  /* ── localStorage에서 초기값 로드 ── */
  useEffect(() => {
    setCompany(lsGet(LS_COMPANY, DEFAULT_COMPANY))
    setAccount(lsGet(LS_ACCOUNT, DEFAULT_ACCOUNT))
    setNotifs(lsGet(LS_NOTIFS, DEFAULT_NOTIFS))
    setHydrated(true)
  }, [])

  const handleCompanySave = () => {
    lsSet(LS_COMPANY, company)
    companySaved.trigger()
  }

  const handlePwSave = () => {
    if (!pw.current) { setPwErr('현재 비밀번호를 입력하세요.'); return }
    if (pw.next.length < 6) { setPwErr('새 비밀번호는 6자 이상이어야 합니다.'); return }
    if (pw.next !== pw.confirm) { setPwErr('새 비밀번호가 일치하지 않습니다.'); return }
    setPwErr('')
    setPw({ current:'', next:'', confirm:'' })
    lsSet(LS_ACCOUNT, account)
    accountSaved.trigger()
  }

  const handleAccountSave = () => {
    lsSet(LS_ACCOUNT, account)
    accountSaved.trigger()
  }

  const handleNotifSave = () => {
    lsSet(LS_NOTIFS, notifs)
    notifSaved.trigger()
  }

  const toggleNotif = (id: string) =>
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, on: !n.on } : n))

  if (!hydrated) return null

  return (
    <div className="pm-page" style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
      {/* 사이드 탭 메뉴 */}
      <div style={{ width:200, flexShrink:0 }}>
        <div className="pm-card p-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'10px 12px', borderRadius:10, border:'none', cursor:'pointer',
                fontSize:13, fontWeight:800, transition:'all 150ms',
                background: tab === t.id ? '#eff6ff' : 'transparent',
                color:      tab === t.id ? '#2563eb' : '#64748b',
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.background='#f8fafc' }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.background='transparent' }}
            >
              <t.icon size={15}/>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div style={{ flex:1, minWidth:0 }}>

        {/* ── 회사 정보 ── */}
        {tab === 'company' && (
          <Card title="회사 정보">
            <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:520 }}>
              <Field label="회사명 *">
                <Input placeholder="(주)예시회사" value={company.name}
                  onChange={e => setCompany(c => ({...c, name:e.target.value}))}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="사업자등록번호">
                  <Input placeholder="123-45-67890" value={company.reg_no}
                    onChange={e => setCompany(c => ({...c, reg_no:e.target.value}))}/>
                </Field>
                <Field label="대표자명">
                  <Input placeholder="홍길동" value={company.ceo}
                    onChange={e => setCompany(c => ({...c, ceo:e.target.value}))}/>
                </Field>
              </div>
              <Field label="사업장 주소">
                <Input placeholder="서울시 강남구 테헤란로 123" value={company.address}
                  onChange={e => setCompany(c => ({...c, address:e.target.value}))}/>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="대표 전화">
                  <Input placeholder="02-1234-5678" value={company.tel}
                    onChange={e => setCompany(c => ({...c, tel:e.target.value}))}/>
                </Field>
                <Field label="대표 이메일">
                  <Input type="email" placeholder="admin@example.com" value={company.email}
                    onChange={e => setCompany(c => ({...c, email:e.target.value}))}/>
                </Field>
              </div>
              <Field label="기본 택배사">
                <Select className="w-full" value={company.courier}
                  onChange={e => setCompany(c => ({...c, courier:e.target.value}))}>
                  <option>CJ대한통운</option>
                  <option>롯데택배</option>
                  <option>한진택배</option>
                  <option>우체국택배</option>
                  <option>로젠택배</option>
                </Select>
              </Field>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Button onClick={handleCompanySave}>
                  <Save size={14}/>저장
                </Button>
                {companySaved.saved && (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:700, color:'#15803d' }}>
                    <CheckCircle2 size={14}/>저장되었습니다
                  </span>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ── 계정 관리 ── */}
        {tab === 'account' && (
          <Card title="계정 관리">
            <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:520 }}>
              {/* 프로필 카드 */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:16, background:'#f8fafc', borderRadius:14 }}>
                <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#8b5cf6,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, color:'white', flexShrink:0 }}>관</div>
                <div>
                  <p style={{ fontWeight:900, color:'#1e293b', fontSize:14 }}>관리자</p>
                  <p style={{ fontSize:11.5, color:'#94a3b8', marginTop:2 }}>admin@productpro.app</p>
                  <span style={{ fontSize:10.5, fontWeight:800, background:'#eff6ff', color:'#2563eb', padding:'2px 8px', borderRadius:99, marginTop:4, display:'inline-block' }}>최고 관리자</span>
                </div>
              </div>

              <Field label="이름">
                <Input placeholder="관리자" value={account.name}
                  onChange={e => setAccount(a => ({...a, name:e.target.value}))}/>
              </Field>
              <Field label="이메일">
                <Input type="email" placeholder="admin@example.com" value={account.email}
                  onChange={e => setAccount(a => ({...a, email:e.target.value}))}/>
              </Field>

              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Button onClick={handleAccountSave}>
                  <Save size={14}/>이름/이메일 저장
                </Button>
                {accountSaved.saved && (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:700, color:'#15803d' }}>
                    <CheckCircle2 size={14}/>저장되었습니다
                  </span>
                )}
              </div>

              {/* 비밀번호 변경 */}
              <div style={{ paddingTop:14, borderTop:'1px solid #f1f5f9' }}>
                <p style={{ fontSize:12.5, fontWeight:800, color:'#334155', marginBottom:12 }}>비밀번호 변경</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <Input type="password" placeholder="현재 비밀번호"
                    value={pw.current} onChange={e => setPw(p => ({...p, current:e.target.value}))}/>
                  <Input type="password" placeholder="새 비밀번호 (6자 이상)"
                    value={pw.next} onChange={e => setPw(p => ({...p, next:e.target.value}))}/>
                  <Input type="password" placeholder="새 비밀번호 확인"
                    value={pw.confirm} onChange={e => setPw(p => ({...p, confirm:e.target.value}))}/>
                  {pwErr && <p style={{ fontSize:12, fontWeight:700, color:'#dc2626' }}>{pwErr}</p>}
                </div>
                <div style={{ marginTop:10 }}>
                  <Button onClick={handlePwSave}>
                    <Save size={14}/>비밀번호 변경
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── 알림 설정 ── */}
        {tab === 'notifications' && (
          <Card title="알림 설정">
            <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:520 }}>
              {notifs.map(item => (
                <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'#f8fafc', borderRadius:12 }}>
                  <div>
                    <p style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{item.label}</p>
                    <p style={{ fontSize:11.5, color:'#94a3b8', marginTop:3 }}>{item.desc}</p>
                  </div>
                  <Toggle on={item.on} onToggle={() => toggleNotif(item.id)}/>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
                <Button onClick={handleNotifSave}>
                  <Save size={14}/>저장
                </Button>
                {notifSaved.saved && (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:700, color:'#15803d' }}>
                    <CheckCircle2 size={14}/>저장되었습니다
                  </span>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
