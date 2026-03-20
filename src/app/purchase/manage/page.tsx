'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  Purchase, PurchaseItem, PmProduct, PmOption, PurchaseStatus, DateMode,
  ST, isUnresolved,
  getToday, getThisMonth,
  fmtMonthLabel, fmtDayLabel,
  syncProductQty, DateNav,
} from '../_shared'
import { Truck, Edit2, Trash2, X, Plus, CheckCircle2, PackagePlus, ChevronDown, ChevronUp, AlertTriangle, Package } from 'lucide-react'

/* ── 발주 추천 옵션 타입 ── */
interface QualOpt {
  key: string
  prodId: string
  prodCode: string
  prodAbbr: string
  optName: string
  barcode: string
  image: string
  currentStock: number
  unreceived: number
  reason: 'lowStock' | 'unreceived' | 'both'
}
interface SelectedOpt extends QualOpt { qty: string }

export default function PurchaseManagePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)

  /* 발주 추천 → 선택 상태 */
  const [selectedOpts, setSelectedOpts] = useState<SelectedOpt[]>([])
  const [orderDate,    setOrderDate]    = useState(getToday())
  const [orderSupplier, setOrderSupplier] = useState('')

  /* 발주 이력 영역 */
  const [showHistory, setShowHistory] = useState(false)
  const [mode,  setMode]  = useState<DateMode>('month')
  const [month, setMonth] = useState(getThisMonth())
  const [day,   setDay]   = useState(getToday())

  /* 모달 */
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [editTarget,    setEditTarget]    = useState<Purchase | null>(null)
  const [editFormData,  setEditFormData]  = useState<Purchase | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Purchase | null>(null)

  /* ── 데이터 로드 ── */
  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending: false })
    if (data) setPurchases(data as Purchase[])
  }, [])

  const loadProducts = useCallback(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return
    try {
      const res = await fetch(
        `${url}/rest/v1/pm_products?select=id,code,name,abbr,status,options`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setProducts(data as PmProduct[])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  /* ── 바코드별 미입고 수량 계산 ── */
  const unreceivedMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of purchases) {
      if (p.status === 'cancelled') continue
      for (const item of p.items) {
        const rem = item.ordered - item.received
        if (rem > 0 && item.barcode) map[item.barcode] = (map[item.barcode] || 0) + rem
      }
    }
    return map
  }, [purchases])

  /* ── 발주 추천 목록 (재고 ≤ 2 또는 미입고 > 0) ── */
  const qualOpts = useMemo((): QualOpt[] => {
    const result: QualOpt[] = []
    for (const prod of products) {
      if (prod.status === 'pending_delete') continue
      for (const opt of prod.options) {
        const stock = opt.current_stock ?? Math.max(0, (opt.received || 0) - (opt.sold || 0) - (opt.defective || 0))
        const unr   = unreceivedMap[opt.barcode || ''] || 0
        const isLow = stock <= 2
        const hasUnr = unr > 0
        if (!isLow && !hasUnr) continue
        result.push({
          key:          `${prod.id}__${opt.barcode || opt.name}`,
          prodId:       prod.id,
          prodCode:     prod.code,
          prodAbbr:     prod.abbr || prod.name,
          optName:      opt.name,
          barcode:      opt.barcode || '',
          image:        opt.image || '',
          currentStock: stock,
          unreceived:   unr,
          reason:       isLow && hasUnr ? 'both' : isLow ? 'lowStock' : 'unreceived',
        })
      }
    }
    return result.sort((a, b) => a.currentStock - b.currentStock)
  }, [products, unreceivedMap])

  const selectedKeys = useMemo(() => new Set(selectedOpts.map(s => s.key)), [selectedOpts])

  const toggleSelect = (opt: QualOpt) => {
    if (selectedKeys.has(opt.key)) {
      setSelectedOpts(prev => prev.filter(s => s.key !== opt.key))
    } else {
      setSelectedOpts(prev => [...prev, { ...opt, qty: '1' }])
    }
  }

  /* ── 발주 등록 ── */
  const handleSubmitOrder = async () => {
    const valid = selectedOpts.filter(s => s.qty && Number(s.qty) > 0)
    if (!valid.length || !orderDate) return
    setSaving(true)
    try {
      const items: PurchaseItem[] = valid.map(s => ({
        product_code: s.prodCode,
        option_name:  s.optName,
        barcode:      s.barcode,
        ordered:      Number(s.qty),
        received:     0,
      }))
      const purchase: Purchase = {
        id:          String(Date.now()),
        order_date:  orderDate,
        supplier:    orderSupplier || '미지정',
        status:      'ordered',
        ordered_at:  new Date().toISOString(),
        received_at: null,
        items,
      }
      await supabase.from('pm_purchases').insert(purchase)
      const deltas = valid.map(s => ({ prodId: s.prodId, optName: s.optName, orderedDelta: Number(s.qty), receivedDelta: 0 }))
      await syncProductQty(products, deltas)
      await loadPurchases()
      await loadProducts()
      setSelectedOpts([])
      setOrderSupplier('')
      setOrderDate(getToday())
    } finally {
      setSaving(false)
    }
  }

  /* ── 입고 처리 ── */
  const handleReceive = async (receivedItems: Record<number, number>) => {
    if (!receiveTarget) return
    setSaving(true)
    const items = receiveTarget.items.map((item, i) => ({
      ...item, received: Math.min(item.ordered, item.received + (receivedItems[i] || 0)),
    }))
    const allDone = items.every(i => i.received >= i.ordered)
    const anyDone = items.some(i => i.received > 0)
    const updated = {
      ...receiveTarget, items,
      status: (allDone ? 'completed' : anyDone ? 'partial' : receiveTarget.status) as PurchaseStatus,
      received_at: allDone ? new Date().toISOString() : receiveTarget.received_at,
    }
    await supabase.from('pm_purchases').update({ items: updated.items, status: updated.status, received_at: updated.received_at }).eq('id', receiveTarget.id)
    const deltas = receiveTarget.items.map((item, i) => {
      const prod = products.find(p => p.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: 0, receivedDelta: receivedItems[i] || 0 }
    }).filter(d => d.prodId && d.receivedDelta > 0)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setReceiveTarget(null); setSaving(false)
  }

  /* ── 수정 ── */
  const handleEditSave = async () => {
    if (!editTarget || !editFormData) return
    setSaving(true)
    const deltas = editFormData.items.map((newItem, i) => {
      const oldItem = editTarget.items[i] || { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }
      const prod = products.find(p => p.code === newItem.product_code || p.code === oldItem.product_code)
      return { prodId: prod?.id ?? '', optName: newItem.option_name, orderedDelta: newItem.ordered - oldItem.ordered, receivedDelta: newItem.received - oldItem.received }
    }).filter(d => d.prodId && (d.orderedDelta !== 0 || d.receivedDelta !== 0))
    await supabase.from('pm_purchases').update({ order_date: editFormData.order_date, supplier: editFormData.supplier, status: editFormData.status, items: editFormData.items }).eq('id', editTarget.id)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setEditTarget(null); setEditFormData(null); setSaving(false)
  }

  /* ── 삭제 ── */
  const handleDelete = async (p: Purchase) => {
    setSaving(true)
    const deltas = p.items.map(item => {
      const prod = products.find(pr => pr.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: -item.ordered, receivedDelta: -item.received }
    }).filter(d => d.prodId)
    if (deltas.length) await syncProductQty(products, deltas)
    await supabase.from('pm_purchases').delete().eq('id', p.id)
    await loadPurchases(); await loadProducts()
    setDeleteTarget(null); setSaving(false)
  }

  /* ── 이력 필터 ── */
  const key       = mode === 'month' ? month : day
  const filtered  = useMemo(() => purchases.filter(p => p.order_date.startsWith(key)).sort((a, b) => b.order_date.localeCompare(a.order_date)), [purchases, key])
  const unresolvedOld = useMemo(() => purchases.filter(p => isUnresolved(p) && !p.order_date.startsWith(key)), [purchases, key])
  const allList   = useMemo(() => {
    const ids = new Set(filtered.map(p => p.id))
    return [...filtered, ...unresolvedOld.filter(p => !ids.has(p.id))]
  }, [filtered, unresolvedOld])

  const L = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5 }}>{children}</label>
  )

  /* ── 재고 색상 ── */
  const stockColor = (s: number) => s === 0 ? '#dc2626' : s <= 2 ? '#d97706' : '#059669'
  const stockBg    = (s: number) => s === 0 ? '#fff1f2' : s <= 2 ? '#fffbeb' : '#f0fdf4'

  return (
    <div className="pm-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>📦 발주관리</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            추천 {qualOpts.length}건 · 선택 {selectedOpts.length}건
          </span>
          <button onClick={() => { loadPurchases(); loadProducts() }}
            style={{ fontSize: 11.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
            새로고침
          </button>
        </div>
      </div>

      {/* ── 2단 메인 레이아웃 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 10, flex: 1, overflow: 'hidden' }}>

        {/* ◀ 왼쪽: 발주 추천 목록 ── */}
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {/* 패널 헤더 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <AlertTriangle size={14} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>발주 추천 목록</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, background: '#fff1f2', color: '#dc2626', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                재고≤2: {qualOpts.filter(o => o.reason === 'lowStock' || o.reason === 'both').length}
              </span>
              <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                미입고: {qualOpts.filter(o => o.reason === 'unreceived' || o.reason === 'both').length}
              </span>
            </div>
          </div>

          {/* 목록 */}
          {qualOpts.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
              <Package size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 13, fontWeight: 700 }}>발주가 필요한 상품이 없습니다</p>
              <p style={{ fontSize: 11, color: '#cbd5e1' }}>재고 2개 이하이거나 미입고 발주가 있는 상품이 여기 표시됩니다</p>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    {['', '이미지', '상품약어 / 옵션', '바코드', '미입고', '현재고', '선택'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', fontWeight: 800, color: '#64748b', fontSize: 10.5, textAlign: 'center', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qualOpts.map(opt => {
                    const sel = selectedKeys.has(opt.key)
                    const rowBg = sel ? '#eff6ff' : opt.reason === 'unreceived' ? '#fffbeb' : undefined
                    return (
                      <tr key={opt.key} style={{ borderBottom: '1px solid #f8fafc', background: rowBg, cursor: 'pointer', transition: 'background 0.15s' }}
                        onClick={() => toggleSelect(opt)}>
                        {/* 상태 표시 */}
                        <td style={{ padding: '6px 4px 6px 8px', textAlign: 'center' }}>
                          {opt.reason === 'lowStock' && <span style={{ fontSize: 9, background: '#fff1f2', color: '#dc2626', fontWeight: 800, padding: '1px 4px', borderRadius: 4 }}>재고↓</span>}
                          {opt.reason === 'unreceived' && <span style={{ fontSize: 9, background: '#fffbeb', color: '#d97706', fontWeight: 800, padding: '1px 4px', borderRadius: 4 }}>미입고</span>}
                          {opt.reason === 'both' && <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', fontWeight: 800, padding: '1px 4px', borderRadius: 4 }}>↓미입고</span>}
                        </td>
                        {/* 이미지 */}
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          {opt.image
                            ? <img src={opt.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                            : <div style={{ width: 40, height: 40, background: '#f1f5f9', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={16} style={{ color: '#cbd5e1' }} />
                              </div>
                          }
                        </td>
                        {/* 상품약어/옵션 */}
                        <td style={{ padding: '6px 8px' }}>
                          <p style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 2, lineHeight: 1.2 }}>{opt.prodAbbr}</p>
                          <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{opt.optName}</p>
                        </td>
                        {/* 바코드 */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>{opt.barcode || '-'}</span>
                        </td>
                        {/* 미입고 */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: opt.unreceived > 0 ? '#d97706' : '#94a3b8' }}>{opt.unreceived || '-'}</span>
                        </td>
                        {/* 현재고 */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: stockColor(opt.currentStock), background: stockBg(opt.currentStock), padding: '2px 8px', borderRadius: 99 }}>
                            {opt.currentStock}
                          </span>
                        </td>
                        {/* 선택 체크 */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 5, border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`,
                            background: sel ? '#2563eb' : 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {sel && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ▶ 오른쪽: 발주 등록 ── */}
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {/* 패널 헤더 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <PackagePlus size={14} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>발주 등록</span>
            {selectedOpts.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, background: '#eff6ff', color: '#2563eb', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                {selectedOpts.length}종
              </span>
            )}
          </div>

          {selectedOpts.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
              <PackagePlus size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 13, fontWeight: 700 }}>왼쪽에서 상품을 선택하세요</p>
              <p style={{ fontSize: 11, color: '#cbd5e1' }}>선택한 상품이 여기 표시됩니다</p>
            </div>
          ) : (
            <>
              {/* 발주 기본 정보 */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
                <div>
                  <L>발주일 *</L>
                  <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                </div>
                <div>
                  <L>구매처</L>
                  <Input placeholder="동대문 A상회" value={orderSupplier} onChange={e => setOrderSupplier(e.target.value)} />
                </div>
              </div>

              {/* 선택 상품 목록 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                {selectedOpts.map((s, i) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                    {/* 이미지 */}
                    {s.image
                      ? <img src={s.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, background: '#f1f5f9', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={14} style={{ color: '#cbd5e1' }} />
                        </div>
                    }
                    {/* 상품 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11.5, fontWeight: 800, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.prodAbbr}</p>
                      <p style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.optName}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>현재고 {s.currentStock}</p>
                    </div>
                    {/* 수량 입력 */}
                    <Input type="number" min="1" value={s.qty}
                      onChange={e => setSelectedOpts(prev => prev.map((o, j) => j === i ? { ...o, qty: e.target.value } : o))}
                      style={{ width: 64, textAlign: 'center', fontWeight: 800, flexShrink: 0 }} />
                    {/* 제거 버튼 */}
                    <button onClick={() => setSelectedOpts(prev => prev.filter((_, j) => j !== i))}
                      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>

              {/* 발주 등록 버튼 */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700 }}>
                    총 {selectedOpts.reduce((s, o) => s + (Number(o.qty) || 0), 0).toLocaleString()}개
                  </span>
                  <button onClick={() => setSelectedOpts([])}
                    style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    전체 선택 해제
                  </button>
                </div>
                <Button onClick={handleSubmitOrder} disabled={saving || !orderDate}
                  style={{ width: '100%', fontWeight: 800, height: 40, opacity: (saving || !orderDate) ? 0.6 : 1 }}>
                  <PackagePlus size={14} style={{ marginRight: 4 }} />
                  {saving ? '등록 중...' : '발주 등록'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 발주 이력 (토글) ── */}
      <div className="pm-card" style={{ flexShrink: 0, padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setShowHistory(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
          <span>📋 발주 이력</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!showHistory && purchases.filter(isUnresolved).length > 0 && (
              <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                미입고 {purchases.filter(isUnresolved).length}건
              </span>
            )}
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {showHistory && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {/* DateNav */}
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}>
              <DateNav mode={mode} setMode={setMode} month={month} setMonth={setMonth} day={day} setDay={setDay} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {allList.length}건
                {unresolvedOld.length > 0 && <span style={{ marginLeft: 8, color: '#d97706', fontWeight: 700 }}>⚠ 이전 미입고 {unresolvedOld.length}건 포함</span>}
              </span>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {allList.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>발주 내역이 없습니다</p>
                  </div>
                : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['발주일', '구매처', '품목', '발주', '입고', '미입고', '상태', '관리'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', fontWeight: 800, color: '#64748b', fontSize: 10.5, textAlign: h === '구매처' || h === '발주일' ? 'left' : 'center', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allList.map(p => {
                        const tOrd = p.items.reduce((s, i) => s + i.ordered, 0)
                        const tRcv = p.items.reduce((s, i) => s + i.received, 0)
                        const tMis = tOrd - tRcv
                        const st = ST[p.status]
                        const old = isUnresolved(p) && !p.order_date.startsWith(key)
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', background: old ? '#fffbeb' : undefined }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700, color: '#334155' }}>
                              {p.order_date}
                              {old && <span style={{ marginLeft: 5, fontSize: 9.5, fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '1px 5px', borderRadius: 99 }}>이전↑</span>}
                            </td>
                            <td style={{ padding: '7px 10px', color: '#475569' }}>{p.supplier || '-'}</td>
                            <td style={{ textAlign: 'center', color: '#64748b' }}>{p.items.length}건</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#1e293b' }}>{tOrd}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#0ea5e9' }}>{tRcv}</td>
                            <td style={{ textAlign: 'center', fontWeight: 900, color: tMis > 0 ? '#d97706' : '#94a3b8' }}>{tMis}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-flex', fontSize: 10.5, fontWeight: 800, background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 99 }}>{st.label}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {p.status !== 'completed' && p.status !== 'cancelled' && (
                                  <button onClick={() => setReceiveTarget(p)}
                                    style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ecfdf5', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Truck size={10} />입고
                                  </button>
                                )}
                                <button onClick={() => { setEditTarget(p); setEditFormData(JSON.parse(JSON.stringify(p))) }}
                                  style={{ fontSize: 11, fontWeight: 800, color: '#7e22ce', background: '#fdf4ff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Edit2 size={10} />수정
                                </button>
                                <button onClick={() => setDeleteTarget(p)}
                                  style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fff1f2', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Trash2 size={10} />삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              }
            </div>
          </div>
        )}
      </div>

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={() => setReceiveTarget(null)} onSave={handleReceive} />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={() => { setEditTarget(null); setEditFormData(null) }} title={`발주 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><L>발주일</L><Input type="date" value={editFormData.order_date} onChange={e => setEditFormData(f => f ? { ...f, order_date: e.target.value } : f)} /></div>
            <div><L>구매처</L><Input value={editFormData.supplier} onChange={e => setEditFormData(f => f ? { ...f, supplier: e.target.value } : f)} /></div>
          </div>
          {editFormData.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Input value={item.product_code} onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], product_code: e.target.value }; return { ...f, items: it } })} />
              <Input value={item.option_name}  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], option_name: e.target.value }; return { ...f, items: it } })} />
              <Input value={item.barcode}       onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], barcode: e.target.value }; return { ...f, items: it } })} />
              <Input type="number" value={item.ordered}  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], ordered: Number(e.target.value) || 0 }; return { ...f, items: it } })} />
              <Input type="number" value={item.received} onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], received: Number(e.target.value) || 0 }; return { ...f, items: it } })} />
              <button onClick={() => setEditFormData(f => f ? { ...f, items: f.items.filter((_, j) => j !== i) } : f)}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button onClick={() => setEditFormData(f => f ? { ...f, items: [...f.items, { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }] } : f)}
            style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            <Plus size={12} />상품 추가
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditFormData(null) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="발주 삭제 확인" size="sm">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Trash2 size={36} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{deleteTarget.order_date} 발주를 삭제하시겠습니까?</p>
            <p style={{ fontSize: 12, color: '#64748b' }}>삭제 시 발주/입고 수량이 상품관리에서 차감됩니다.</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={saving}
              style={{ background: '#dc2626', borderColor: '#dc2626', opacity: saving ? 0.6 : 1 }}>
              <Trash2 size={13} />{saving ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── 입고 처리 모달 ── */
function ReceiveModal({ purchase, onClose, onSave }: { purchase: Purchase; onClose: () => void; onSave: (items: Record<number, number>) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(
    () => Object.fromEntries(purchase.items.map((item, i) => [i, String(item.ordered - item.received)]))
  )
  return (
    <Modal isOpen onClose={onClose} title={`입고 처리 — ${purchase.order_date}`} size="md">
      <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 14 }}>실제 입고된 수량을 입력하세요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {purchase.items.map((item, i) => {
          const remain = item.ordered - item.received
          return (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{item.product_code}</p>
                  {item.option_name && <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{item.option_name}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>발주 {item.ordered} / 기입고 {item.received}</p>
                  <p style={{ fontSize: 11.5, fontWeight: 800, color: '#f59e0b' }}>미입고 {remain}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>입고 수량</label>
                <Input type="number" value={qty[i]} min={0} max={remain}
                  onChange={e => setQty(prev => ({ ...prev, [i]: e.target.value }))}
                  style={{ fontWeight: 800, fontSize: 14 }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(qty).map(([k, v]) => [Number(k), Number(v) || 0])))}>
          <CheckCircle2 size={13} />입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
