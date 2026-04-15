'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, RefreshCw } from 'lucide-react'

/* ── 상수 ── */
const CATS_STORAGE_KEY = 'pm_categories_v1'
const PRODUCTS_CACHE_KEY = 'pm_products_cache_v1'
const INIT_EXTRA_CATS = ['가방', '의류', '잡화']
const PM_PRODUCTS_CACHE_SYNC_KEY = 'pm_products_cache_sync'

/* ── 타입 ── */
interface ProductOption {
  name: string
  size?: string
  korean_name?: string
  chinese_name?: string
  image?: string
  barcode?: string
  ordered?: number
  received?: number
  sold?: number
  current_stock?: number
  defective?: number
}

interface Product {
  id: string
  code: string
  name: string
  abbr: string
  category: string
  loca: string
  options: ProductOption[]
  status: string
}

/* ── 헬퍼 ── */
function loadCats(): string[] {
  if (typeof window === 'undefined') return INIT_EXTRA_CATS
  try {
    const r = localStorage.getItem(CATS_STORAGE_KEY)
    return r ? (JSON.parse(r) as string[]) : INIT_EXTRA_CATS
  } catch { return INIT_EXTRA_CATS }
}

function loadCachedProducts(): Product[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { data?: unknown }
    return Array.isArray(parsed.data) ? (parsed.data as Product[]) : []
  } catch { return [] }
}

function koreanOnly(str: string): string {
  return str ? (str.match(/[가-힣]+/g) ?? []).join('') : ''
}

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

