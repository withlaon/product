'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Plus, RotateCcw, RefreshCw,
  HeadphonesIcon, CheckCircle2, Clock, Search, FileUp, X,
  AlertTriangle, Image as ImageIcon,
} from 'lucide-react'
import { loadShippedOrders, loadMappings, lookupMapping } from '@/lib/orders'

/* ─── 타입 ──────────────────────────────────────────────────────── */
type CsType   = 'return' | 'exchange'
type CsReason = 'simple_change' | 'defective'
type CsStatus = 'pending' | 'processed'

interface CsItem {
  id            : string
  type          : CsType
  mall          : string
  customer_name : string
  option_image  : string
  product_abbr  : string
  option_name   : string
  barcode       : string
  reason        : CsReason
  tracking_number: string
  registered_at : string
  status        : CsStatus
  processed_at  ?: string
}

/* ─── 로컬스토리지 헬퍼 ──────────────────────────────────────────── */
const CS_KEY = 'pm_cs_v1'

function loadCs(): CsItem[] {
  try {
    const raw = localStorage.getItem(CS_KEY)
    return raw ? (JSON.parse(raw) as CsItem[]) : []
  } catch { return [] }
}

function saveCs(items: CsItem[]) {
  try { localStorage.setItem(CS_KEY, JSON.stringify(items)) } catch {}
}

/* ─── 상품 캐시 헬퍼 (재고/불량 업데이트용) ─────────────────────── */
type CachedOption = {
  barcode?: string
  current_stock?: number
  defective?: number
  [k: string]: unknown
}
type CachedProduct = { id: string; options: CachedOption[] }

function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function saveCachedProducts(products: CachedProduct[]) {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    localStorage.setItem('pm_products_cache_v1', JSON.stringify({ ...parsed, data: products }))
  } catch {}
}

/* ─── 출고내역에서 송장번호 조회 ────────────────────────────────── */
function lookupTracking(customerName: string, barcode: string): string {
  if (!customerName || !barcode) return ''
  const shipped  = loadShippedOrders()
  const mappings = loadMappings()
  for (const order of shipped) {
    if (!order.customer_name.includes(customerName) && !customerName.includes(order.customer_name)) continue
    for (const item of order.items) {
      const mapping = lookupMapping(mappings, item.product_name ?? '', item.option)
      const itemBarcode = mapping.barcode ?? item.sku ?? ''
      if (itemBarcode === barcode) return order.tracking_number ?? ''
    }
  }
  return ''
}

/* ─── 날짜/월 유틸 ──────────────────────────────────────────────── */
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}
function nowIso() { return new Date().toISOString() }

/* ─── 쇼핑몰 배지 색상 ──────────────────────────────────────────── */
const MALL_COLORS: Record<string, { color: string; bg: string }> = {
  '스마트스토어': { color: '#059669', bg: '#ecfdf5' },
  '쿠팡':        { color: '#f97316', bg: '#fff7ed' },
  '11번가':      { color: '#be123c', bg: '#fff1f2' },
  'G마켓':       { color: '#0284c7', bg: '#f0f9ff' },
  '옥션':        { color: '#7c3aed', bg: '#f5f3ff' },
  '카페24':      { color: '#7c3aed', bg: '#f5f3ff' },
  '지그재그':    { color: '#e11d48', bg: '#fff1f2' },
  '에이블리':    { color: '#db2777', bg: '#fdf2f8' },
  '올웨이즈':    { color: '#d97706', bg: '#fffbeb' },
  '토스쇼핑':    { color: '#4f46e5', bg: '#eef2ff' },
  '롯데온':      { color: '#dc2626', bg: '#fef2f2' },
  'SSG':         { color: '#c2410c', bg: '#fff7ed' },
}
function mallStyle(mall: string) {
  return MALL_COLORS[mall] ?? { color: '#64748b', bg: '#f8fafc' }
}

