'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Purchase, PmProduct,
  getThisMonth, shiftMonth,
  fmtMonthLabel, fmtDateShort,
  apiFetchPurchases, apiUpdatePurchase, apiDeletePurchase,
  syncProductQty,
  isUnresolved,
  DEFAULT_EXCHANGE_RATE, unitToOrderKrw,
} from './_shared'
import { ChevronLeft, ChevronRight, PackagePlus, ChevronDown, ChevronUp, Truck, Trash2, Pencil, Check, X, Search } from 'lucide-react'

type FP = PmProduct & { cost_price?: number; cost_currency?: string }

const CACHE_KEY = 'pm_products_cache_v1'

function loadCachedProducts(): FP[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? (data as FP[]) : []
  } catch { return [] }
}

function saveCachedProducts(list: FP[]) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...parsed, data: list }))
  } catch {}
}

/** 로컬 캐시에서 ordered/received 델타 반영 후 저장 */
function applyDeltaToCache(
  list: FP[],
  patches: { productCode: string; barcode: string; optionName: string; orderedDelta: number; receivedDelta: number }[],
): FP[] {
  return list.map(p => {
    const match = patches.find(r => r.productCode === p.code)
    if (!match) return p
    return {
      ...p,
      options: p.options.map(o => {
        const hit = patches.find(r =>
          r.productCode === p.code &&
          (r.barcode ? o.barcode === r.barcode : o.name === r.optionName)
        )
        if (!hit) return o
        return {
          ...o,
          ordered : Math.max(0, (o.ordered  ?? 0) + hit.orderedDelta),
          received: Math.max(0, (o.received ?? 0) + hit.receivedDelta),
        }
      }),
    }
  })
}

function calcOrderKrw(purchase: Purchase, products: FP[], exchangeRate: number): number {
  return purchase.items.reduce((sum, item) => {
    const prod = products.find(p => p.code === item.product_code)
    if (!prod?.cost_price) return sum
    return sum + unitToOrderKrw(prod.cost_price, prod.cost_currency || '원', exchangeRate) * item.ordered
  }, 0)
}

function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const thisMonth = getThisMonth()
  const isFuture  = month >= thisMonth
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <button onClick={() => setMonth(shiftMonth(month, -1))}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronLeft size={12}/>
      </button>
      <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', minWidth:80, textAlign:'center', whiteSpace:'nowrap' }}>
        {fmtMonthLabel(month)}
      </span>
      <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isFuture}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:isFuture?'not-allowed':'pointer', opacity:isFuture?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronRight size={12}/>
      </button>
      <button onClick={() => setMonth(thisMonth)}
        style={{ fontSize:10.5, fontWeight:700, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:6, padding:'4px 9px', cursor:'pointer' }}>
        이번달
      </button>
    </div>
  )
}