/* ── 메인 컴포넌트 ── */
export default function LocaPage() {
  const [cats, setCats]           = useState<string[]>([])
  const [selectedCat, setSelectedCat] = useState('')
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)

  const refreshCats = useCallback(() => {
    const loaded = loadCats()
    setCats(loaded)
    setSelectedCat(prev => (!prev || !loaded.includes(prev)) ? (loaded[0] ?? '') : prev)
  }, [])

  const loadCache = useCallback(() => {
    const cached = loadCachedProducts()
    if (cached.length > 0) setProducts(cached)
  }, [])

  const fetchFresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pm_products')
        .select('id,code,name,abbr,category,loca,options,status')
        .order('code', { ascending: true })
      if (!error && Array.isArray(data)) setProducts(data as Product[])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshCats()
    loadCache()
    fetchFresh()

    const onStorage = (e: StorageEvent) => {
      if (e.key === CATS_STORAGE_KEY) refreshCats()
      if (e.key === PRODUCTS_CACHE_KEY) loadCache()
    }
    const onSync = () => loadCache()

    window.addEventListener('storage', onStorage)
    window.addEventListener(PM_PRODUCTS_CACHE_SYNC_KEY, onSync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(PM_PRODUCTS_CACHE_SYNC_KEY, onSync)
    }
  }, [refreshCats, loadCache, fetchFresh])

  const filtered = useMemo(() =>
    products
      .filter(p => !!selectedCat && p.category === selectedCat)
      .sort((a, b) => a.code.localeCompare(b.code))
  , [products, selectedCat])

  const printTitle = selectedCat ? `${selectedCat}_LOCA` : 'LOCA'

  /* ── 테이블 공통 렌더 ── */
  const COL_HEADERS = ['상품코드', '이미지', '옵션명', 'LOCA', '상품약어', '상품명']

  const renderHeaderRow = (forPrint: boolean) => (
    <tr>
      {COL_HEADERS.map(h => (
        <th
          key={h}
          style={{
            border: forPrint ? '1px solid #000' : '1px solid #93c5fd',
            padding: forPrint ? '2pt 4pt' : '5px 7px',
            fontSize: forPrint ? '9pt' : 12,
            fontWeight: 700,
            background: '#bde0f5',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            color: '#1e3a5f',
          }}
        >{h}</th>
      ))}
    </tr>
  )

  const renderRows = (forPrint: boolean) =>
    filtered.map(p => {
      const opts        = p.options ?? []
      const firstImg    = opts[0]?.image ?? ''
      const optNames    = opts.map(o => o.name || o.korean_name || '').filter(Boolean)
      const pairs       = chunk(optNames, 2)
      const abbr        = koreanOnly(p.abbr || '')
      const bdr         = forPrint ? '1px solid #000' : '1px solid #e2e8f0'
      const pad         = forPrint ? '2pt 4pt' : '5px 7px'
      const fs          = forPrint ? '9pt' : 12

      return (
        <tr key={p.id}>
          <td style={{ border: bdr, padding: pad, fontSize: fs, fontFamily: 'monospace', verticalAlign: 'middle' }}>
            {p.code}
          </td>
          <td style={{ border: bdr, padding: forPrint ? '2pt' : '3px', textAlign: 'center', verticalAlign: 'middle' }}>
            {firstImg
              ? <img
                  src={firstImg}
                  alt=""
                  style={{
                    width: forPrint ? 34 : 46,
                    height: forPrint ? 34 : 46,
                    objectFit: 'cover',
                    display: 'block',
                    margin: 'auto',
                    borderRadius: forPrint ? 0 : 4,
                  }}
                />
              : <span style={{ color: '#cbd5e1', fontSize: forPrint ? '8pt' : 11 }}>—</span>
            }
          </td>
          <td style={{ border: bdr, padding: pad, fontSize: fs, verticalAlign: 'middle' }}>
            {pairs.map((pair, i) => (
              <div key={i} style={{ lineHeight: '1.5', whiteSpace: 'nowrap' }}>{pair.join(', ')}</div>
            ))}
          </td>
          <td style={{ border: bdr, padding: pad, fontSize: fs, fontWeight: 800, textAlign: 'center', verticalAlign: 'middle' }}>
            {p.loca}
          </td>
          <td style={{ border: bdr, padding: pad, fontSize: fs, verticalAlign: 'middle' }}>
            {abbr}
          </td>
          <td style={{ border: bdr, padding: pad, fontSize: fs, verticalAlign: 'middle', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: forPrint ? 'clip' : 'ellipsis' }}>
            {p.name}
          </td>
        </tr>
      )
    })

  const colGroup = (forPrint: boolean) => (
    <colgroup>
      <col style={{ width: forPrint ? '15%' : 104 }}/>
      <col style={{ width: forPrint ? '10%' : 68 }}/>
      <col style={{ width: forPrint ? '18%' : 130 }}/>
      <col style={{ width: forPrint ? '10%' : 80 }}/>
      <col style={{ width: forPrint ? '13%' : 100 }}/>
      <col/>
    </colgroup>
  )

  const titleRow = (forPrint: boolean) => (
    <tr>
      <td
        colSpan={6}
        style={{
          border: forPrint ? '1px solid #000' : '1px solid #bde0f5',
          borderBottom: forPrint ? '1px solid #000' : '1px solid #bde0f5',
          padding: forPrint ? '3pt 5pt' : '6px 10px',
          fontSize: forPrint ? '11pt' : 14,
          fontWeight: 800,
          background: forPrint ? '#fff' : '#f0f9ff',
          color: '#1e3a5f',
        }}
      >
        {printTitle}
      </td>
    </tr>
  )

  return (
    <>
      {/* ── 인쇄 CSS ── */}
      <style>{`
        @media print {
          aside, header, .loca-no-print { display: none !important; }
          div[style*="margin-left"] { margin-left: 0 !important; }
          main {
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
          }
          .loca-screen-area { display: none !important; }
          .loca-print-area  { display: block !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page { margin: 10mm; size: A4 portrait; }
        }
        .loca-print-area { display: none; }
      `}</style>

      {/* ── 화면 UI ── */}
      <div className="loca-screen-area">
        {/* 카테고리 탭 */}
        <div className="loca-no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {cats.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              style={{
                padding: '6px 18px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 700,
                border: selectedCat === cat ? 'none' : '1px solid #e2e8f0',
                cursor: 'pointer',
                background: selectedCat === cat ? '#2563eb' : '#fff',
                color: selectedCat === cat ? '#fff' : '#475569',
                transition: 'all 150ms',
                boxShadow: selectedCat === cat ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 액션 바 */}
        <div className="loca-no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{printTitle}</span>
          {filtered.length > 0 && (
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{filtered.length}개 상품</span>
          )}
          <div style={{ flex: 1 }}/>
          <button
            onClick={() => { loadCache(); fetchFresh() }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#475569' }}
          >
            <RefreshCw size={13}/> 새로고침
          </button>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
          >
            <Printer size={13}/> 인쇄
          </button>
        </div>

        {/* 화면 테이블 */}
        {loading && products.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>데이터를 불러오는 중...</div>
        ) : !selectedCat ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>카테고리를 선택하세요.</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>해당 카테고리에 등록된 상품이 없습니다.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #bfdbfe', borderRadius: 10, background: '#fff' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 580 }}>
              {colGroup(false)}
              <thead>
                {titleRow(false)}
                {renderHeaderRow(false)}
              </thead>
              <tbody>
                {renderRows(false)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 인쇄 전용 영역 ── */}
      <div className="loca-print-area">
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif' }}>
          {colGroup(true)}
          <thead>
            {titleRow(true)}
            {renderHeaderRow(true)}
          </thead>
          <tbody>
            {renderRows(true)}
          </tbody>
        </table>
      </div>
    </>
  )
}
