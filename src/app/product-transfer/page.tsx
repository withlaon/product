'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Send, RefreshCw, CheckCircle2, XCircle, Clock, Package, Search, Plus } from 'lucide-react'

type ProductStatus = 'active'|'soldout'|'pending_delete'|'upcoming'|'ready_to_ship'
interface MallCategory { channel:string; category:string; category_code:string }
interface BasicInfo { title:string; brand:string; origin:string; manufacturer:string; material:string; description:string; handling:string; notes:string }
interface Product {
  id:string; code:string; name:string; category:string; status:ProductStatus
  basic_info:BasicInfo|null; mall_categories:MallCategory[]
}

const ACTIVE_CHANNELS = [
  { name:'쿠팡',            domain:'coupang.com' },
  { name:'네이버 스마트스토어', domain:'smartstore.naver.com' },
  { name:'11번가',           domain:'11st.co.kr' },
]

type TransferStatus = 'pending'|'sending'|'success'|'error'
interface TransferLog { id:string; product_name:string; channel:string; status:TransferStatus; message:string; sent_at:string }

function ChannelLogo({ domain, name }: { domain:string; name:string }) {
  const [err, setErr] = useState(false)
  if (err) return <span style={{ fontSize:16 }}>🛒</span>
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt={name} width={18} height={18} style={{ borderRadius:3, objectFit:'contain' }} onError={() => setErr(true)}/>
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
}

