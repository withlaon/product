'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, RefreshCw, Plus, ChevronDown, ChevronRight } from 'lucide-react'

/* ── 상수 ── */
const CATS_STORAGE_KEY           = 'pm_categories_v1'
const PRODUCTS_CACHE_KEY         = 'pm_products_cache_v1'
const INIT_EXTRA_CATS            = ['가방', '의류', '잡화']
const PM_PRODUCTS_CACHE_SYNC_KEY = 'pm_products_cache_sync'
const CUSTOM_LOCA_KEY            = 'pm_loca_custom_v1'

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

interface LocaGroup { prefix: string; items: string[] }

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

function loadCustomLocas(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const r = localStorage.getItem(CUSTOM_LOCA_KEY)
    return r ? (JSON.parse(r) as string[]) : []
  } catch { return [] }
}

function saveCustomLocas(list: string[]) {
  try { localStorage.setItem(CUSTOM_LOCA_KEY, JSON.stringify(list)) } catch {}
}

function koreanOnly(str: string): string {
  return str ? (str.match(/[가-힣]+/g) ?? []).join('') : ''
}

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

/* ── 로케이션 그룹 생성 ── */
function buildPresetGroups(): LocaGroup[] {
  const groups: LocaGroup[] = []
  // Zone A-F: [A-F][A-D]-01~05
  for (const f of ['A','B','C','D','E','F']) {
    for (const s of ['A','B','C','D']) {
      const prefix = `${f}${s}`
      groups.push({ prefix, items: Array.from({ length: 5 }, (_, i) => `${prefix}-${String(i+1).padStart(2,'0')}`) })
    }
  }
  // Zone 1: 1[A-K]-01~06
  for (const s of ['A','B','C','D','E','F','G','H','I','J','K']) {
    const prefix = `1${s}`
    groups.push({ prefix, items: Array.from({ length: 6 }, (_, i) => `${prefix}-${String(i+1).padStart(2,'0')}`) })
  }
  // Zone 2: 2[A-E]-01~07
  for (const s of ['A','B','C','D','E']) {
    const prefix = `2${s}`
    groups.push({ prefix, items: Array.from({ length: 7 }, (_, i) => `${prefix}-${String(i+1).padStart(2,'0')}`) })
  }
  return groups
}

const PRESET_GROUPS = buildPresetGroups()
const ALL_PRESET_LOCA_SET = new Set(PRESET_GROUPS.flatMap(g => g.items))

