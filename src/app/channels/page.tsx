'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { RefreshCw, Settings, Zap, Plus, CheckCircle2, XCircle, ShoppingCart, Package, Unlink } from 'lucide-react'

/* ─── 채널 로고 (Google Favicon API) ────────────────────────── */
const LOGO: Record<string, string> = {
  coupang: 'https://www.google.com/s2/favicons?domain=coupang.com&sz=64',
  naver:   'https://www.google.com/s2/favicons?domain=smartstore.naver.com&sz=64',
  '11st':  'https://www.google.com/s2/favicons?domain=11st.co.kr&sz=64',
  gmarket: 'https://www.google.com/s2/favicons?domain=gmarket.co.kr&sz=64',
  auction: 'https://www.google.com/s2/favicons?domain=auction.co.kr&sz=64',
  wemakeprice: 'https://www.google.com/s2/favicons?domain=wemakeprice.com&sz=64',
}

const INIT_CHANNELS = [
  { id:'1', name:'쿠팡',            type:'coupang', color:'from-orange-400 to-orange-600', active:true,  seller_id:'A000123456', synced:89,  orders:32, features:['상품등록','가격수정','주문수집','송장전송','CS연동'] },
  { id:'2', name:'네이버 스마트스토어', type:'naver',   color:'from-green-400 to-green-600',  active:true,  seller_id:'mystore001', synced:134, orders:18, features:['상품등록','가격수정','주문수집','송장전송'] },
  { id:'3', name:'11번가',           type:'11st',    color:'from-red-400 to-red-600',       active:true,  seller_id:'seller789',  synced:67,  orders:8,  features:['상품등록','주문수집','송장전송'] },
  { id:'4', name:'G마켓',            type:'gmarket', color:'from-blue-400 to-blue-600',     active:false, seller_id:null,         synced:0,   orders:0,  features:['상품등록','가격수정','주문수집','송장전송'] },
  { id:'5', name:'옥션',             type:'auction', color:'from-yellow-400 to-yellow-600', active:false, seller_id:null,         synced:0,   orders:0,  features:['상품등록','주문수집','송장전송'] },
]

type Channel = typeof INIT_CHANNELS[0]

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
        <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>채널 목록</h2>
        <Button onClick={() => setAddOpen(true)}><Plus size={14}/>채널 추가</Button>
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

              {/* 버튼 */}
              <div style={{ display:'flex', gap:8 }}>
                {ch.active ? (
                  <>
                    <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }}><RefreshCw size={12}/>동기화</Button>
                    <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }} onClick={() => { setSelCh(ch); setSettingsOpen(true) }}><Settings size={12}/>설정</Button>
                  </>
                ) : (
                  <Button size="sm" style={{ width:'100%', fontSize:12 }} onClick={() => { setSelCh(ch); setSettingsOpen(true) }}><Zap size={12}/>연동 시작</Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

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
