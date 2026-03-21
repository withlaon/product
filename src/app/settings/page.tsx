'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, EyeOff, Save, CheckCircle2, KeyRound, Globe, User, Lock } from 'lucide-react'

const LS_KEY = 'pm_site_accounts_v1'

interface SiteAccount {
  id:       string
  siteName: string
  username: string
  password: string
  siteUrl:  string
}

function newAccount(): SiteAccount {
  return { id: String(Date.now()), siteName:'', username:'', password:'', siteUrl:'' }
}

function lsLoad(): SiteAccount[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : [newAccount()]
  } catch { return [newAccount()] }
}
function lsSave(data: SiteAccount[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [showPw,   setShowPw]   = useState<Set<string>>(new Set())
  const [saved,    setSaved]    = useState(false)

  useEffect(() => { setAccounts(lsLoad()) }, [])

  const handleSave = () => {
    lsSave(accounts)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleAdd = () => setAccounts(prev => [...prev, newAccount()])

  const handleDelete = (id: string) =>
    setAccounts(prev => prev.length > 1 ? prev.filter(a => a.id !== id) : prev)

  const handleChange = (id: string, field: keyof SiteAccount, value: string) =>
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))

  const toggleShowPw = (id: string) =>
    setShowPw(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="pm-page" style={{ maxWidth:700, margin:'0 auto' }}>

      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <KeyRound size={18} color="white"/>
          </div>
          <div>
            <h1 style={{ fontSize:16, fontWeight:900, color:'#0f172a' }}>아이디 / 비밀번호</h1>
            <p style={{ fontSize:11.5, color:'#94a3b8', marginTop:1 }}>사이트별 계정 정보를 저장하세요</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {saved && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:700, color:'#059669' }}>
              <CheckCircle2 size={14}/>저장되었습니다
            </span>
          )}
          <button onClick={handleSave}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:800, color:'white', background:'#2563eb', border:'none', borderRadius:9, padding:'8px 18px', cursor:'pointer' }}>
            <Save size={14}/>저장
          </button>
        </div>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1.2fr 44px', gap:8, padding:'0 4px', marginBottom:6 }}>
        {[
          { icon: Globe,  label: '사이트명' },
          { icon: User,   label: '아이디' },
          { icon: Lock,   label: '비밀번호' },
          { icon: Globe,  label: '사이트 주소' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <Icon size={11} color="#94a3b8"/>
            <span style={{ fontSize:11, fontWeight:800, color:'#94a3b8' }}>{label}</span>
          </div>
        ))}
        <div/>
      </div>

      {/* 계정 목록 */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {accounts.map(acc => (
          <div key={acc.id} className="pm-card"
            style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1.2fr 44px', gap:8, padding:'12px 14px', alignItems:'center' }}>

            {/* 사이트명 */}
            <input
              placeholder="예: 11번가"
              value={acc.siteName}
              onChange={e => handleChange(acc.id, 'siteName', e.target.value)}
              style={{ width:'100%', fontSize:13, fontWeight:700, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', outline:'none', color:'#1e293b', background:'white' }}
              onFocus={e => e.currentTarget.style.borderColor='#2563eb'}
              onBlur={e => e.currentTarget.style.borderColor='#e2e8f0'}
            />

            {/* 아이디 */}
            <input
              placeholder="아이디"
              value={acc.username}
              onChange={e => handleChange(acc.id, 'username', e.target.value)}
              style={{ width:'100%', fontSize:13, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', outline:'none', color:'#334155', background:'white' }}
              onFocus={e => e.currentTarget.style.borderColor='#2563eb'}
              onBlur={e => e.currentTarget.style.borderColor='#e2e8f0'}
            />

            {/* 비밀번호 */}
            <div style={{ position:'relative' }}>
              <input
                type={showPw.has(acc.id) ? 'text' : 'password'}
                placeholder="비밀번호"
                value={acc.password}
                onChange={e => handleChange(acc.id, 'password', e.target.value)}
                style={{ width:'100%', fontSize:13, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 32px 7px 10px', outline:'none', color:'#334155', background:'white', boxSizing:'border-box' }}
                onFocus={e => e.currentTarget.style.borderColor='#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor='#e2e8f0'}
              />
              <button
                onClick={() => toggleShowPw(acc.id)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, color:'#94a3b8', display:'flex', alignItems:'center' }}>
                {showPw.has(acc.id) ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>

            {/* 사이트 주소 */}
            <input
              placeholder="https://"
              value={acc.siteUrl}
              onChange={e => handleChange(acc.id, 'siteUrl', e.target.value)}
              style={{ width:'100%', fontSize:12, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', outline:'none', color:'#64748b', background:'white' }}
              onFocus={e => e.currentTarget.style.borderColor='#2563eb'}
              onBlur={e => e.currentTarget.style.borderColor='#e2e8f0'}
            />

            {/* 삭제 */}
            <button
              onClick={() => handleDelete(acc.id)}
              disabled={accounts.length === 1}
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:8, cursor:accounts.length===1?'not-allowed':'pointer', opacity:accounts.length===1?0.3:1, flexShrink:0 }}>
              <Trash2 size={13}/>
            </button>
          </div>
        ))}
      </div>

      {/* 추가 버튼 */}
      <button onClick={handleAdd}
        style={{ marginTop:12, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:7, fontSize:13, fontWeight:800, color:'#2563eb', background:'#eff6ff', border:'1.5px dashed #bfdbfe', borderRadius:10, padding:'11px 0', cursor:'pointer' }}>
        <Plus size={14}/>사이트 추가
      </button>

    </div>
  )
}