export default function PurchaseMainPage() {
  const [purchases,    setPurchases]    = useState<Purchase[]>([])
  const [products,     setProducts]     = useState<FP[]>([])
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE)

  /* 좌측: 발주 목록 */
  const [poMonth,      setPoMonth]      = useState(getThisMonth())
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null)

  /* 검색 */
  const [searchText, setSearchText] = useState('')

  /* 수량 편집 상태: "purchaseId-itemIdx" */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editQty,    setEditQty]    = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  /* 저장 / 삭제 진행 중 */
  const [savingKeys,   setSavingKeys]   = useState<Set<string>>(new Set())
  const [deletingIds,  setDeletingIds]  = useState<Set<string>>(new Set())

  /* 우측: 미입고 리스트 (전체·바코드순) */

  const loadPurchases = useCallback(async () => {
    const data = await apiFetchPurchases()
    setPurchases(data)
  }, [])

  useEffect(() => {
    setProducts(loadCachedProducts())
    try {
      const er = Number(localStorage.getItem('pm_exchange_rate'))
      if (er > 0) setExchangeRate(er)
    } catch { /* ignore */ }

    loadPurchases()
    const onVisible = () => { if (document.visibilityState === 'visible') loadPurchases() }
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) setProducts(loadCachedProducts())
      if (e.key === 'pm_exchange_rate') {
        const er = Number(e.newValue)
        if (er > 0) setExchangeRate(er)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [loadPurchases])

  /* ── 발주 목록: 해당 월의 ordered 상태 발주 ── */
  const poList = useMemo(() =>
    purchases
      .filter(p => p.status === 'ordered' && p.order_date.startsWith(poMonth))
      .sort((a, b) => a.order_date.localeCompare(b.order_date))
  , [purchases, poMonth])

  /* ── 검색 필터 적용 ── */
  const filteredPoList = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return poList
    return poList.filter(p =>
      (p.supplier || '').toLowerCase().includes(q) ||
      p.items.some(i =>
        i.product_code.toLowerCase().includes(q) ||
        (i.option_name || '').toLowerCase().includes(q) ||
        (i.barcode || '').toLowerCase().includes(q)
      )
    )
  }, [poList, searchText])

  /* ── 발주 아이템 수량 수정 ── */
  const handleSaveItemQty = async (purchase: Purchase, itemIdx: number) => {
    const newQty = parseInt(editQty, 10)
    if (isNaN(newQty) || newQty < 0) { alert('올바른 수량을 입력하세요.'); return }
    const item   = purchase.items[itemIdx]
    const oldQty = item.ordered
    if (newQty === oldQty) { setEditingKey(null); return }

    const key = `${purchase.id}-${itemIdx}`
    setSavingKeys(prev => new Set(prev).add(key))
    try {
      const newItems = purchase.items.map((it, i) =>
        i === itemIdx ? { ...it, ordered: newQty } : it
      )
      const { error } = await apiUpdatePurchase(purchase.id, { items: newItems })
      if (error) { alert(`수정 실패: ${error}`); return }

      const prod = products.find(p => p.code === item.product_code)
      if (prod) {
        await syncProductQty(products, [{
          prodId:       prod.id,
          optName:      item.option_name || '',
          barcode:      item.barcode     || undefined,
          orderedDelta:  newQty - oldQty,
          receivedDelta: 0,
        }])
        const patches = [{ productCode: item.product_code, barcode: item.barcode || '', optionName: item.option_name || '', orderedDelta: newQty - oldQty, receivedDelta: 0 }]
        const updated = applyDeltaToCache(products as FP[], patches)
        saveCachedProducts(updated)
        setProducts(updated)
      }

      setPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, items: newItems } : p))
      setEditingKey(null)
    } catch (e) {
      alert(`수정 중 오류: ${String(e)}`)
    } finally {
      setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  /* ── 발주 전체 삭제 ── */
  const handleDeletePurchase = async (purchase: Purchase) => {
    const totalQty = purchase.items.reduce((s, i) => s + i.ordered, 0)
    if (!confirm(
      `발주 ${fmtDateShort(purchase.order_date)}${purchase.supplier ? ` (${purchase.supplier})` : ''} — ` +
      `${purchase.items.length}개 품목 / 총 ${totalQty}개를 삭제하시겠습니까?\n\n` +
      `상품관리탭의 발주 수량도 함께 차감됩니다.`
    )) return

    setDeletingIds(prev => new Set(prev).add(purchase.id))
    try {
      const patches = purchase.items
        .filter(i => i.ordered > 0 || i.received > 0)
        .map(i => ({
          productCode:   i.product_code,
          barcode:       i.barcode      || '',
          optionName:    i.option_name  || '',
          orderedDelta:  -i.ordered,
          receivedDelta: -i.received,
        }))

      const syncRows = patches
        .map(r => {
          const prod = products.find(p => p.code === r.productCode)
          if (!prod) return null
          return { prodId: prod.id, optName: r.optionName, barcode: r.barcode || undefined, orderedDelta: r.orderedDelta, receivedDelta: r.receivedDelta }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (syncRows.length > 0) {
        await syncProductQty(products, syncRows)
        const updated = applyDeltaToCache(products as FP[], patches)
        saveCachedProducts(updated)
        setProducts(updated)
      }

      const { error } = await apiDeletePurchase(purchase.id)
      if (error) { alert(`삭제 실패: ${error}`); return }

      setPurchases(prev => prev.filter(p => p.id !== purchase.id))
      if (expandedPoId === purchase.id) setExpandedPoId(null)
    } catch (e) {
      alert(`삭제 중 오류: ${String(e)}`)
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(purchase.id); return n })
    }
  }

  /* ── 미입고 리스트: 미입고 수량이 있는 품목을 바코드 오름차순으로 flatten ── */
  const miItems = useMemo(() => {
    const rows: {
      barcode: string; productCode: string; optionName: string
      orderDate: string; supplier: string
      ordered: number; received: number; missing: number
    }[] = []
    for (const p of purchases) {
      if (!isUnresolved(p)) continue
      for (const item of p.items) {
        const mis = Math.max(0, item.ordered - item.received)
        if (mis <= 0) continue
        rows.push({
          barcode:     item.barcode     || '',
          productCode: item.product_code,
          optionName:  item.option_name  || '',
          orderDate:   p.order_date,
          supplier:    p.supplier        || '',
          ordered:     item.ordered,
          received:    item.received,
          missing:     mis,
        })
      }
    }
    return rows.sort((a, b) => a.barcode.localeCompare(b.barcode))
  }, [purchases])

  /* KPI */
  const poOrderedQty = useMemo(() =>
    poList.reduce((s,p) => s + p.items.reduce((ss,i) => ss + i.ordered, 0), 0)
  , [poList])

  const poMonthKrw = useMemo(() =>
    poList.reduce((s,p) => s + calcOrderKrw(p, products, exchangeRate), 0)
  , [poList, products, exchangeRate])

  const miTotalQty = useMemo(() =>
    miItems.reduce((s, r) => s + r.missing, 0)
  , [miItems])

  const thStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:align,
    borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap',
  })
  const tdStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'7px 8px', textAlign:align, verticalAlign:'middle',
  })

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:0 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1, overflow:'hidden' }}>

        {/* ── 좌측: 발주 목록 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>

          {/* KPI 카드 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>📦 발주 목록</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>발주확정 {poList.length}건</span>
            </div>
            <MonthNav month={poMonth} setMonth={v => { setPoMonth(v); setExpandedPoId(null) }}/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginTop:10 }}>
              <div style={{ background:'#eff6ff', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주확정 건수</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#2563eb', lineHeight:1 }}>{poList.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{poOrderedQty.toLocaleString()}</p>
              </div>
              <div style={{ background:'#fefce8', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주금액 (월누적)</p>
                <p style={{ fontSize: poMonthKrw > 0 ? 14 : 18, fontWeight:900,
                  color: poMonthKrw > 0 ? '#92400e' : '#cbd5e1', lineHeight:1,
                  marginTop: poMonthKrw > 0 ? 3 : 0 }}>
                  {poMonthKrw > 0 ? `₩${Math.round(poMonthKrw).toLocaleString()}` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* 검색바 */}
          <div className="pm-card" style={{ padding:'8px 12px', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ position:'relative', flex:1 }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="구매처 · 상품코드 · 옵션명 · 바코드 검색"
                style={{ width:'100%', height:32, paddingLeft:30, paddingRight:searchText ? 30 : 10, fontSize:12, fontWeight:600, border:'1.5px solid #e2e8f0', borderRadius:8, outline:'none', color:'#0f172a', boxSizing:'border-box' }}
              />
              {searchText && (
                <button onClick={() => setSearchText('')}
                  style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:0 }}>
                  <X size={13} style={{ color:'#94a3b8' }} />
                </button>
              )}
            </div>
            {searchText && (
              <span style={{ fontSize:11, fontWeight:700, color:'#2563eb', background:'#eff6ff', padding:'3px 8px', borderRadius:6, whiteSpace:'nowrap' }}>
                {filteredPoList.length}건
              </span>
            )}
          </div>

          {/* 목록 테이블 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {poList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>이 달의 발주 내역이 없습니다</p>
                </div>
              : filteredPoList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <Search size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>검색 결과가 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle('left')}>구매처</th>
                      <th style={thStyle()}>품목</th>
                      <th style={thStyle()}>발주수량</th>
                      <th style={thStyle()}>발주금액</th>
                      <th style={{ ...thStyle(), width:28 }}></th>
                      <th style={{ ...thStyle(), width:32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPoList.map(p => {
                      const tOrd      = p.items.reduce((s,i) => s + i.ordered, 0)
                      const lineKrw   = calcOrderKrw(p, products, exchangeRate)
                      const isOpen    = expandedPoId === p.id
                      const isDeleting = deletingIds.has(p.id)
                      return (
                        <>
                          <tr key={p.id}
                            onClick={() => { if (!isDeleting) setExpandedPoId(isOpen ? null : p.id) }}
                            style={{ borderBottom:'1px solid #f8fafc', cursor: isDeleting ? 'not-allowed' : 'pointer', background: isDeleting ? '#fef2f2' : isOpen ? '#eff6ff' : undefined, opacity: isDeleting ? 0.6 : 1 }}
                            onMouseEnter={e => { if (!isOpen && !isDeleting) e.currentTarget.style.background='#f8fafc' }}
                            onMouseLeave={e => { if (!isOpen && !isDeleting) e.currentTarget.style.background='' }}
                          >
                            <td style={tdStyle('left')}>
                              <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(p.order_date)}</span>
                              <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{p.order_date}</span>
                            </td>
                            <td style={{ ...tdStyle('left'), fontSize:11.5, color:'#475569' }}>{p.supplier||'-'}</td>
                            <td style={{ ...tdStyle(), color:'#64748b' }}>{p.items.length}건</td>
                            <td style={{ ...tdStyle(), fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                            <td style={{ ...tdStyle(), fontWeight:900, color: lineKrw > 0 ? '#92400e' : '#cbd5e1', fontSize:11.5 }}>
                              {lineKrw > 0 ? `₩${Math.round(lineKrw).toLocaleString()}` : '-'}
                            </td>
                            <td style={tdStyle()}>
                              {isOpen ? <ChevronUp size={13} color="#94a3b8"/> : <ChevronDown size={13} color="#94a3b8"/>}
                            </td>
                            {/* 삭제 버튼 */}
                            <td style={tdStyle()} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handleDeletePurchase(p)}
                                disabled={isDeleting}
                                title="발주 삭제"
                                style={{ width:24, height:24, borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', cursor: isDeleting ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}
                                onMouseEnter={e => { e.currentTarget.style.background='#fee2e2'; e.currentTarget.style.borderColor='#ef4444' }}
                                onMouseLeave={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.borderColor='#fecaca' }}
                              >
                                <Trash2 size={11} color={isDeleting ? '#94a3b8' : '#ef4444'} />
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${p.id}-detail`}>
                              <td colSpan={7} style={{ padding:0, background:'#f0f9ff' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr style={{ background:'#dbeafe' }}>
                                      {['상품코드','옵션명','바코드','발주수량',''].map((h, hi) => (
                                        <th key={hi} style={{ padding:'4px 8px', fontWeight:800, color:'#1d4ed8', textAlign: hi === 3 ? 'center' : 'left', fontSize:10 }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.items.map((item, i) => {
                                      const key      = `${p.id}-${i}`
                                      const isEditing = editingKey === key
                                      const isSaving  = savingKeys.has(key)
                                      return (
                                        <tr key={i} style={{ borderBottom:'1px solid #e0f2fe', background: isEditing ? '#fafffe' : undefined }}>
                                          <td style={{ padding:'4px 8px', color:'#334155', fontFamily:'monospace', fontSize:10.5 }}>{item.product_code}</td>
                                          <td style={{ padding:'4px 8px', color:'#475569', fontSize:10.5 }}>{item.option_name||'-'}</td>
                                          <td style={{ padding:'4px 8px', color:'#64748b', fontFamily:'monospace', fontSize:10 }}>{item.barcode||'-'}</td>
                                          {/* 발주수량 - 편집 모드 */}
                                          <td style={{ padding:'4px 8px', textAlign:'center' }}>
                                            {isEditing ? (
                                              <input
                                                ref={editInputRef}
                                                type="number" min={0}
                                                value={editQty}
                                                onChange={e => setEditQty(e.target.value)}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') handleSaveItemQty(p, i)
                                                  if (e.key === 'Escape') setEditingKey(null)
                                                }}
                                                style={{ width:58, height:24, fontSize:11.5, fontWeight:800, textAlign:'center', border:'1.5px solid #3b82f6', borderRadius:6, outline:'none', padding:'0 4px' }}
                                              />
                                            ) : (
                                              <span style={{ fontWeight:800, color:'#1d4ed8' }}>{item.ordered}</span>
                                            )}
                                          </td>
                                          {/* 편집/저장/취소 버튼 */}
                                          <td style={{ padding:'4px 8px', textAlign:'center', whiteSpace:'nowrap' }}>
                                            {isEditing ? (
                                              <span style={{ display:'inline-flex', gap:4 }}>
                                                <button
                                                  onClick={() => handleSaveItemQty(p, i)}
                                                  disabled={isSaving}
                                                  title="저장"
                                                  style={{ width:22, height:22, borderRadius:5, border:'none', background:'#059669', cursor: isSaving ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                                  <Check size={12} color="white" />
                                                </button>
                                                <button
                                                  onClick={() => setEditingKey(null)}
                                                  title="취소"
                                                  style={{ width:22, height:22, borderRadius:5, border:'none', background:'#f1f5f9', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                                  <X size={12} color="#64748b" />
                                                </button>
                                              </span>
                                            ) : (
                                              <button
                                                onClick={() => { setEditingKey(key); setEditQty(String(item.ordered)); setTimeout(() => editInputRef.current?.select(), 30) }}
                                                title="수량 수정"
                                                style={{ width:22, height:22, borderRadius:5, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                                                onMouseEnter={e => { e.currentTarget.style.background='#eff6ff'; e.currentTarget.style.borderColor='#3b82f6' }}
                                                onMouseLeave={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#e2e8f0' }}>
                                                <Pencil size={10} color="#64748b" />
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>

        {/* ── 우측: 미입고 리스트 (전체·바코드순) ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>

          {/* KPI 카드 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>🚚 미입고 리스트</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>전체 {miItems.length}건</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
              <div style={{ background:'#fff7ed', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>미입고 품목 수</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#d97706', lineHeight:1 }}>{miItems.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>미입고 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{miTotalQty.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* 목록 테이블 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {miItems.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <Truck size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>미입고 항목이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle()}>바코드</th>
                      <th style={thStyle('left')}>상품코드</th>
                      <th style={thStyle('left')}>옵션명</th>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle()}>발주</th>
                      <th style={thStyle()}>입고</th>
                      <th style={thStyle()}>미입고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miItems.map((row, idx) => (
                      <tr key={idx}
                        style={{ borderBottom:'1px solid #f8fafc' }}
                        onMouseEnter={e => { e.currentTarget.style.background='#fffbeb' }}
                        onMouseLeave={e => { e.currentTarget.style.background='' }}
                      >
                        <td style={{ ...tdStyle(), fontFamily:'monospace', fontSize:10.5, color:'#475569', whiteSpace:'nowrap' }}>
                          {row.barcode || '-'}
                        </td>
                        <td style={{ ...tdStyle('left'), fontFamily:'monospace', fontSize:11, color:'#059669', fontWeight:800 }}>
                          {row.productCode}
                        </td>
                        <td style={{ ...tdStyle('left'), fontSize:11, color:'#475569', maxWidth:100 }}>
                          <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {row.optionName || '-'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle('left') }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(row.orderDate)}</span>
                          <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{row.supplier||'-'}</span>
                        </td>
                        <td style={{ ...tdStyle(), fontWeight:700, color:'#64748b' }}>{row.ordered}</td>
                        <td style={{ ...tdStyle(), fontWeight:700, color:'#059669' }}>{row.received}</td>
                        <td style={{ ...tdStyle() }}>
                          <span style={{ fontSize:12, fontWeight:900, background:'#fff7ed', color:'#d97706',
                            padding:'2px 8px', borderRadius:6 }}>
                            {row.missing}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>

      </div>
    </div>
  )
}
