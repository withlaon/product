'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { RefreshCw, Settings, Zap, Plus, CheckCircle2, XCircle, ShoppingCart, Package, Unlink, Tag, Info, X } from 'lucide-react'

/* ─── 채널 로고 (Google Favicon API) ────────────────────────── */
const LOGO: Record<string, string> = {
  coupang: 'https://www.google.com/s2/favicons?domain=coupang.com&sz=64',
  naver:   'https://www.google.com/s2/favicons?domain=smartstore.naver.com&sz=64',
  '11st':  'https://www.google.com/s2/favicons?domain=11st.co.kr&sz=64',
  gmarket: 'https://www.google.com/s2/favicons?domain=gmarket.co.kr&sz=64',
  auction: 'https://www.google.com/s2/favicons?domain=auction.co.kr&sz=64',
  wemakeprice: 'https://www.google.com/s2/favicons?domain=wemakeprice.com&sz=64',
}

type MallCategory = { id:string; name:string; code:string }
type MallExtraInfo = { store_name:string; store_url:string; contact:string; delivery_days:string; notes:string }
type Channel = {
  id:string; name:string; type:string; color:string; active:boolean
  seller_id:string|null; synced:number; orders:number; features:string[]
  categories: MallCategory[]
  extra_info: MallExtraInfo
}

const DEF_EXTRA: MallExtraInfo = { store_name:'', store_url:'', contact:'', delivery_days:'', notes:'' }

const INIT_CHANNELS: Channel[] = [
  { id:'1', name:'쿠팡',            type:'coupang', color:'from-orange-400 to-orange-600', active:true,  seller_id:'A000123456', synced:89,  orders:32, features:['상품등록','가격수정','주문수집','송장전송','CS연동'], categories:[], extra_info:{...DEF_EXTRA} },
  { id:'2', name:'네이버 스마트스토어', type:'naver',   color:'from-green-400 to-green-600',  active:true,  seller_id:'mystore001', synced:134, orders:18, features:['상품등록','가격수정','주문수집','송장전송'], categories:[], extra_info:{...DEF_EXTRA} },
  { id:'3', name:'11번가',           type:'11st',    color:'from-red-400 to-red-600',       active:true,  seller_id:'seller789',  synced:67,  orders:8,  features:['상품등록','주문수집','송장전송'], categories:[], extra_info:{...DEF_EXTRA} },
  { id:'4', name:'G마켓',            type:'gmarket', color:'from-blue-400 to-blue-600',     active:false, seller_id:null,         synced:0,   orders:0,  features:['상품등록','가격수정','주문수집','송장전송'], categories:[], extra_info:{...DEF_EXTRA} },
  { id:'5', name:'옥션',             type:'auction', color:'from-yellow-400 to-yellow-600', active:false, seller_id:null,         synced:0,   orders:0,  features:['상품등록','주문수집','송장전송'], categories:[], extra_info:{...DEF_EXTRA} },
]