export default function ProductTransferPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [logs, setLogs]         = useState<TransferLog[]>([])
  const [sendTarget, setSendTarget] = useState<Product | null>(null)
  const [sendForm, setSendForm]     = useState<Record<string,string>>({})
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase.from('pm_products')
      .select('id,code,name,category,status,basic_info,mall_categories')
      .eq('status','ready_to_ship')
      .order('created_at',{ascending:false})
    if (data) setProducts(data as Product[])
    setLoading(false)
  }

  useEffect(() => { loadProducts() }, [])

  const openSend = (p: Product) => {
    setSendTarget(p)
    setSelectedChannels(p.mall_categories.map(m=>m.channel))
    setSendForm({
      title: p.basic_info?.title || p.name,
      brand: p.basic_info?.brand || '',
      origin: p.basic_info?.origin || '',
      manufacturer: p.basic_info?.manufacturer || '',
      material: p.basic_info?.material || '',
      description: p.basic_info?.description || '',
      handling: p.basic_info?.handling || '',
      notes: p.basic_info?.notes || '',
    })
  }

  const handleSend = async () => {
    if (!sendTarget) return
    const now = new Date().toLocaleString('ko-KR')
    const newLogs: TransferLog[] = selectedChannels.map(ch => ({
      id: String(Date.now()) + ch,
      product_name: sendTarget.name,
      channel: ch,
      status: 'success' as TransferStatus,
      message: '전송완료',
      sent_at: now,
    }))
    setLogs(prev => [...newLogs, ...prev])
    // 상태를 'active'로 변경
    await supabase.from('pm_products').update({ status:'active', basic_info: sendForm }).eq('id', sendTarget.id)
    setProducts(prev => prev.filter(p => p.id !== sendTarget.id))
    setSendTarget(null)
  }

  const filtered = products.filter(p =>
    !search || p.name.includes(search) || p.code.includes(search)
  )

  const stMap: Record<TransferStatus, { bg:string; color:string; label:string }> = {
    pending: { bg:'#f1f5f9', color:'#64748b', label:'대기' },
    sending: { bg:'#fef9c3', color:'#ca8a04', label:'전송중' },
    success: { bg:'#dcfce7', color:'#15803d', label:'완료' },
    error:   { bg:'#fee2e2', color:'#dc2626', label:'오류' },
  }

  return (
    <div className="pm-content">
      {/* KPI */}
      <div className="pm-kpi-grid" style={{ marginBottom:20 }}>
        {[
          { label:'전송준비 상품', value:products.length, color:'#7e22ce', bg:'#fdf4ff' },
          { label:'전송완료',     value:logs.filter(l=>l.status==='success').length, color:'#15803d', bg:'#f0fdf4' },
          { label:'전송오류',     value:logs.filter(l=>l.status==='error').length,   color:'#dc2626', bg:'#fef2f2' },
        ].map(k=>(
          <div key={k.label} className="pm-kpi-card" style={{ borderTop:`3px solid ${k.color}` }}>
            <p className="pm-kpi-label">{k.label}</p>
            <p className="pm-kpi-value" style={{ color:k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 전송준비 상품 */}
      <div className="pm-card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <p style={{ fontSize:13, fontWeight:800, color:'#374151' }}>📦 전송준비 상품</p>
          <Button variant="outline" size="sm" onClick={loadProducts}><RefreshCw size={12}/>새로고침</Button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <div style={{ position:'relative', flex:1 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
            <Input placeholder="상품명, 상품코드 검색..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:30 }}/>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:13 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8' }}>
            <Package size={36} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
            <p style={{ fontSize:13, fontWeight:700 }}>전송준비 상품이 없습니다</p>
            <p style={{ fontSize:12, marginTop:4 }}>상품관리에서 상품명 클릭 → 기본정보 입력 → 저장하면 전송준비 상태가 됩니다</p>
          </div>
        ) : (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>상품코드</th>
                  <th>상품명</th>
                  <th>카테고리</th>
                  <th>연동 쇼핑몰</th>
                  <th>타이틀</th>
                  <th style={{ textAlign:'center' }}>등록</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:12 }}>{p.code}</td>
                    <td style={{ fontWeight:700 }}>{p.name}</td>
                    <td style={{ fontSize:12, color:'#64748b' }}>{p.category}</td>
                    <td>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {p.mall_categories.length > 0
                          ? p.mall_categories.map(m => (
                              <span key={m.channel} style={{ fontSize:10.5, fontWeight:700, background:'#eff6ff', color:'#2563eb', padding:'2px 7px', borderRadius:99 }}>{m.channel}</span>
                            ))
                          : <span style={{ fontSize:11, color:'#94a3b8' }}>미설정</span>
                        }
                      </div>
                    </td>
                    <td style={{ fontSize:12, color:'#334155' }}>{p.basic_info?.title || '-'}</td>
                    <td style={{ textAlign:'center' }}>
                      <button onClick={() => openSend(p)}
                        style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:800, color:'white', background:'linear-gradient(135deg,#7e22ce,#6d28d9)', border:'none', borderRadius:8, padding:'5px 14px', cursor:'pointer' }}>
                        <Plus size={12}/>상품등록
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 전송 로그 */}
      {logs.length > 0 && (
        <div className="pm-card">
          <p style={{ fontSize:13, fontWeight:800, color:'#374151', marginBottom:12 }}>📋 전송 내역</p>
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr><th>상품명</th><th>쇼핑몰</th><th>전송일시</th><th>상태</th></tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const st = stMap[l.status]
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight:700 }}>{l.product_name}</td>
                      <td>{l.channel}</td>
                      <td style={{ fontSize:12, color:'#94a3b8' }}>{l.sent_at}</td>
                      <td>
                        <span style={{ fontSize:11, fontWeight:800, background:st.bg, color:st.color, padding:'3px 10px', borderRadius:99, display:'inline-flex', alignItems:'center', gap:4 }}>
                          {l.status==='success'&&<CheckCircle2 size={10}/>}
                          {l.status==='error'&&<XCircle size={10}/>}
                          {l.status==='pending'&&<Clock size={10}/>}
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 상품 전송 준비 팝업 */}
      {sendTarget && (
        <Modal isOpen onClose={() => setSendTarget(null)} title={`상품 전송 준비 — ${sendTarget.name}`} size="xl">
          <div style={{ background:'#fdf4ff', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, fontWeight:700, color:'#7e22ce' }}>
            💡 등록할 쇼핑몰을 선택하고, 기본 등록 정보를 확인·수정 후 전송하세요.
          </div>

          {/* 쇼핑몰 선택 */}
          <div style={{ marginBottom:16 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#374151', marginBottom:8 }}>📡 등록할 쇼핑몰</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {ACTIVE_CHANNELS.map(ch => {
                const active = selectedChannels.includes(ch.name)
                return (
                  <button key={ch.name}
                    onClick={() => setSelectedChannels(prev => active ? prev.filter(c=>c!==ch.name) : [...prev, ch.name])}
                    style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:10, cursor:'pointer',
                      border: active ? '2px solid #7e22ce' : '2px solid #e2e8f0',
                      background: active ? '#fdf4ff' : '#f8fafc',
                      fontWeight:700, fontSize:12, color: active ? '#7e22ce' : '#64748b' }}>
                    <ChannelLogo domain={ch.domain} name={ch.name}/>
                    {ch.name}
                    {active && <CheckCircle2 size={13} color="#7e22ce"/>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 기본정보 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <Label>상품 타이틀</Label>
              <Input value={sendForm.title||''} onChange={e=>setSendForm(f=>({...f,title:e.target.value}))}/>
            </div>
            {[
              {k:'brand',l:'브랜드'},{k:'origin',l:'원산지'},
              {k:'manufacturer',l:'제조사'},{k:'material',l:'소재'},
              {k:'handling',l:'취급주의'},{k:'notes',l:'비고'},
            ].map(({k,l})=>(
              <div key={k}><Label>{l}</Label>
                <Input value={sendForm[k]||''} onChange={e=>setSendForm(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
            <div style={{ gridColumn:'1/-1' }}>
              <Label>상세설명</Label>
              <textarea value={sendForm.description||''} onChange={e=>setSendForm(f=>({...f,description:e.target.value}))}
                style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:80 }}/>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
            <Button variant="outline" onClick={() => setSendTarget(null)}>취소</Button>
            <Button onClick={handleSend} disabled={selectedChannels.length===0}
              style={{ background:'linear-gradient(135deg,#7e22ce,#6d28d9)', borderColor:'#7e22ce' }}>
              <Send size={13}/>{selectedChannels.length}개 쇼핑몰에 상품 등록
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