/* ─── 빈 폼 ─────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  mall           : '',
  customer_name  : '',
  option_image   : '',
  product_abbr   : '',
  option_name    : '',
  barcode        : '',
  reason         : 'simple_change' as CsReason,
  tracking_number: '',
}

/* ─── 메인 컴포넌트 ─────────────────────────────────────────────── */
export default function CsManagementPage() {
  const curYM = getCurYM()

  const [items,    setItems]    = useState<CsItem[]>([])
  const [leftYM,   setLeftYM]   = useState(curYM)
  const [rightYM,  setRightYM]  = useState(curYM)

  /* 등록 모달 */
  const [modal,    setModal]    = useState<{ open: boolean; type: CsType; tab: 'direct' | 'file' } | null>(null)
  const [form,     setForm]     = useState({ ...EMPTY_FORM })
  const [saving,   setSaving]   = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* 검색 */
  const [leftSearch,  setLeftSearch]  = useState('')
  const [rightSearch, setRightSearch] = useState('')

  useEffect(() => { setItems(loadCs()) }, [])

  /* 파생 목록 */
  const pending = useMemo(() => {
    let list = items.filter(i => i.status === 'pending' && i.registered_at.slice(0, 7) === leftYM)
    if (leftSearch) {
      const q = leftSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q)
      )
    }
    return list.slice().sort((a, b) => b.registered_at.localeCompare(a.registered_at))
  }, [items, leftYM, leftSearch])

  const processed = useMemo(() => {
    let list = items.filter(i => i.status === 'processed' && (i.processed_at ?? '').slice(0, 7) === rightYM)
    if (rightSearch) {
      const q = rightSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q)
      )
    }
    return list.slice().sort((a, b) => (b.processed_at ?? '').localeCompare(a.processed_at ?? ''))
  }, [items, rightYM, rightSearch])

  /* ── 폼 핸들러 ── */
  const setF = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  /* 자동 송장조회 (수령인 + 바코드 입력 시) */
  const autoLookupTracking = () => {
    if (!form.customer_name || !form.barcode) return
    const tn = lookupTracking(form.customer_name, form.barcode)
    if (tn) setForm(f => ({ ...f, tracking_number: tn }))
    else alert('출고내역에서 해당 수령인+바코드 조합의 송장번호를 찾지 못했습니다.')
  }

  /* ── 직접 등록 저장 ── */
  const handleDirectSave = () => {
    if (!form.mall || !form.customer_name || !form.barcode) {
      alert('쇼핑몰, 수령인, 바코드는 필수 입력입니다.')
      return
    }
    setSaving(true)
    const newItem: CsItem = {
      id:             crypto.randomUUID(),
      type:           modal!.type,
      mall:           form.mall,
      customer_name:  form.customer_name,
      option_image:   form.option_image,
      product_abbr:   form.product_abbr,
      option_name:    form.option_name,
      barcode:        form.barcode,
      reason:         form.reason,
      tracking_number: form.tracking_number,
      registered_at:  nowIso(),
      status:         'pending',
    }
    const updated = [newItem, ...items]
    saveCs(updated)
    setItems(updated)
    setModal(null)
    setForm({ ...EMPTY_FORM })
    setSaving(false)
  }

  /* ── 파일 등록 (엑셀 업로드) ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
        const newItems: CsItem[] = rows.map(r => ({
          id:             crypto.randomUUID(),
          type:           modal!.type,
          mall:           String(r['쇼핑몰'] ?? ''),
          customer_name:  String(r['수령인'] ?? r['주문자'] ?? ''),
          option_image:   String(r['옵션이미지'] ?? ''),
          product_abbr:   String(r['상품약어'] ?? ''),
          option_name:    String(r['옵션명'] ?? ''),
          barcode:        String(r['바코드'] ?? ''),
          reason:         (r['구분'] === '불량' ? 'defective' : 'simple_change') as CsReason,
          tracking_number: String(r['송장번호'] ?? ''),
          registered_at:  nowIso(),
          status:         'pending',
        }))
        const updated = [...newItems, ...items]
        saveCs(updated)
        setItems(updated)
        alert(`${newItems.length}건이 등록되었습니다.`)
        setModal(null)
      } catch { alert('파일 형식이 올바르지 않습니다.') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 처리완료 ── */
  const handleProcess = async (item: CsItem) => {
    if (processing) return
    setProcessing(item.id)
    try {
      const products = loadCachedProducts()
      let found = false
      const updatedProducts = products.map(p => {
        const opts = p.options.map(o => {
          if (o.barcode !== item.barcode) return o
          found = true
          if (item.reason === 'simple_change') {
            const cur = typeof o.current_stock === 'number' ? o.current_stock : 0
            return { ...o, current_stock: cur + 1 }
          } else {
            const def = typeof o.defective === 'number' ? o.defective : 0
            return { ...o, defective: def + 1 }
          }
        })
        return { ...p, options: opts }
      })

      if (found) {
        saveCachedProducts(updatedProducts)
        const changedProducts = updatedProducts.filter(p =>
          p.options.some((o, i) => {
            const orig = products.find(pp => pp.id === p.id)?.options[i]
            return orig && (
              o.current_stock !== orig.current_stock ||
              o.defective !== orig.defective
            )
          })
        )
        await Promise.all(changedProducts.map(p =>
          fetch('/api/pm-products', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, options: p.options }),
          })
        ))
      }

      const updated = items.map(i =>
        i.id === item.id ? { ...i, status: 'processed' as CsStatus, processed_at: nowIso() } : i
      )
      saveCs(updated)
      setItems(updated)
    } finally {
      setProcessing(null)
    }
  }

  /* ── 엑셀 템플릿 다운로드 ── */
  const handleDownloadTemplate = () => {
    const rows = [{ 쇼핑몰: '', 수령인: '', 옵션이미지: '', 상품약어: '', 옵션명: '', 바코드: '', 구분: '단순변심', 송장번호: '' }]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CS접수')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'CS접수_템플릿.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ── 렌더 ── */
  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 72px)', minHeight: 0 }}>

      {/* ════ 좌측: CS접수 ════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 헤더 */}
        <div className="pm-card" style={{ padding: '12px 16px', marginBottom: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HeadphonesIcon size={16} style={{ color: '#2563eb' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>CS접수</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                {pending.length}건
              </span>
            </div>
            <div style={{ flex: 1 }} />
            {/* 등록 버튼 */}
            <button
              onClick={() => { setModal({ open: true, type: 'return', tab: 'direct' }); setForm({ ...EMPTY_FORM }) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <RotateCcw size={13} /> 반품등록
            </button>
            <button
              onClick={() => { setModal({ open: true, type: 'exchange', tab: 'direct' }); setForm({ ...EMPTY_FORM }) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <RefreshCw size={13} /> 교환등록
            </button>
          </div>

          {/* 월 네비게이션 + 검색 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setLeftYM(shiftMonth(leftYM, -1))}
              style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 78, textAlign: 'center' }}>
              {leftYM.replace('-', '년 ')}월
            </span>
            <button onClick={() => setLeftYM(shiftMonth(leftYM, 1))}
              style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={13} />
            </button>
            {leftYM !== curYM && (
              <button onClick={() => setLeftYM(curYM)}
                style={{ padding: '3px 9px', borderRadius: 6, border: '1.5px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                이번달
              </button>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={leftSearch}
                onChange={e => setLeftSearch(e.target.value)}
                placeholder="검색..."
                style={{ paddingLeft: 26, height: 28, fontSize: 12, fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 7, outline: 'none', width: 130 }}
              />
            </div>
          </div>
        </div>

        {/* 접수 목록 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* 컬럼 헤더 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 60px 64px 52px 72px 1fr 56px 68px',
            gap: 6, padding: '7px 12px',
            background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
          }}>
            {['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '바코드', '사유', ''].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pending.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <HeadphonesIcon size={32} style={{ margin: '0 auto 12px', opacity: 0.15, display: 'block' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                  {leftYM.replace('-', '년 ')}월 접수된 CS가 없습니다
                </p>
              </div>
            ) : (
              pending.map(item => {
                const ms = mallStyle(item.mall)
                const isProc = processing === item.id
                return (
                  <div key={item.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 60px 64px 52px 72px 1fr 56px 68px',
                    gap: 6, padding: '9px 12px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                  }}>
                    {/* 구분 (반품/교환) */}
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 5,
                      color: item.type === 'return' ? '#dc2626' : '#7c3aed',
                      background: item.type === 'return' ? '#fff1f2' : '#f5f3ff',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.type === 'return' ? '반품' : '교환'}
                    </span>

                    {/* 쇼핑몰 */}
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                      color: ms.color, background: ms.bg, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.mall || '-'}
                    </span>

                    {/* 수령인 */}
                    <div style={{ overflow: 'hidden' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.customer_name}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{fmtDateTime(item.registered_at)}</p>
                    </div>

                    {/* 옵션이미지 */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {item.option_image ? (
                        <img src={item.option_image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageIcon size={14} style={{ color: '#cbd5e1' }} />
                        </div>
                      )}
                    </div>

                    {/* 약어/옵션명 */}
                    <div style={{ overflow: 'hidden' }}>
                      <p style={{ fontSize: 10.5, fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_abbr || '-'}</p>
                      <p style={{ fontSize: 10, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.option_name || '-'}</p>
                    </div>

                    {/* 바코드 */}
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.barcode || '-'}
                    </span>

                    {/* 사유 */}
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap',
                      color: item.reason === 'defective' ? '#c2410c' : '#0369a1',
                      background: item.reason === 'defective' ? '#fff7ed' : '#f0f9ff',
                    }}>
                      {item.reason === 'defective' ? '불량' : '단순변심'}
                    </span>

                    {/* 처리완료 버튼 */}
                    <button
                      onClick={() => handleProcess(item)}
                      disabled={!!processing}
                      style={{
                        padding: '5px 8px', background: isProc ? '#94a3b8' : '#059669',
                        color: '#fff', border: 'none', borderRadius: 7,
                        fontSize: 10.5, fontWeight: 800, cursor: isProc ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}>
                      {isProc ? '처리중' : '처리완료'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ════ 우측: CS처리현황 ════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 헤더 */}
        <div className="pm-card" style={{ padding: '12px 16px', marginBottom: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} style={{ color: '#059669' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>CS처리현황</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
              {processed.length}건
            </span>
          </div>

          {/* 월 네비게이션 + 검색 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setRightYM(shiftMonth(rightYM, -1))}
              style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 78, textAlign: 'center' }}>
              {rightYM.replace('-', '년 ')}월
            </span>
            <button onClick={() => setRightYM(shiftMonth(rightYM, 1))}
              style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={13} />
            </button>
            {rightYM !== curYM && (
              <button onClick={() => setRightYM(curYM)}
                style={{ padding: '3px 9px', borderRadius: 6, border: '1.5px solid #059669', background: '#f0fdf4', color: '#059669', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                이번달
              </button>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={rightSearch}
                onChange={e => setRightSearch(e.target.value)}
                placeholder="검색..."
                style={{ paddingLeft: 26, height: 28, fontSize: 12, fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 7, outline: 'none', width: 130 }}
              />
            </div>
          </div>
        </div>

        {/* 처리현황 목록 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* 컬럼 헤더 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 60px 64px 52px 72px 1fr 56px 80px',
            gap: 6, padding: '7px 12px',
            background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
          }}>
            {['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '바코드', '사유', '처리일시'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {processed.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 12px', opacity: 0.15, display: 'block' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                  {rightYM.replace('-', '년 ')}월 처리된 CS가 없습니다
                </p>
              </div>
            ) : (
              processed.map(item => {
                const ms = mallStyle(item.mall)
                return (
                  <div key={item.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 60px 64px 52px 72px 1fr 56px 80px',
                    gap: 6, padding: '9px 12px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: '#fafffe',
                  }}>
                    {/* 구분 */}
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 5,
                      color: item.type === 'return' ? '#dc2626' : '#7c3aed',
                      background: item.type === 'return' ? '#fff1f2' : '#f5f3ff',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.type === 'return' ? '반품' : '교환'}
                    </span>

                    {/* 쇼핑몰 */}
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                      color: ms.color, background: ms.bg,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.mall || '-'}
                    </span>

                    {/* 수령인 */}
                    <div style={{ overflow: 'hidden' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.customer_name}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{fmtDateTime(item.registered_at)}</p>
                    </div>

                    {/* 옵션이미지 */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {item.option_image ? (
                        <img src={item.option_image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageIcon size={14} style={{ color: '#cbd5e1' }} />
                        </div>
                      )}
                    </div>

                    {/* 약어/옵션명 */}
                    <div style={{ overflow: 'hidden' }}>
                      <p style={{ fontSize: 10.5, fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_abbr || '-'}</p>
                      <p style={{ fontSize: 10, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.option_name || '-'}</p>
                    </div>

                    {/* 바코드 */}
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.barcode || '-'}
                    </span>

                    {/* 사유 */}
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap',
                      color: item.reason === 'defective' ? '#c2410c' : '#0369a1',
                      background: item.reason === 'defective' ? '#fff7ed' : '#f0f9ff',
                    }}>
                      {item.reason === 'defective' ? '불량' : '단순변심'}
                    </span>

                    {/* 처리일시 */}
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>
                        ✓ {fmtDateTime(item.processed_at ?? '')}
                      </span>
                      {item.reason === 'simple_change' && (
                        <p style={{ fontSize: 9, color: '#0284c7', marginTop: 1 }}>재고+1</p>
                      )}
                      {item.reason === 'defective' && (
                        <p style={{ fontSize: 9, color: '#c2410c', marginTop: 1 }}>불량+1</p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ════ 등록 모달 ══════════════════════════════════════════════ */}
      {modal?.open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}>
          <div
            className="pm-card animate-scale-in"
            style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: modal.type === 'return' ? '#fff1f2' : '#f5f3ff',
              }}>
                {modal.type === 'return'
                  ? <RotateCcw size={15} style={{ color: '#dc2626' }} />
                  : <RefreshCw size={15} style={{ color: '#7c3aed' }} />
                }
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>
                  {modal.type === 'return' ? '반품' : '교환'} 등록
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>등록 방식을 선택하세요</p>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setModal(null)}
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#64748b' }} />
              </button>
            </div>

            {/* 탭 (직접등록 / 파일등록) */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {(['direct', 'file'] as const).map(t => (
                <button key={t}
                  onClick={() => setModal(m => m ? { ...m, tab: t } : m)}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 800,
                    background: modal.tab === t ? '#fff' : '#f8fafc',
                    color: modal.tab === t ? '#0f172a' : '#94a3b8',
                    borderBottom: modal.tab === t ? '2px solid #2563eb' : '2px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {t === 'direct' ? <><Plus size={13} />직접등록</> : <><FileUp size={13} />파일등록</>}
                </button>
              ))}
            </div>

            {/* 직접등록 폼 */}
            {modal.tab === 'direct' && (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gap: 12 }}>

                  {/* 쇼핑몰 */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                      쇼핑몰 <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={form.mall}
                      onChange={e => setF('mall', e.target.value)}
                      className="pm-input pm-select"
                      style={{ fontSize: 13 }}>
                      <option value="">쇼핑몰 선택</option>
                      {['스마트스토어', '쿠팡', '11번가', 'G마켓', '옥션', '카페24', '지그재그', '에이블리', '올웨이즈', '토스쇼핑', '롯데온', 'SSG', '기타'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* 주문자(수령인) */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                      주문자(수령인) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      value={form.customer_name}
                      onChange={e => setF('customer_name', e.target.value)}
                      placeholder="수령인 이름"
                      className="pm-input"
                    />
                  </div>

                  {/* 옵션이미지 */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                      옵션이미지 URL
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input
                        value={form.option_image}
                        onChange={e => setF('option_image', e.target.value)}
                        placeholder="https://..."
                        className="pm-input"
                        style={{ flex: 1 }}
                      />
                      {form.option_image && (
                        <img src={form.option_image} alt=""
                          style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                    </div>
                  </div>

                  {/* 상품약어 + 옵션명 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                        상품약어
                      </label>
                      <input
                        value={form.product_abbr}
                        onChange={e => setF('product_abbr', e.target.value)}
                        placeholder="예: BLK-MT"
                        className="pm-input"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                        옵션명
                      </label>
                      <input
                        value={form.option_name}
                        onChange={e => setF('option_name', e.target.value)}
                        placeholder="예: 블랙/FREE"
                        className="pm-input"
                      />
                    </div>
                  </div>

                  {/* 바코드 */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                      바코드 <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={form.barcode}
                        onChange={e => setF('barcode', e.target.value)}
                        placeholder="바코드 번호"
                        className="pm-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={autoLookupTracking}
                        type="button"
                        title="출고내역에서 송장번호 자동 조회"
                        style={{
                          padding: '0 12px', height: 36, background: '#f1f5f9', border: '1px solid #e2e8f0',
                          borderRadius: 10, fontSize: 11.5, fontWeight: 800, color: '#475569', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                        }}>
                        <Search size={12} /> 송장조회
                      </button>
                    </div>
                  </div>

                  {/* 구분 */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 8, display: 'block' }}>
                      구분 <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['simple_change', 'defective'] as CsReason[]).map(r => (
                        <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', flex: 1 }}>
                          <div
                            onClick={() => setF('reason', r)}
                            style={{
                              width: '100%', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                              border: `2px solid ${form.reason === r ? (r === 'defective' ? '#f97316' : '#2563eb') : '#e2e8f0'}`,
                              background: form.reason === r ? (r === 'defective' ? '#fff7ed' : '#eff6ff') : '#fff',
                              display: 'flex', alignItems: 'center', gap: 8,
                              transition: 'all 120ms',
                            }}>
                            {r === 'defective'
                              ? <AlertTriangle size={14} style={{ color: '#f97316', flexShrink: 0 }} />
                              : <Clock size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                            }
                            <div>
                              <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                                {r === 'defective' ? '불량' : '단순변심'}
                              </p>
                              <p style={{ fontSize: 10, color: '#94a3b8' }}>
                                {r === 'defective' ? '불량수량 +1 처리' : '재고수량 +1 복원'}
                              </p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 송장번호 */}
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }}>
                      송장번호
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>
                        (출고내역에서 자동조회 가능)
                      </span>
                    </label>
                    <input
                      value={form.tracking_number}
                      onChange={e => setF('tracking_number', e.target.value)}
                      placeholder="운송장번호"
                      className="pm-input"
                    />
                  </div>
                </div>

                {/* 저장 버튼 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setModal(null)}
                    style={{ flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    취소
                  </button>
                  <button
                    onClick={handleDirectSave}
                    disabled={saving}
                    style={{
                      flex: 2, padding: '10px 0', border: 'none', borderRadius: 10,
                      fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                      background: modal.type === 'return' ? '#dc2626' : '#7c3aed',
                      color: '#fff',
                    }}>
                    {saving ? '저장중...' : `${modal.type === 'return' ? '반품' : '교환'} 접수 등록`}
                  </button>
                </div>
              </div>
            )}

            {/* 파일등록 탭 */}
            {modal.tab === 'file' && (
              <div style={{ padding: '24px 20px' }}>
                <div style={{
                  background: '#f8fafc', border: '2px dashed #e2e8f0',
                  borderRadius: 14, padding: '32px 24px', textAlign: 'center', marginBottom: 20,
                }}>
                  <FileUp size={32} style={{ margin: '0 auto 12px', color: '#94a3b8', display: 'block' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                    엑셀 파일을 업로드하세요
                  </p>
                  <p style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 16 }}>
                    쇼핑몰, 수령인, 옵션이미지, 상품약어, 옵션명, 바코드, 구분, 송장번호
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                      onClick={handleDownloadTemplate}
                      style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      템플릿 다운로드
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      파일 선택
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>

                {/* 컬럼 안내 */}
                <div className="pm-card" style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 10 }}>📋 엑셀 컬럼 형식</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['쇼핑몰', '스마트스토어, 쿠팡 등'],
                      ['수령인', '주문자 또는 수령인'],
                      ['옵션이미지', '이미지 URL (선택)'],
                      ['상품약어', '상품 약어코드'],
                      ['옵션명', '예: 블랙/FREE'],
                      ['바코드', '바코드 번호'],
                      ['구분', '단순변심 또는 불량'],
                      ['송장번호', '운송장번호'],
                    ].map(([col, desc]) => (
                      <div key={col} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: 5, flexShrink: 0 }}>{col}</span>
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => setModal(null)}
                  style={{ width: '100%', marginTop: 16, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