/* ─── 채널 로고 이미지 컴포넌트 ─────────────────────────────── */
function ChannelLogo({ ch, size = 44 }: { ch: Channel; size?: number }) {
  const [err, setErr] = useState(false)
  const logo = LOGO[ch.type]
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.32,
      background: 'white', border: '1.5px solid rgba(0,0,0,0.08)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
    }}>
      {!err && logo ? (
        <img src={logo} alt={ch.name}
          style={{ width: size * 0.62, height: size * 0.62, objectFit: 'contain' }}
          onError={() => setErr(true)} />
      ) : (
        <span style={{ fontSize: size * 0.42 }}>🛒</span>
      )}
    </div>
  )
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState(INIT_CHANNELS)
  const [selCh, setSelCh]       = useState<Channel | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<Channel | null>(null)
  const [mallInfoOpen, setMallInfoOpen] = useState(false)
  const [mallInfoTab, setMallInfoTab]   = useState<'category'|'extra'>('category')
  const [newCatName, setNewCatName]     = useState('')
  const [newCatCode, setNewCatCode]     = useState('')

  const [extraDraft, setExtraDraft] = useState<MallExtraInfo>({...DEF_EXTRA})

  const openMallInfo = (ch: Channel) => {
    setSelCh(ch); setMallInfoOpen(true); setMallInfoTab('category')
    setNewCatName(''); setNewCatCode('')
    setExtraDraft({...ch.extra_info})
  }
  const addCategory = () => {
    if (!selCh || !newCatName.trim()) return
    const cat: MallCategory = { id: String(Date.now()), name: newCatName.trim(), code: newCatCode.trim() }
    setChannels(prev => prev.map(c => c.id === selCh.id ? { ...c, categories:[...c.categories, cat] } : c))
    setSelCh(prev => prev ? { ...prev, categories:[...prev.categories, cat] } : prev)
    setNewCatName(''); setNewCatCode('')
  }
  const removeCategory = (catId: string) => {
    if (!selCh) return
    setChannels(prev => prev.map(c => c.id === selCh.id ? { ...c, categories: c.categories.filter(ct=>ct.id!==catId) } : c))
    setSelCh(prev => prev ? { ...prev, categories: prev.categories.filter(ct=>ct.id!==catId) } : prev)
  }
  const saveExtraInfo = (info: MallExtraInfo) => {
    if (!selCh) return
    setChannels(prev => prev.map(c => c.id === selCh.id ? { ...c, extra_info:info } : c))
    setSelCh(prev => prev ? { ...prev, extra_info:info } : prev)
  }

  const active       = channels.filter(c => c.active)
  const totalOrders  = active.reduce((s, c) => s + c.orders, 0)
  const totalSynced  = active.reduce((s, c) => s + c.synced, 0)

  const handleDisconnect = (id: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active: false, seller_id: null, synced: 0, orders: 0 } : c))
    setConfirmDisconnect(null)
  }

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'연동 채널',    v: active.length + '개',   cls:'text-blue-600',    bg:'#eff6ff' },
          { label:'오늘 주문 합계', v: totalOrders + '건',    cls:'text-emerald-600', bg:'#ecfdf5' },
          { label:'연동 상품 합계', v: totalSynced + '개',    cls:'text-violet-600',  bg:'#f5f3ff' },
        ].map(c => (
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p className={c.cls} style={{ fontSize:28, fontWeight:900, lineHeight:1, marginTop:6 }}>{c.v}</p>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>쇼핑몰 목록</h2>
        <Button onClick={() => setAddOpen(true)}><Plus size={14}/>쇼핑몰 추가</Button>
      </div>

      {/* 채널 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {channels.map(ch => (
          <div key={ch.id} className="pm-card overflow-hidden" style={{ opacity: ch.active ? 1 : 0.72, transition:'opacity 200ms' }}>
            {/* 상단 컬러 라인 */}
            <div className={`h-1.5 bg-gradient-to-r ${ch.color}`} />
            <div style={{ padding:20 }}>
              {/* 헤더: 로고 + 이름 + 상태 */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <ChannelLogo ch={ch} />
                  <div>
                    <p style={{ fontWeight:900, color:'#1e293b', fontSize:14 }}>{ch.name}</p>
                    {ch.seller_id && (
                      <p style={{ fontSize:11, color:'#94a3b8', marginTop:2, fontFamily:'monospace' }}>ID: {ch.seller_id}</p>
                    )}
                  </div>
                </div>

                {/* 상태 뱃지 + 연동해제 버튼 */}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  {ch.active ? (
                    <>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, color:'#15803d', background:'#f0fdf4', padding:'4px 10px', borderRadius:99, border:'1px solid #bbf7d0' }}>
                        <CheckCircle2 size={11}/>연동중
                      </span>
                      <button
                        onClick={() => setConfirmDisconnect(ch)}
                        title="연동 해제"
                        style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:800, color:'#be123c', background:'#fff1f2', border:'1px solid #fecdd3', padding:'4px 9px', borderRadius:99, cursor:'pointer', transition:'background 150ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#ffe4e6')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff1f2')}
                      >
                        <Unlink size={10}/>해제
                      </button>
                    </>
                  ) : (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, color:'#94a3b8', background:'#f1f5f9', padding:'4px 10px', borderRadius:99 }}>
                      <XCircle size={11}/>미연동
                    </span>
                  )}
                </div>
              </div>

              {/* 통계 (연동중일 때만) */}
              {ch.active && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div style={{ background:'#f8fafc', borderRadius:12, padding:'10px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                      <ShoppingCart size={11} color="#94a3b8"/>
                      <span style={{ fontSize:10, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>오늘 주문</span>
                    </div>
                    <p style={{ fontSize:22, fontWeight:900, color:'#1e293b', lineHeight:1 }}>
                      {ch.orders}<span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', marginLeft:2 }}>건</span>
                    </p>
                  </div>
                  <div style={{ background:'#f8fafc', borderRadius:12, padding:'10px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                      <Package size={11} color="#94a3b8"/>
                      <span style={{ fontSize:10, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>연동 상품</span>
                    </div>
                    <p style={{ fontSize:22, fontWeight:900, color:'#1e293b', lineHeight:1 }}>
                      {ch.synced}<span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', marginLeft:2 }}>개</span>
                    </p>
                  </div>
                </div>
              )}

              {/* 기능 뱃지 */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
                {ch.features.map(f => (
                  <span key={f} style={{ fontSize:10.5, fontWeight:700, background:'#eff6ff', color:'#2563eb', padding:'2px 8px', borderRadius:99 }}>{f}</span>
                ))}
              </div>

              {/* 카테고리 표시 */}
              {ch.categories.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                  {ch.categories.slice(0,3).map(ct=>(
                    <span key={ct.id} style={{ fontSize:10.5, fontWeight:700, background:'#faf5ff', color:'#7e22ce', padding:'2px 8px', borderRadius:99, border:'1px solid #e9d5ff' }}>
                      {ct.name}{ct.code?` (${ct.code})`:''}
                    </span>
                  ))}
                  {ch.categories.length > 3 && <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:700 }}>+{ch.categories.length-3}개</span>}
                </div>
              )}

              {/* 버튼 */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {ch.active ? (
                  <>
                    <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }}><RefreshCw size={12}/>동기화</Button>
                    <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }} onClick={() => { setSelCh(ch); setSettingsOpen(true) }}><Settings size={12}/>설정</Button>
                  </>
                ) : (
                  <Button size="sm" style={{ flex:1, fontSize:12 }} onClick={() => { setSelCh(ch); setSettingsOpen(true) }}><Zap size={12}/>연동 시작</Button>
                )}
                <Button variant="outline" size="sm" style={{ fontSize:12 }} onClick={() => openMallInfo(ch)}>
                  <Tag size={12}/>카테고리/정보
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 카테고리 / 부가정보 모달 ── */}
      {selCh && mallInfoOpen && (
        <Modal isOpen onClose={() => setMallInfoOpen(false)} title={`${selCh.name} — 카테고리 · 부가정보`} size="lg">
          {/* 탭 */}
          <div style={{ display:'flex', gap:0, borderBottom:'2px solid #f1f5f9', marginBottom:18 }}>
            {(['category','extra'] as const).map(t => (
              <button key={t} onClick={() => setMallInfoTab(t)}
                style={{ padding:'8px 20px', fontSize:13, fontWeight:800, background:'none', border:'none', cursor:'pointer',
                  color: mallInfoTab===t ? '#7e22ce' : '#94a3b8',
                  borderBottom: mallInfoTab===t ? '2px solid #7e22ce' : '2px solid transparent',
                  marginBottom:-2 }}>
                {t==='category' ? '📂 카테고리 등록' : '📋 부가정보'}
              </button>
            ))}
          </div>

          {mallInfoTab === 'category' && (
            <div>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
                상품 등록 시 자동으로 매핑할 <b>{selCh.name}</b> 카테고리를 등록하세요.
              </p>
              {/* 카테고리 추가 입력 */}
              <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'flex-end' }}>
                <div style={{ flex:2 }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>카테고리명 *</label>
                  <input value={newCatName} onChange={e=>setNewCatName(e.target.value)}
                    placeholder="예) 여성패션 > 가방" onKeyDown={e=>{if(e.key==='Enter') addCategory()}}
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>카테고리 코드</label>
                  <input value={newCatCode} onChange={e=>setNewCatCode(e.target.value)}
                    placeholder="숫자코드"
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
                <button onClick={addCategory}
                  style={{ height:36, padding:'0 16px', background:'#7e22ce', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                  <Plus size={12}/>추가
                </button>
              </div>
              {/* 카테고리 목록 */}
              {selCh.categories.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'#cbd5e1', fontSize:13 }}>등록된 카테고리가 없습니다</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {selCh.categories.map(ct => (
                    <div key={ct.id} style={{ display:'flex', alignItems:'center', gap:10, background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'8px 14px' }}>
                      <Tag size={13} color="#7e22ce" style={{ flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:13, fontWeight:700, color:'#4c1d95' }}>{ct.name}</span>
                      {ct.code && <span style={{ fontSize:11, fontFamily:'monospace', color:'#7e22ce', background:'#ede9fe', padding:'2px 7px', borderRadius:5 }}>{ct.code}</span>}
                      <button onClick={() => removeCategory(ct.id)}
                        style={{ width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:5, cursor:'pointer' }}>
                        <X size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mallInfoTab === 'extra' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { label:'스토어명', key:'store_name' as const, placeholder:'쇼핑몰 스토어/상점 이름' },
                { label:'스토어 URL', key:'store_url' as const, placeholder:'https://...' },
                { label:'담당자 연락처', key:'contact' as const, placeholder:'010-0000-0000' },
                { label:'배송 기간 (일)', key:'delivery_days' as const, placeholder:'예) 3' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>{label}</label>
                  <input value={extraDraft[key]} onChange={e => setExtraDraft(d=>({...d,[key]:e.target.value}))}
                    placeholder={placeholder}
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
              ))}
              <div>
                <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>비고</label>
                <textarea value={extraDraft.notes} onChange={e=>setExtraDraft(d=>({...d,notes:e.target.value}))}
                  placeholder="메모"
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:70 }}/>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
                <Button variant="outline" onClick={() => setMallInfoOpen(false)}>취소</Button>
                <Button onClick={() => { saveExtraInfo(extraDraft); setMallInfoOpen(false) }}><Info size={13}/>저장</Button>
              </div>
            </div>
          )}

          {mallInfoTab === 'category' && (
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
              <Button onClick={() => setMallInfoOpen(false)}>확인</Button>
            </div>
          )}
        </Modal>
      )}

      {/* ── 연동 해제 확인 모달 ── */}
      {confirmDisconnect && (
        <Modal isOpen onClose={() => setConfirmDisconnect(null)} title="연동 해제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
              <ChannelLogo ch={confirmDisconnect} size={56} />
            </div>
            <p style={{ fontSize:15, fontWeight:800, color:'#1e293b', marginBottom:8 }}>
              {confirmDisconnect.name} 연동을 해제하시겠습니까?
            </p>
            <p style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8', lineHeight:1.6 }}>
              연동을 해제하면 해당 채널의 주문 수집과<br/>상품 연동이 중단됩니다.
            </p>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>취소</Button>
            <Button onClick={() => handleDisconnect(confirmDisconnect.id)}
              style={{ background:'#dc2626', borderColor:'#dc2626' }}>
              <Unlink size={13}/>연동 해제
            </Button>
          </div>
        </Modal>
      )}

      {/* ── API 설정 모달 ── */}
      {selCh && (
        <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title={`${selCh.name} API 설정`}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* 채널 헤더 */}
            <div className={`bg-gradient-to-r ${selCh.color}`} style={{ borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
              <ChannelLogo ch={selCh} size={44} />
              <div>
                <p style={{ fontWeight:900, color:'white', fontSize:15 }}>{selCh.name}</p>
                <p style={{ color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:700, marginTop:2 }}>API 연동 설정</p>
              </div>
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>판매자 ID / 계정</label>
              <Input placeholder="판매자 ID 또는 이메일" defaultValue={selCh.seller_id || ''} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>API Key</label>
              <Input type="password" placeholder="API Key 입력" />
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>API Secret</label>
              <Input type="password" placeholder="API Secret 입력" />
            </div>
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:12, fontWeight:700, color:'#92400e' }}>
              💡 API 키는 각 쇼핑몰 판매자센터 → 개발자 API 메뉴에서 발급받을 수 있습니다.
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>취소</Button>
              <Button><Zap size={13}/>연결 테스트 후 저장</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 채널 추가 모달 ── */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="채널 추가">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#64748b' }}>연동할 쇼핑몰을 선택하세요.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {channels.filter(c => !c.active).map(ch => (
              <button key={ch.id}
                onClick={() => { setAddOpen(false); setSelCh(ch); setSettingsOpen(true) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:'1.5px solid rgba(15,23,42,0.09)', borderRadius:14, background:'white', cursor:'pointer', textAlign:'left', transition:'all 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#3b82f6'; e.currentTarget.style.background='#eff6ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.09)'; e.currentTarget.style.background='white' }}
              >
                <ChannelLogo ch={ch} size={36} />
                <span style={{ fontWeight:800, color:'#334155', fontSize:13 }}>{ch.name}</span>
              </button>
            ))}
          </div>
          {channels.filter(c => !c.active).length === 0 && (
            <p style={{ textAlign:'center', fontSize:13, fontWeight:700, color:'#94a3b8', padding:'16px 0' }}>
              모든 채널이 연동되어 있습니다.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
