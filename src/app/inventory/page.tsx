'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { supabase } from '@/lib/supabase'
import {
  ArrowDownCircle, ArrowUpCircle, Search, AlertTriangle,
  Plus, Package, RefreshCw, ShieldAlert, ClipboardList,
} from 'lucide-react'

/* ─── 타입 ──────────────────────────────────────────────────── */
type TxType = 'in' | 'out' | 'defective' | 'adjust'
interface TxRecord {
  id: string; date: string; type: TxType
  product_code: string; product_name: string
  option_name: string; barcode: string
  qty: number; note: string
}
const TX_STYLE: Record<TxType, { label:string; bg:string; color:string; dot:string }> = {
  in:       { label:'입고',   bg:'#f0fdf4', color:'#15803d', dot:'#22c55e' },
  out:      { label:'출고',   bg:'#fff1f2', color:'#be123c', dot:'#ef4444' },
  defective:{ label:'불량',   bg:'#fff7ed', color:'#c2410c', dot:'#f97316' },
  adjust:   { label:'재고조정',bg:'#eff6ff', color:'#1d4ed8', dot:'#3b82f6' },
}
const TX_KEY = 'pm_inv_tx_v1'

interface PmOption {
  name: string; chinese_name: string; barcode: string; image: string
  ordered: number; received: number; sold: number
  current_stock?: number; defective?: number
}
interface PmProduct { id: string; code: string; name: string; category: string; options: PmOption[] }

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{children}</label>
}

function getStock(o: PmOption) {
  return o.current_stock !== undefined ? o.current_stock : Math.max(0, o.received - (o.sold || 0))
}
function getDefective(o: PmOption) { return o.defective || 0 }

