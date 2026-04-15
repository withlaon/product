'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, RefreshCw } from 'lucide-react'

/* ── 상수 ── */
const CATS_STORAGE_KEY       = 'pm_categories_v1'
const PRODUCTS_CACHE_KEY     = 'pm_products_cache_v1'
const INIT_EXTRA_CATS        = ['가방', '의류', '잡화']
const PM_PRODUCTS_CACHE_SYNC_KEY = 'pm_products_cache_sync'

/* ── 타입 ── */
interface ProductOption {
  name: string
  size?: string
  korean_name?: string
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
  const [cats, setCats]               = useState<string[]>([])
  const [selectedCat, setSelectedCat] = useState('')
  const [products, setProducts]       = useState<Product[]>([])
  const [loading, setLoading]         = useState(true)
  const printAreaRef                  = useRef<HTMLDivElement>(null)

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

  /* ── 팝업 인쇄 ── */
  const handlePrint = () => {
    if (!printAreaRef.current) return
    const html = printAreaRef.current.innerHTML
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <title>${printTitle}</title>
  <style>
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 10mm; size: A4 portrait; }
    body { font-family: Arial, sans-serif; background: #fff; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr { page-break-inside: avoid; }
    td, th { border: 1px solid #000; font-size: 9pt; vertical-align: middle; padding: 0; overflow: hidden; }
    div { box-sizing: border-box; }
    img { display: block; object-fit: cover; margin: auto; }
  </style>
</head>
<body>${html}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  /* ── 화면 행 고정 높이 ── */
  const ROW_H = 54
  const renderRows = () =>
    filtered.map(p => {
      const opts     = p.options ?? []
      const firstImg = opts[0]?.image ?? ''
      const optNames = opts.map(o => o.name || o.korean_name || '').filter(Boolean)
      const pairs    = chunk(optNames, 2)
      const abbr     = koreanOnly(p.abbr || '')
      const isDel    = p.status === 'pending_delete'

      const cell: React.CSSProperties = { border: '1px solid #e2e8f0', padding: 0, height: ROW_H }
      const inner: React.CSSProperties = {
        height: ROW_H, overflow: 'hidden', display: 'flex', alignItems: 'center',
      }

      return (
        <tr key={p.id}>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 6px', fontSize: 12, color: isDel ? '#dc2626' : undefined }}>
              {p.code}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, justifyContent: 'center' }}>
              {firstImg
                ? <img src={firstImg} alt="" style={{ width: 46, height: 46, objectFit: 'cover', display: 'block', borderRadius: 4 }}/>
                : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
              }
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, flexDirection: 'column', justifyContent: 'center', padding: '0 6px' }}>
              {pairs.map((pair, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: '1.6', whiteSpace: 'nowrap' }}>{pair.join(', ')}</div>
              ))}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
              {p.loca}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 6px', fontSize: 12 }}>
              {abbr}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 6px', fontSize: 12, whiteSpace: 'nowrap' }}>
              {p.name}
            </div>
          </td>
        </tr>
      )
    })

  /* ── 인쇄용 행 고정 높이 ── */
  const ROW_H_PT = '40pt'
  const renderPrintRows = () =>
    filtered.map(p => {
      const opts     = p.options ?? []
      const firstImg = opts[0]?.image ?? ''
      const optNames = opts.map(o => o.name || o.korean_name || '').filter(Boolean)
      const pairs    = chunk(optNames, 2)
      const abbr     = koreanOnly(p.abbr || '')
      const isDel    = p.status === 'pending_delete'

      const cell: React.CSSProperties = { border: '1px solid #000', padding: 0, height: ROW_H_PT, overflow: 'hidden' }
      const inner: React.CSSProperties = {
        height: ROW_H_PT, overflow: 'hidden', display: 'flex', alignItems: 'center',
      }

      return (
        <tr key={p.id}>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 4pt', fontSize: '9pt', color: isDel ? '#dc2626' : undefined }}>
              {p.code}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, justifyContent: 'center' }}>
              {firstImg && (
                <img src={firstImg} alt="" style={{ width: 34, height: 34, objectFit: 'cover', display: 'block', margin: 'auto' }}/>
              )}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, flexDirection: 'column', justifyContent: 'center', padding: '0 4pt' }}>
              {pairs.map((pair, i) => (
                <div key={i} style={{ fontSize: '9pt', lineHeight: '1.4' }}>{pair.join(', ')}</div>
              ))}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, justifyContent: 'center', fontSize: '9pt', fontWeight: 800 }}>
              {p.loca}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 4pt', fontSize: '9pt' }}>
              {abbr}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, padding: '0 4pt', fontSize: '9pt', whiteSpace: 'nowrap' }}>
              {p.name}
            </div>
          </td>
        </tr>
      )
    })

  const COL_HEADERS = ['상품코드', '이미지', '옵션명', 'LOCA', '상품약어', '상품명']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── 상단 고정 영역 ── */}
      <div style={{ flexShrink: 0 }}>
        {/* 카테고리 탭 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
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
            onClick={handlePrint}
            disabled={filtered.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', border: 'none', borderRadius: 8, background: filtered.length === 0 ? '#94a3b8' : '#2563eb', color: '#fff', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 700 }}
          >
            <Printer size={13}/> 인쇄
          </button>
        </div>
      </div>

      {/* ── 스크롤 테이블 영역 ── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && products.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>데이터를 불러오는 중...</div>
        ) : !selectedCat ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>카테고리를 선택하세요.</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>해당 카테고리에 등록된 상품이 없습니다.</div>
        ) : (
          <div style={{ border: '1px solid #bfdbfe', borderRadius: 10, background: '#fff' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 580 }}>
              <colgroup>
                <col style={{ width: 104 }}/><col style={{ width: 68 }}/><col style={{ width: 87 }}/>
                <col style={{ width: 80 }}/><col style={{ width: 143 }}/><col/>
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <td colSpan={6} style={{ border: '1px solid #bfdbfe', padding: '6px 10px', fontSize: 14, fontWeight: 800, background: '#f0f9ff', color: '#1e3a5f' }}>
                    {printTitle}
                  </td>
                </tr>
                <tr>
                  {COL_HEADERS.map(h => (
                    <th key={h} style={{ border: '1px solid #93c5fd', padding: '5px 7px', fontSize: 12, fontWeight: 700, background: '#bde0f5', textAlign: 'center', color: '#1e3a5f' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{renderRows()}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 인쇄 전용 숨김 영역 (팝업창에 HTML 주입용) ── */}
      <div ref={printAreaRef} style={{ display: 'none' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif' }}>
          <colgroup>
            <col style={{ width: '15%' }}/><col style={{ width: '10%' }}/><col style={{ width: '12%' }}/>
            <col style={{ width: '10%' }}/><col style={{ width: '19%' }}/><col/>
          </colgroup>
          <thead>
            <tr>
              <td colSpan={6} style={{ border: '1px solid #000', padding: '3pt 5pt', fontSize: '11pt', fontWeight: 800 }}>
                {printTitle}
              </td>
            </tr>
            <tr>
              {COL_HEADERS.map(h => (
                <th key={h} style={{ border: '1px solid #000', padding: '2pt 4pt', fontSize: '9pt', fontWeight: 700, background: '#bde0f5', textAlign: 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{renderPrintRows()}</tbody>
        </table>
      </div>
    </div>
  )
}
