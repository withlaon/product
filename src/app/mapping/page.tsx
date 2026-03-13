'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, RefreshCw, Link2, Trash2, CheckCircle2, AlertCircle, FileSpreadsheet, X, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'

const CHANNEL_STORAGE_KEY = 'pm_mall_channels_v3'

interface MappedRow {
  mall_product_id: string
  mall_product_name: string
  mall_option: string
  matched_product_id: string | null
  matched_product_name: string | null
  matched_option: string | null
  matched_barcode: string | null
  status: 'matched' | 'unmatched' | 'conflict'
}

interface PmOption {
  name: string
  chinese_name?: string
  barcode: string
}
interface PmProduct {
  id: string
  code: string
  name: string
  category: string
  options: PmOption[]
}

const MAPPING_KEY = 'pm_channel_mappings_v1'

function loadMappings(): Record<string, MappedRow[]> {
  try {
    const raw = localStorage.getItem(MAPPING_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function saveMappings(data: Record<string, MappedRow[]>) {
  localStorage.setItem(MAPPING_KEY, JSON.stringify(data))
}

export default function MappingPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [connectedMalls, setConnectedMalls] = useState<{ key: string; name: string }[]>([])
  const [selectedMall, setSelectedMall] = useState('')
  const [products, setProducts] = useState<PmProduct[]>([])
  const [mappings, setMappings] = useState<Record<string, MappedRow[]>>({})
  const [importing, setImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 수동 매핑 모달
  const [manualTarget, setManualTarget] = useState<MappedRow | null>(null)
  const [manualTargetIdx, setManualTargetIdx] = useState<number>(-1)
  const [manualSearch, setManualSearch] = useState('')
  const [manualSelProduct, setManualSelProduct] = useState('')
  const [manualSelOption, setManualSelOption] = useState('')

  useEffect(() => {
    // 연동된 쇼핑몰 로드
    try {
      const raw = localStorage.getItem(CHANNEL_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const connected = Object.entries(parsed)
          .filter(([, v]: [string, unknown]) => (v as { connected?: boolean }).connected)
          .map(([key, v]: [string, unknown]) => ({ key, name: (v as { name?: string }).name || key }))
        setConnectedMalls(connected)
        if (connected.length > 0 && !selectedMall) setSelectedMall(connected[0].key)
      }
    } catch { /* empty */ }

    // 상품 로드
    supabase.from('pm_products').select('id,code,name,category,options').then(({ data }) => {
      if (data) setProducts(data as PmProduct[])
    })

    setMappings(loadMappings())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentRows = (mappings[selectedMall] || []).filter(row => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return row.mall_product_name.toLowerCase().includes(q) || row.mall_option.toLowerCase().includes(q)
  })

  const stats = {
    total: (mappings[selectedMall] || []).length,
    matched: (mappings[selectedMall] || []).filter(r => r.status === 'matched').length,
    unmatched: (mappings[selectedMall] || []).filter(r => r.status === 'unmatched').length,
  }

  // 자동 매핑 로직 (바코드 or 상품명+옵션명 매칭)
  function autoMatch(mallName: string, mallOption: string): { pid: string; pname: string; oname: string; barcode: string } | null {
    for (const p of products) {
      for (const o of p.options) {
        const bc = o.barcode?.toLowerCase() || ''
        // 바코드 매칭
        if (bc && mallOption.toLowerCase().includes(bc)) {
          return { pid: p.id, pname: p.name, oname: o.name, barcode: o.barcode }
        }
        // 상품코드 매칭
        if (p.code && mallName.toLowerCase().includes(p.code.toLowerCase())) {
          if (o.name && mallOption.toLowerCase().includes(o.name.toLowerCase())) {
            return { pid: p.id, pname: p.name, oname: o.name, barcode: o.barcode }
          }
        }
      }
    }
    return null
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedMall) return
    setImporting(true)
    try {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 첫 행은 헤더 - 상품ID, 상품명, 옵션명 컬럼 찾기
      const header = (rows[0] || []).map(h => String(h).trim().toLowerCase())
      const idxId   = header.findIndex(h => h.includes('id') || h.includes('번호') || h.includes('코드'))
      const idxName = header.findIndex(h => h.includes('상품명') || h.includes('name'))
      const idxOpt  = header.findIndex(h => h.includes('옵션') || h.includes('option'))

      const newRows: MappedRow[] = rows.slice(1).filter(r => r.some(c => c !== '')).map(r => {
        const mallId   = idxId   >= 0 ? String(r[idxId]).trim()   : ''
        const mallName = idxName >= 0 ? String(r[idxName]).trim() : String(r[0]).trim()
        const mallOpt  = idxOpt  >= 0 ? String(r[idxOpt]).trim()  : String(r[1] ?? '').trim()
        const match = autoMatch(mallName, mallOpt)
        return {
          mall_product_id: mallId,
          mall_product_name: mallName,
          mall_option: mallOpt,
          matched_product_id: match?.pid || null,
          matched_product_name: match?.pname || null,
          matched_option: match?.oname || null,
          matched_barcode: match?.barcode || null,
          status: match ? 'matched' : 'unmatched',
        }
      })

      const updated = { ...mappings, [selectedMall]: newRows }
      setMappings(updated)
      saveMappings(updated)
    } catch (err) {
      console.error('엑셀 파싱 오류:', err)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const openManual = (row: MappedRow, idx: number) => {
    setManualTarget(row)
    setManualTargetIdx(idx)
    setManualSearch('')
    setManualSelProduct('')
    setManualSelOption('')
  }

  const handleManualSave = () => {
    if (!manualTarget || manualTargetIdx < 0 || !manualSelProduct) return
    const prod = products.find(p => p.id === manualSelProduct)
    const opt = prod?.options.find(o => o.name === manualSelOption)
    const rows = [...(mappings[selectedMall] || [])]
    rows[manualTargetIdx] = {
      ...rows[manualTargetIdx],
      matched_product_id: prod?.id || null,
      matched_product_name: prod?.name || null,
      matched_option: opt?.name || null,
      matched_barcode: opt?.barcode || null,
      status: prod ? 'matched' : 'unmatched',
    }
    const updated = { ...mappings, [selectedMall]: rows }
    setMappings(updated)
    saveMappings(updated)
    setManualTarget(null)
  }

  const handleDeleteRow = (idx: number) => {
    const rows = [...(mappings[selectedMall] || [])]
    rows.splice(idx, 1)
    const updated = { ...mappings, [selectedMall]: rows }
    setMappings(updated)
    saveMappings(updated)
  }

  const handleClearAll = () => {
    if (!confirm('현재 쇼핑몰의 매핑 데이터를 모두 삭제하시겠습니까?')) return
    const updated = { ...mappings }
    delete updated[selectedMall]
    setMappings(updated)
    saveMappings(updated)
  }

  const manualFiltered = products.filter(p => {
    if (!manualSearch) return true
    const q = manualSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: '전체 매핑 항목', value: stats.total, bg: '#eff6ff', color: '#2563eb' },
          { label: '매핑 완료', value: stats.matched, bg: '#ecfdf5', color: '#059669' },
          { label: '미매핑', value: stats.unmatched, bg: '#fff1f2', color: '#be123c' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, borderRadius: 14, padding: '16px 20px', border: `1.5px solid ${k.color}22` }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 컨트롤 바 */}
      <div style={{ background: 'white', borderRadius: 16, padding: '16px 20px', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 쇼핑몰 선택 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>쇼핑몰 선택</span>
            {connectedMalls.length === 0 ? (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>연동된 쇼핑몰이 없습니다</span>
            ) : (
              <select
                value={selectedMall}
                onChange={e => setSelectedMall(e.target.value)}
                style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', cursor: 'pointer' }}
              >
                {connectedMalls.map(m => (
                  <option key={m.key} value={m.key}>{m.name}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* 검색 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '6px 12px' }}>
            <Search size={13} color="#94a3b8" />
            <input
              placeholder="상품명 또는 옵션명 검색"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#334155', width: 180 }}
            />
          </div>

          {/* 엑셀 업로드 */}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <button
            onClick={() => selectedMall ? fileRef.current?.click() : alert('쇼핑몰을 먼저 선택해주세요')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
          >
            {importing ? <RefreshCw size={13} style={{ animation: 'spin-slow 0.7s linear infinite' }} /> : <Upload size={13} />}
            엑셀 업로드
          </button>

          {(mappings[selectedMall]?.length || 0) > 0 && (
            <button
              onClick={handleClearAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff1f2', color: '#be123c', border: '1.5px solid #fecdd3', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
            >
              <Trash2 size={13} />
              전체 삭제
            </button>
          )}
        </div>

        {/* 엑셀 형식 안내 */}
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#0369a1' }}>
            📋 엑셀 형식 안내: 첫 행은 헤더로 <strong>상품ID/번호/코드</strong>, <strong>상품명</strong>, <strong>옵션명</strong> 컬럼을 포함해주세요.
            바코드 또는 상품코드+옵션명으로 자동 매핑됩니다.
          </p>
        </div>
      </div>

      {/* 매핑 테이블 */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {currentRows.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileSpreadsheet size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: '#94a3b8' }}>매핑 데이터가 없습니다</p>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
              {connectedMalls.length === 0 ? '먼저 쇼핑몰을 연동해주세요' : '엑셀 파일을 업로드하면 자동으로 매핑됩니다'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#', '쇼핑몰 상품ID', '쇼핑몰 상품명', '쇼핑몰 옵션', '매핑 상품명', '매핑 옵션', '바코드', '상태', '관리'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{row.mall_product_id || '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#1e293b', maxWidth: 180 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mall_product_name}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{row.mall_option || '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: row.matched_product_name ? '#1e293b' : '#cbd5e1' }}>
                      {row.matched_product_name || <span style={{ color: '#cbd5e1' }}>미매핑</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: row.matched_option ? '#64748b' : '#cbd5e1' }}>
                      {row.matched_option || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11.5, fontFamily: 'monospace', color: '#334155' }}>
                      {row.matched_barcode || '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {row.status === 'matched' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#059669', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                          <CheckCircle2 size={11} />매핑완료
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff1f2', color: '#be123c', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                          <AlertCircle size={11} />미매핑
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          onClick={() => openManual(row, idx)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                        >
                          <Link2 size={11} />수동매핑
                        </button>
                        <button
                          onClick={() => handleDeleteRow(idx)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 수동 매핑 모달 */}
      <Modal isOpen={!!manualTarget} onClose={() => setManualTarget(null)} title="수동 매핑" size="md">
        {manualTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 쇼핑몰 상품 정보 */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>쇼핑몰 상품</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{manualTarget.mall_product_name}</p>
              {manualTarget.mall_option && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>옵션: {manualTarget.mall_option}</p>}
            </div>

            {/* 상품 검색 */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>매핑할 상품 검색</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', marginBottom: 8 }}>
                <Search size={13} color="#94a3b8" />
                <input
                  placeholder="상품명 또는 코드 검색"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#334155', flex: 1 }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: 8 }}>
                {manualFiltered.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>검색 결과 없음</div>
                ) : manualFiltered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setManualSelProduct(p.id); setManualSelOption('') }}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                      background: manualSelProduct === p.id ? '#eff6ff' : 'transparent',
                    }}
                    onMouseEnter={e => { if (manualSelProduct !== p.id) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (manualSelProduct !== p.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{p.code}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 옵션 선택 */}
            {manualSelProduct && (() => {
              const prod = products.find(p => p.id === manualSelProduct)
              if (!prod || prod.options.length === 0) return null
              return (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>옵션 선택</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {prod.options.map((o, i) => (
                      <button
                        key={i}
                        onClick={() => setManualSelOption(o.name)}
                        style={{
                          padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: '1.5px solid',
                          borderColor: manualSelOption === o.name ? '#2563eb' : '#e2e8f0',
                          background: manualSelOption === o.name ? '#eff6ff' : 'white',
                          color: manualSelOption === o.name ? '#2563eb' : '#64748b',
                        }}
                      >{o.name}</button>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setManualTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                취소
              </button>
              <button
                onClick={handleManualSave}
                disabled={!manualSelProduct}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: manualSelProduct ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#e2e8f0', color: manualSelProduct ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: manualSelProduct ? 'pointer' : 'not-allowed' }}
              >
                매핑 저장
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