/* ─── 거래 내역 localStorage ─────────────────────────────────── */
function loadTx(): TxRecord[] {
  try { const r = localStorage.getItem(TX_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveTx(tx: TxRecord[]) {
  try { localStorage.setItem(TX_KEY, JSON.stringify(tx)) } catch {}
}

/* ─── 메인 ──────────────────────────────────────────────────── */
export default function InventoryPage() {
  const [products, setProducts]   = useState<PmProduct[]>([])
  const [txList, setTxList]       = useState<TxRecord[]>([])
  const [tab, setTab]             = useState<'stock'|'tx'>('stock')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)

  // 모달 상태
  const [inModal,        setInModal]        = useState(false)
  const [outModal,       setOutModal]       = useState(false)
  const [defectModal,    setDefectModal]    = useState(false)
  const [adjustModal,    setAdjustModal]    = useState(false)

  // 공통 폼 상태
  const [selProduct, setSelProduct] = useState('')
  const [selOption,  setSelOption]  = useState('')
  const [qty,        setQty]        = useState('')
  const [note,       setNote]       = useState('')
  const [adjStock,   setAdjStock]   = useState('')  // 재고조정: 직접 입력값

  useEffect(() => { setTxList(loadTx()) }, [])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('pm_products').select('id,code,name,category,options').order('created_at', { ascending:false })
    if (data) setProducts(data as PmProduct[])
    setLoading(false)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  /* ── 선택된 상품/옵션 ── */
  const selectedProd  = products.find(p => p.id === selProduct)
  const selectedOpt   = selectedProd?.options.find(o => o.name === selOption) ?? null

  /* ── 공통: 폼 초기화 ── */
  const resetForm = () => { setSelProduct(''); setSelOption(''); setQty(''); setNote(''); setAdjStock('') }

  /* ── Supabase 옵션 업데이트 헬퍼 ── */
  const updateOption = async (
    prodId: string,
    opts: PmOption[],
    optName: string,
    updater: (o: PmOption) => PmOption,
  ) => {
    const updated = opts.map(o => o.name === optName ? updater(o) : o)
    await supabase.from('pm_products').update({ options: updated }).eq('id', prodId)
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, options: updated } : p))
    return updated
  }

  /* ── 거래 추가 ── */
  const addTx = (type: TxType, prod: PmProduct, opt: PmOption, amount: number, n: string) => {
    const record: TxRecord = {
      id: String(Date.now()), date: new Date().toISOString(), type,
      product_code: prod.code, product_name: prod.name, option_name: opt.name,
      barcode: opt.barcode, qty: amount, note: n,
    }
    const updated = [record, ...txList]
    setTxList(updated)
    saveTx(updated)
  }

  /* ── 입고 등록 ── */
  const handleIn = async () => {
    if (!selectedProd || !selectedOpt || !qty) return
    const n = Number(qty)
    if (n <= 0) return
    await updateOption(selectedProd.id, selectedProd.options, selOption, o => ({
      ...o,
      received: (o.received || 0) + n,
      current_stock: getStock(o) + n,
    }))
    addTx('in', selectedProd, selectedOpt, n, note)
    setInModal(false); resetForm()
  }

  /* ── 출고 등록 ── */
  const handleOut = async () => {
    if (!selectedProd || !selectedOpt || !qty) return
    const n = Number(qty)
    if (n <= 0) return
    await updateOption(selectedProd.id, selectedProd.options, selOption, o => ({
      ...o,
      current_stock: Math.max(0, getStock(o) - n),
    }))
    addTx('out', selectedProd, selectedOpt, -n, note)
    setOutModal(false); resetForm()
  }

  /* ── 불량 등록 ── */
  const handleDefect = async () => {
    if (!selectedProd || !selectedOpt || !qty) return
    const n = Number(qty)
    if (n <= 0) return
    await updateOption(selectedProd.id, selectedProd.options, selOption, o => ({
      ...o,
      current_stock: Math.max(0, getStock(o) - n),
      defective: getDefective(o) + n,
    }))
    addTx('defective', selectedProd, selectedOpt, -n, note || '불량 처리')
    setDefectModal(false); resetForm()
  }

  /* ── 재고 등록 (직접 조정) ── */
  const handleAdjust = async () => {
    if (!selectedProd || !selectedOpt || adjStock === '') return
    const newStock = Number(adjStock)
    if (newStock < 0) return
    const prev = getStock(selectedOpt)
    const delta = newStock - prev
    await updateOption(selectedProd.id, selectedProd.options, selOption, o => ({
      ...o, current_stock: newStock,
    }))
    addTx('adjust', selectedProd, selectedOpt, delta, note || `재고 조정 (${prev}→${newStock})`)
    setAdjustModal(false); resetForm()
  }

  /* ── KPI 계산 ── */
  const allOpts  = products.flatMap(p => p.options.map(o => ({ ...o, pName: p.name })))
  const totalStock = allOpts.reduce((s, o) => s + getStock(o), 0)
  const lowItems   = allOpts.filter(o => getStock(o) > 0 && getStock(o) <= 2).length
  const zeroItems  = allOpts.filter(o => getStock(o) === 0).length
  const totalDef   = allOpts.reduce((s, o) => s + getDefective(o), 0)

  const filteredProds = products.filter(p =>
    !search || p.name.includes(search) || p.code.includes(search) ||
    p.options.some(o => o.name.includes(search) || o.barcode.includes(search))
  )

  /* ── 공통 모달 폼 ── */
  const CommonForm = ({ type }: { type: TxType }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <Label>상품 선택 *</Label>
        <select value={selProduct} onChange={e => { setSelProduct(e.target.value); setSelOption('') }}
          style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none' }}>
          <option value="">— 상품 선택 —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
      </div>
      {selectedProd && (
        <div>
          <Label>옵션 선택 *</Label>
          <select value={selOption} onChange={e => setSelOption(e.target.value)}
            style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none' }}>
            <option value="">— 옵션 선택 —</option>
            {selectedProd.options.map(o => (
              <option key={o.name} value={o.name}>
                {o.name}{o.chinese_name ? ` (${o.chinese_name})` : ''} — 현재고: {getStock(o)}{getDefective(o)>0?` | 불량: ${getDefective(o)}`:''}
              </option>
            ))}
          </select>
        </div>
      )}
      {selectedOpt && (
        <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 14px', display:'flex', gap:16, flexWrap:'wrap' }}>
          {[['현재고', getStock(selectedOpt), '#059669'], ['입고누계', selectedOpt.received||0, '#0ea5e9'], ['불량', getDefective(selectedOpt), '#dc2626']].map(([l,v,c]) => (
            <div key={String(l)}>
              <p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8' }}>{l}</p>
              <p style={{ fontSize:15, fontWeight:900, color:String(c) }}>{v}</p>
            </div>
          ))}
          {selectedOpt.barcode && <div><p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8' }}>바코드</p><p style={{ fontSize:12, fontFamily:'monospace', fontWeight:700, color:'#475569' }}>{selectedOpt.barcode}</p></div>}
        </div>
      )}
      {type === 'adjust' ? (
        <div>
          <Label>조정 후 재고 수량 *</Label>
          <Input type="number" min="0" placeholder="조정 후 실제 재고 수량 입력" value={adjStock} onChange={e => setAdjStock(e.target.value)}/>
          {adjStock !== '' && selectedOpt && <p style={{ fontSize:11.5, color:'#6366f1', marginTop:4, fontWeight:700 }}>
            변동: {getStock(selectedOpt)} → {adjStock} ({Number(adjStock)-getStock(selectedOpt) >= 0 ? '+' : ''}{Number(adjStock)-getStock(selectedOpt)})
          </p>}
        </div>
      ) : (
        <div>
          <Label>{type==='in'?'입고':'출고/불량'} 수량 *</Label>
          <Input type="number" min="1" placeholder="수량 입력" value={qty} onChange={e => setQty(e.target.value)}/>
        </div>
      )}
      <div>
        <Label>비고</Label>
        <Input placeholder="비고 입력 (선택)" value={note} onChange={e => setNote(e.target.value)}/>
      </div>
    </div>
  )

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'전체 품목',   v:`${products.length}개`,               bg:'#eff6ff', color:'#1d4ed8' },
          { label:'총 재고량',   v:`${totalStock.toLocaleString()}개`,    bg:'#faf5ff', color:'#7e22ce' },
          { label:'재고 부족',   v:`${lowItems}개`,                       bg:'#fffbeb', color:'#d97706' },
          { label:'불량 수량',   v:`${totalDef.toLocaleString()}개`,      bg:'#fff1f2', color:'#be123c' },
        ].map(c=>(
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <p style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p style={{ fontSize:32, fontWeight:900, color: c.color, marginTop:4, lineHeight:1 }}>{c.v}</p>
          </div>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <Button style={{ background:'#059669', borderColor:'#059669' }} size="sm"
          onClick={() => { resetForm(); setInModal(true) }}>
          <ArrowDownCircle size={14}/>입고 등록
        </Button>
        <Button style={{ background:'#dc2626', borderColor:'#dc2626' }} size="sm"
          onClick={() => { resetForm(); setOutModal(true) }}>
          <ArrowUpCircle size={14}/>출고 등록
        </Button>
        <Button style={{ background:'#ea580c', borderColor:'#ea580c' }} size="sm"
          onClick={() => { resetForm(); setDefectModal(true) }}>
          <ShieldAlert size={14}/>불량 등록
        </Button>
        <Button style={{ background:'#2563eb', borderColor:'#2563eb' }} size="sm"
          onClick={() => { resetForm(); setAdjustModal(true) }}>
          <ClipboardList size={14}/>재고 등록
        </Button>
        <Button variant="outline" size="sm" onClick={loadProducts} style={{ marginLeft:'auto' }}>
          <RefreshCw size={13}/>새로고침
        </Button>
      </div>

      {/* 탭 */}
      <div className="pm-card overflow-hidden">
        <div style={{ display:'flex', borderBottom:'1px solid rgba(15,23,42,0.07)' }}>
          {[{id:'stock',label:'재고 현황'},{id:'tx',label:'입출고 내역'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as 'stock'|'tx')}
              style={{ padding:'12px 20px', fontSize:13, fontWeight:800, background:'none', border:'none', cursor:'pointer',
                borderBottom:`2px solid ${tab===t.id?'#2563eb':'transparent'}`,
                color: tab===t.id ? '#2563eb' : '#94a3b8' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 재고 현황 탭 ── */}
        {tab==='stock' && (
          <>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
              <div className="relative" style={{ width:260 }}>
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
                <Input placeholder="상품명, 코드, 옵션명..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon" />
              </div>
            </div>
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead><tr>
                  <th>상품명</th><th>코드</th><th>카테고리</th>
                  <th style={{ textAlign:'right' }}>현재고</th>
                  <th style={{ textAlign:'right' }}>불량</th>
                  <th style={{ textAlign:'right' }}>판매</th>
                  <th style={{ textAlign:'center' }}>상태</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8', fontSize:13 }}>불러오는 중...</td></tr>
                  )}
                  {!loading && filteredProds.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8' }}>
                      <Package size={36} style={{ opacity:0.2, marginBottom:8 }}/>
                      <p style={{ fontSize:13.5, fontWeight:700 }}>재고 데이터가 없습니다</p>
                      <p style={{ fontSize:12, color:'#cbd5e1' }}>상품관리에서 상품을 먼저 등록하세요</p>
                    </td></tr>
                  )}
                  {filteredProds.flatMap(prod =>
                    prod.options.map((opt, oi) => {
                      const stock = getStock(opt)
                      const defect = getDefective(opt)
                      const sold = Math.max(0, (opt.received||0) - stock)
                      const isZero = stock === 0
                      const isLow  = stock > 0 && stock <= 2
                      return (
                        <tr key={`${prod.id}_${oi}`}>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {(isZero||isLow) && <AlertTriangle size={12} color={isZero?'#dc2626':'#d97706'}/>}
                              <div>
                                <p style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{prod.name}</p>
                                <p style={{ fontSize:11, color:'#94a3b8', fontWeight:700 }}>{opt.name}{opt.chinese_name?` (${opt.chinese_name})`:''}</p>
                              </div>
                            </div>
                          </td>
                          <td><span style={{ fontFamily:'monospace', fontSize:11.5, background:'#f1f5f9', color:'#475569', padding:'2px 7px', borderRadius:5 }}>{prod.code}</span></td>
                          <td style={{ fontSize:12, color:'#64748b', fontWeight:700 }}>{prod.category}</td>
                          <td style={{ textAlign:'right', fontSize:15, fontWeight:900, color: isZero?'#dc2626':isLow?'#d97706':'#1e293b' }}>{stock}</td>
                          <td style={{ textAlign:'right', fontSize:13, fontWeight:800, color: defect>0?'#dc2626':'#cbd5e1' }}>{defect > 0 ? defect : '-'}</td>
                          <td style={{ textAlign:'right', fontSize:13, fontWeight:800, color:'#64748b' }}>{sold}</td>
                          <td style={{ textAlign:'center' }}>
                            <span style={{ fontSize:11, fontWeight:800, background: isZero?'#fff1f2':isLow?'#fff7ed':'#f0fdf4', color: isZero?'#be123c':isLow?'#c2410c':'#15803d', padding:'3px 9px', borderRadius:99 }}>
                              {isZero?'품절':isLow?'부족':'정상'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button onClick={() => { resetForm(); setSelProduct(prod.id); setSelOption(opt.name); setInModal(true) }}
                                style={{ fontSize:11, fontWeight:800, color:'#059669', background:'#f0fdf4', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>
                                입고
                              </button>
                              <button onClick={() => { resetForm(); setSelProduct(prod.id); setSelOption(opt.name); setOutModal(true) }}
                                style={{ fontSize:11, fontWeight:800, color:'#dc2626', background:'#fff1f2', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>
                                출고
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="pm-table-footer">
              <span>총 {filteredProds.reduce((s,p)=>s+p.options.length,0)}개 옵션 | 재고 부족 {zeroItems+lowItems}건</span>
            </div>
          </>
        )}

        {/* ── 입출고 내역 탭 ── */}
        {tab==='tx' && (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead><tr>{['일시','유형','상품명','옵션명','바코드','수량','비고'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {txList.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8' }}>
                    <p style={{ fontSize:13.5, fontWeight:700 }}>입출고 내역이 없습니다</p>
                  </td></tr>
                )}
                {txList.map(tx => {
                  const ts = TX_STYLE[tx.type]
                  return (
                    <tr key={tx.id}>
                      <td style={{ fontSize:11.5, color:'#94a3b8', whiteSpace:'nowrap' }}>
                        {new Date(tx.date).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, background:ts.bg, color:ts.color, padding:'3px 9px', borderRadius:99 }}>
                          <span style={{ width:5,height:5,borderRadius:'50%',background:ts.dot,display:'inline-block' }}/>
                          {ts.label}
                        </span>
                      </td>
                      <td style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{tx.product_name}</td>
                      <td style={{ fontSize:12.5, color:'#64748b' }}>{tx.option_name}</td>
                      <td><span style={{ fontFamily:'monospace', fontSize:11, background:'#f1f5f9', color:'#475569', padding:'2px 6px', borderRadius:4 }}>{tx.barcode||'-'}</span></td>
                      <td>
                        <span style={{ fontSize:15, fontWeight:900, color: tx.qty > 0 ? '#059669' : '#dc2626' }}>
                          {tx.qty > 0 ? `+${tx.qty}` : tx.qty}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:'#64748b' }}>{tx.note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 입고 등록 모달 ── */}
      <Modal isOpen={inModal} onClose={() => { setInModal(false); resetForm() }} title="입고 등록" size="md">
        <div style={{ background:'#f0fdf4', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#15803d' }}>
          💡 입고 등록 시 상품의 입고 누계와 현재고가 자동으로 증가합니다.
        </div>
        <CommonForm type="in"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setInModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleIn} style={{ background:'#059669', borderColor:'#059669' }}>
            <ArrowDownCircle size={13}/>입고 처리 완료
          </Button>
        </div>
      </Modal>

      {/* ── 출고 등록 모달 ── */}
      <Modal isOpen={outModal} onClose={() => { setOutModal(false); resetForm() }} title="출고 등록" size="md">
        <div style={{ background:'#fff1f2', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#be123c' }}>
          💡 출고 등록 시 상품의 현재고가 자동으로 감소합니다.
        </div>
        <CommonForm type="out"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setOutModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleOut} style={{ background:'#dc2626', borderColor:'#dc2626' }}>
            <ArrowUpCircle size={13}/>출고 처리 완료
          </Button>
        </div>
      </Modal>

      {/* ── 불량 등록 모달 ── */}
      <Modal isOpen={defectModal} onClose={() => { setDefectModal(false); resetForm() }} title="불량 등록" size="md">
        <div style={{ background:'#fff7ed', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#c2410c' }}>
          ⚠️ 불량 등록 시 현재고가 감소하고, 상품관리에 불량 수량이 누적됩니다.
        </div>
        <CommonForm type="defective"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setDefectModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleDefect} style={{ background:'#ea580c', borderColor:'#ea580c' }}>
            <ShieldAlert size={13}/>불량 등록 완료
          </Button>
        </div>
      </Modal>

      {/* ── 재고 등록 모달 ── */}
      <Modal isOpen={adjustModal} onClose={() => { setAdjustModal(false); resetForm() }} title="재고 등록 (직접 조정)" size="md">
        <div style={{ background:'#eff6ff', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#1d4ed8' }}>
          📋 실사 후 실제 재고 수량을 직접 입력하여 조정합니다.
        </div>
        <CommonForm type="adjust"/>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setAdjustModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleAdjust}>
            <Plus size={13}/>재고 조정 완료
          </Button>
        </div>
      </Modal>
    </div>
  )
}