/* ── 메인 컴포넌트 ── */
export default function LocaPage() {
  const [cats, setCats]                 = useState<string[]>([])
  const [selectedCat, setSelectedCat]   = useState('')
  const [products, setProducts]         = useState<Product[]>([])
  const [loading, setLoading]           = useState(true)
  const [customLocas, setCustomLocas]   = useState<string[]>([])
  const [showAddForm, setShowAddForm]   = useState(false)
  const [newLocaInput, setNewLocaInput] = useState('')
  const [expanded, setExpanded]         = useState<Record<string, boolean>>({
    'A': true, 'B': false, 'C': false, 'D': false, 'E': false, 'F': false,
    '1': true, '2': true, 'custom': true,
  })
  const printAreaRef = useRef<HTMLDivElement>(null)

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
    setCustomLocas(loadCustomLocas())

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

  /* ── 카테고리 필터 (왼쪽 테이블용) ── */
  const filtered = useMemo(() =>
    products
      .filter(p => !!selectedCat && p.category === selectedCat)
      .sort((a, b) => a.code.localeCompare(b.code))
  , [products, selectedCat])

  /* ── 로케이션별 상품코드 맵 (전체 상품 기준) ── */
  const locaMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const p of products) {
      const loca = p.loca?.trim()
      if (!loca) continue
      if (!map[loca]) map[loca] = []
      map[loca].push(p.code)
    }
    return map
  }, [products])

  /* ── 미분류 상품 (loca가 있지만 정의된 로케이션이 아닌 경우) ── */
  const unmatchedProducts = useMemo(() => {
    const allLocas = new Set([...ALL_PRESET_LOCA_SET, ...customLocas])
    return products.filter(p => p.loca?.trim() && !allLocas.has(p.loca.trim()))
  }, [products, customLocas])

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

  /* ── 커스텀 로케이션 추가/삭제 ── */
  const addCustomLoca = () => {
    const v = newLocaInput.trim().toUpperCase()
    if (!v) return
    const allExisting = [...ALL_PRESET_LOCA_SET, ...customLocas]
    if (allExisting.includes(v)) { alert('이미 존재하는 로케이션입니다.'); return }
    const next = [...customLocas, v]
    setCustomLocas(next)
    saveCustomLocas(next)
    setNewLocaInput('')
    setShowAddForm(false)
  }

  const removeCustomLoca = (loca: string) => {
    const next = customLocas.filter(l => l !== loca)
    setCustomLocas(next)
    saveCustomLocas(next)
  }

  const toggleZone = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  /* ── 왼쪽: 테이블 행 렌더 ── */
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
      const inner: React.CSSProperties = { height: ROW_H, overflow: 'hidden', display: 'flex', alignItems: 'center' }
      return (
        <tr key={p.id}>
          <td style={cell}><div style={{ ...inner, padding: '0 6px', fontSize: 12, color: isDel ? '#dc2626' : undefined }}>{p.code}</div></td>
          <td style={cell}>
            <div style={{ ...inner, justifyContent: 'center' }}>
              {firstImg
                ? <img src={firstImg} alt="" style={{ width: 46, height: 46, objectFit: 'cover', display: 'block', borderRadius: 4 }}/>
                : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
            </div>
          </td>
          <td style={cell}>
            <div style={{ ...inner, flexDirection: 'column', justifyContent: 'center', padding: '0 6px' }}>
              {pairs.map((pair, i) => <div key={i} style={{ fontSize: 12, lineHeight: '1.6', whiteSpace: 'nowrap' }}>{pair.join(', ')}</div>)}
            </div>
          </td>
          <td style={cell}><div style={{ ...inner, justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{p.loca}</div></td>
          <td style={cell}><div style={{ ...inner, padding: '0 6px', fontSize: 12 }}>{abbr}</div></td>
          <td style={cell}><div style={{ ...inner, padding: '0 6px', fontSize: 12, whiteSpace: 'nowrap' }}>{p.name}</div></td>
        </tr>
      )
    })

  /* ── 인쇄용 행 렌더 ── */
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
      const inner: React.CSSProperties = { height: ROW_H_PT, overflow: 'hidden', display: 'flex', alignItems: 'center' }
      return (
        <tr key={p.id}>
          <td style={cell}><div style={{ ...inner, padding: '0 4pt', fontSize: '9pt', color: isDel ? '#dc2626' : undefined }}>{p.code}</div></td>
          <td style={cell}><div style={{ ...inner, justifyContent: 'center' }}>{firstImg && <img src={firstImg} alt="" style={{ width: 34, height: 34, objectFit: 'cover', display: 'block', margin: 'auto' }}/>}</div></td>
          <td style={cell}><div style={{ ...inner, flexDirection: 'column', justifyContent: 'center', padding: '0 4pt' }}>{pairs.map((pair, i) => <div key={i} style={{ fontSize: '9pt', lineHeight: '1.4' }}>{pair.join(', ')}</div>)}</div></td>
          <td style={cell}><div style={{ ...inner, justifyContent: 'center', fontSize: '9pt', fontWeight: 800 }}>{p.loca}</div></td>
          <td style={cell}><div style={{ ...inner, padding: '0 4pt', fontSize: '9pt' }}>{abbr}</div></td>
          <td style={cell}><div style={{ ...inner, padding: '0 4pt', fontSize: '9pt', whiteSpace: 'nowrap' }}>{p.name}</div></td>
        </tr>
      )
    })

  const COL_HEADERS = ['상품코드', '이미지', '옵션명', 'LOCA', '상품약어', '상품명']

  /* ── 오른쪽: 로케이션 그룹 렌더 ── */
  const renderLocaRows = (groups: LocaGroup[], isCustom = false) =>
    groups.map(group => (
      <div key={group.prefix} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 3, gap: 4 }}>
        {/* 행 레이블 */}
        <div style={{
          width: 36, minWidth: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isCustom ? '#fef3c7' : '#f0f9ff',
          border: `1px solid ${isCustom ? '#fde68a' : '#bfdbfe'}`,
          borderRadius: 5, fontSize: 9.5, fontWeight: 800,
          color: isCustom ? '#92400e' : '#1e40af', flexShrink: 0,
        }}>{group.prefix}</div>
        {/* 로케이션 셀 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
          {group.items.map(loca => {
            const codes = locaMap[loca] ?? []
            const has = codes.length > 0
            return (
              <div key={loca} style={{
                minWidth: 58, flex: '1 0 58px',
                border: `1px solid ${has ? '#93c5fd' : '#e2e8f0'}`,
                borderRadius: 5, background: has ? '#eff6ff' : '#fafafa',
                padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 8.5, fontWeight: 800, color: has ? '#1d4ed8' : '#94a3b8' }}>{loca}</span>
                  {isCustom && (
                    <span onClick={() => removeCustomLoca(loca)}
                      style={{ fontSize: 8, color: '#dc2626', cursor: 'pointer', lineHeight: 1, padding: '0 1px' }}>✕</span>
                  )}
                </div>
                {codes.length === 0
                  ? <span style={{ fontSize: 7.5, color: '#d1d5db' }}>—</span>
                  : codes.map(code => (
                      <div key={code} style={{
                        fontSize: 8.5, fontWeight: 700, color: '#1e293b',
                        background: '#dbeafe', borderRadius: 3, padding: '1px 3px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{code}</div>
                    ))
                }
              </div>
            )
          })}
        </div>
      </div>
    ))

  /* ── 존 섹션 렌더 ── */
  const ZoneSection = ({
    zoneKey, label, labelColor, headerBg, groups, isCustom = false,
  }: {
    zoneKey: string; label: string; labelColor: string; headerBg: string;
    groups: LocaGroup[]; isCustom?: boolean
  }) => {
    const isOpen = expanded[zoneKey] ?? false
    const activeCnt = groups.flatMap(g => g.items).filter(l => (locaMap[l]?.length ?? 0) > 0).length
    return (
      <div style={{ marginBottom: 6 }}>
        <button onClick={() => toggleZone(zoneKey)} style={{
          display: 'flex', alignItems: 'center', gap: 5, width: '100%',
          background: headerBg, border: 'none', borderRadius: 6,
          padding: '4px 10px', cursor: 'pointer', marginBottom: isOpen ? 5 : 0,
        }}>
          {isOpen ? <ChevronDown size={11} color={labelColor}/> : <ChevronRight size={11} color={labelColor}/>}
          <span style={{ fontSize: 11, fontWeight: 800, color: labelColor }}>{label}</span>
          {activeCnt > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#2563eb', background: '#dbeafe', borderRadius: 10, padding: '0 6px' }}>
              {activeCnt}칸 배치됨
            </span>
          )}
        </button>
        {isOpen && <div style={{ paddingLeft: 2 }}>{renderLocaRows(groups, isCustom)}</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════
          왼쪽: 인쇄용 LOCA
      ══════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', paddingRight: 10 }}>

        {/* 카테고리 탭 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
          {cats.map(cat => (
            <button key={cat} onClick={() => setSelectedCat(cat)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700,
              border: selectedCat === cat ? 'none' : '1px solid #e2e8f0', cursor: 'pointer',
              background: selectedCat === cat ? '#2563eb' : '#fff',
              color: selectedCat === cat ? '#fff' : '#475569', transition: 'all 150ms',
              boxShadow: selectedCat === cat ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            }}>{cat}</button>
          ))}
        </div>

        {/* 액션 바 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{printTitle}</span>
          {filtered.length > 0 && <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{filtered.length}개 상품</span>}
          <div style={{ flex: 1 }}/>
          <button onClick={() => { loadCache(); fetchFresh() }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>
            <RefreshCw size={12}/> 새로고침
          </button>
          <button onClick={handlePrint} disabled={filtered.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', border: 'none', borderRadius: 7, background: filtered.length === 0 ? '#94a3b8' : '#2563eb', color: '#fff', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}>
            <Printer size={12}/> 인쇄
          </button>
        </div>

        {/* 스크롤 테이블 */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading && products.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>데이터를 불러오는 중...</div>
          ) : !selectedCat ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>카테고리를 선택하세요.</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>해당 카테고리에 등록된 상품이 없습니다.</div>
          ) : (
            <div style={{ border: '1px solid #bfdbfe', borderRadius: 10, background: '#fff' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 460 }}>
                <colgroup>
                  <col style={{ width: 88 }}/><col style={{ width: 56 }}/><col style={{ width: 78 }}/>
                  <col style={{ width: 68 }}/><col style={{ width: 110 }}/><col/>
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <td colSpan={6} style={{ border: '1px solid #bfdbfe', padding: '5px 8px', fontSize: 13, fontWeight: 800, background: '#f0f9ff', color: '#1e3a5f' }}>
                      {printTitle}
                    </td>
                  </tr>
                  <tr>
                    {COL_HEADERS.map(h => (
                      <th key={h} style={{ border: '1px solid #93c5fd', padding: '4px 5px', fontSize: 11, fontWeight: 700, background: '#bde0f5', textAlign: 'center', color: '#1e3a5f' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{renderRows()}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 세로 구분선 */}
      <div style={{ width: 1, background: '#e2e8f0', flexShrink: 0 }}/>

      {/* ══════════════════════════════════════════
          오른쪽: 로케이션 현황
      ══════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', paddingLeft: 10 }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>로케이션 현황</span>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            {Object.keys(locaMap).length}개 로케이션 사용 중
          </span>
          <div style={{ flex: 1 }}/>
          <button onClick={() => setShowAddForm(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: '1.5px solid #2563eb', borderRadius: 7, background: showAddForm ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
            <Plus size={12}/> 로케이션 추가
          </button>
        </div>

        {/* 로케이션 추가 폼 */}
        {showAddForm && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0, alignItems: 'center', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', flexShrink: 0 }}>새 로케이션</span>
            <input value={newLocaInput} onChange={e => setNewLocaInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addCustomLoca()}
              placeholder="예: ZA-01"
              autoFocus
              style={{ flex: 1, fontSize: 12, border: '1.5px solid #93c5fd', borderRadius: 6, padding: '4px 8px', outline: 'none', color: '#1e293b' }}/>
            <button onClick={addCustomLoca}
              style={{ padding: '4px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>추가</button>
            <button onClick={() => { setShowAddForm(false); setNewLocaInput('') }}
              style={{ padding: '4px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          </div>
        )}

        {/* 스크롤 그리드 */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>

          {/* Zone A ~ F */}
          {(['A','B','C','D','E','F'] as const).map((f, fi) => {
            const zoneColors: [string, string][] = [
              ['#1e3a5f','#e0f2fe'], ['#14532d','#f0fdf4'], ['#3b0764','#f5f3ff'],
              ['#7c2d12','#fff7ed'], ['#1e3a5f','#f0f9ff'], ['#713f12','#fefce8'],
            ]
            const [labelColor, headerBg] = zoneColors[fi]
            return (
              <ZoneSection key={f}
                zoneKey={f}
                label={`Zone ${f}   (${f}A ~ ${f}D · 01~05)`}
                labelColor={labelColor}
                headerBg={headerBg}
                groups={PRESET_GROUPS.filter(g => g.prefix[0] === f && g.prefix.length === 2)}
              />
            )
          })}

          {/* Zone 1 */}
          <ZoneSection
            zoneKey="1"
            label="Zone 1   (1A ~ 1K · 01~06)"
            labelColor="#3b0764"
            headerBg="#f5f3ff"
            groups={PRESET_GROUPS.filter(g => g.prefix[0] === '1')}
          />

          {/* Zone 2 */}
          <ZoneSection
            zoneKey="2"
            label="Zone 2   (2A ~ 2E · 01~07)"
            labelColor="#14532d"
            headerBg="#f0fdf4"
            groups={PRESET_GROUPS.filter(g => g.prefix[0] === '2')}
          />

          {/* 추가 로케이션 */}
          {customLocas.length > 0 && (
            <ZoneSection
              zoneKey="custom"
              label={`추가 로케이션 (${customLocas.length}개)`}
              labelColor="#92400e"
              headerBg="#fef3c7"
              groups={[{ prefix: '추가', items: customLocas }]}
              isCustom
            />
          )}

          {/* 미분류 */}
          {unmatchedProducts.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <button onClick={() => toggleZone('unmatched')} style={{
                display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                background: '#fff1f2', border: 'none', borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer', marginBottom: (expanded['unmatched'] ?? false) ? 5 : 0,
              }}>
                {(expanded['unmatched'] ?? false) ? <ChevronDown size={11} color="#991b1b"/> : <ChevronRight size={11} color="#991b1b"/>}
                <span style={{ fontSize: 11, fontWeight: 800, color: '#991b1b' }}>미분류 로케이션 ({unmatchedProducts.length}개 상품)</span>
              </button>
              {(expanded['unmatched'] ?? false) && (
                <div style={{ paddingLeft: 2, display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {unmatchedProducts.map(p => (
                    <div key={p.id} style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#991b1b' }}>
                      {p.code} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({p.loca})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── 인쇄 전용 숨김 영역 ── */}
      <div ref={printAreaRef} style={{ display: 'none' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif' }}>
          <colgroup>
            <col style={{ width: '15%' }}/><col style={{ width: '10%' }}/><col style={{ width: '12%' }}/>
            <col style={{ width: '10%' }}/><col style={{ width: '19%' }}/><col/>
          </colgroup>
          <thead>
            <tr>
              <td colSpan={6} style={{ border: '1px solid #000', padding: '3pt 5pt', fontSize: '11pt', fontWeight: 800 }}>{printTitle}</td>
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
