'use client'
import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Truck, X, CheckCircle2, Package } from 'lucide-react'

/* ── 열 인덱스 (0-based, A=0)
   B=1  F=5  G=6  I=8  L=11  Q=16  R=17  T=19  V=21 ── */
const COL = { B:1, F:5, G:6, I:8, L:11, Q:16, R:17, T:19, V:21 } as const

/** 옵션명에서 FREE 제거: "블랙, free" → "블랙" */
function cleanOption(raw: string): string {
  return raw
    .replace(/,?\s*FREE\s*/gi, '')  // ", FREE" / ", free" 등 제거 (대소문자 무관)
    .replace(/,\s*$/, '')           // 남은 trailing 쉼표 제거
    .trim()
}

/* ── 주문 1건 타입 ── */
interface TossOrder {
  excelR:      number  // XLSX encode_cell 용 0-indexed row (A1 기준)
  orderNum:    string  // B열: 주문번호
  productName: string  // I열: 상품명
  optionName:  string  // L열: 옵션명
  phone:       string  // Q열: 전화번호
  recipient:   string  // R열: 수취인명
  address:     string  // T열: 주소
  request:     string  // V열: 배송요청사항
}

export default function TossShippingPage() {
  const [orders,       setOrders]       = useState<TossOrder[]>([])
  const [trackingMap,  setTrackingMap]  = useState<Record<string, string>>({})
  const [originalFile, setOriginalFile] = useState<ArrayBuffer | null>(null)
  const [fileName,     setFileName]     = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── 파일 파싱 ── */
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const ab = ev.target?.result as ArrayBuffer
        setOriginalFile(ab)

        const wb    = XLSX.read(ab, { type: 'array' })
        const ws    = wb.Sheets[wb.SheetNames[0]]
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

        // encode_cell로 각 행·열을 직접 읽어 sheet_to_json 인덱스 오프셋 문제 방지
        const getCell = (r: number, c: number): string => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          return cell ? String(cell.v ?? '').trim() : ''
        }

        const parsed: TossOrder[] = []
        for (let r = range.s.r; r <= range.e.r; r++) {
          const orderNum = getCell(r, COL.B)
          // B열이 6자리 이상 숫자인 행만 데이터로 인식
          if (!orderNum || !/^\d{6,}$/.test(orderNum)) continue
          parsed.push({
            excelR:      r,               // encode_cell 전달용 0-indexed row
            orderNum,
            productName: getCell(r, COL.I),                  // I열: 상품명
            optionName:  cleanOption(getCell(r, COL.L)),   // L열: 옵션명 (FREE 제거)
            phone:       getCell(r, COL.Q),  // Q열: 전화번호
            recipient:   getCell(r, COL.R),  // R열: 수취인명
            address:     getCell(r, COL.T),  // T열: 주소
            request:     getCell(r, COL.V),  // V열: 배송요청사항
          })
        }

        setOrders(parsed)
        setTrackingMap({})
      } catch (err) {
        console.error(err)
        alert('파일 파싱 오류가 발생했습니다. 토스쇼핑 주문서 파일(.xlsx)인지 확인해 주세요.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  /* ── 엑셀 다운로드 ── */
  const handleDownload = useCallback(() => {
    if (!originalFile || !orders.length) return

    // 원본 파일 구조 그대로 유지하고 F열·G열만 수정
    const wb = XLSX.read(originalFile, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]

    for (const order of orders) {
      // encode_cell로 정확한 행·열 위치에 기록 (F열=5, G열=6)
      ws[XLSX.utils.encode_cell({ r: order.excelR, c: COL.F })] = { t: 's', v: 'CJ대한통운' }
      ws[XLSX.utils.encode_cell({ r: order.excelR, c: COL.G })] = { t: 's', v: trackingMap[order.orderNum] || '' }
    }

    const out  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const base = fileName.replace(/\.[^.]+$/, '')
    a.download = `${base}_송장입력.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }, [originalFile, orders, trackingMap, fileName])

  /* ── 초기화 ── */
  const handleReset = useCallback(() => {
    setOrders([]); setTrackingMap({}); setOriginalFile(null); setFileName('')
  }, [])

  const filledCount = orders.filter(o => trackingMap[o.orderNum]).length
  const totalCount  = orders.length

  /* ── 렌더 ── */
  return (
    <div className="pm-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Truck size={18} style={{ color: '#4f46e5' }}/>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>토스쇼핑 송장입력</h1>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>주문배송관리 파일 업로드 → 송장번호 입력 → 파일 다운로드</p>
          </div>
        </div>
        {orders.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 14px', cursor: 'pointer' }}>
              <Upload size={12}/>파일 교체
            </button>
            <button onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 800, color: 'white', background: '#4f46e5', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
              <Download size={13}/>송장입력파일 다운로드 ({filledCount}/{totalCount})
            </button>
          </div>
        )}
      </div>

      {/* KPI 배지 (파일 로드 후) */}
      {orders.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { label: '전체 주문', value: totalCount, color: '#1e293b', bg: '#f8fafc' },
            { label: '송장 입력', value: filledCount, color: '#059669', bg: '#f0fdf4' },
            { label: '미입력',    value: totalCount - filledCount, color: totalCount - filledCount > 0 ? '#d97706' : '#94a3b8', bg: totalCount - filledCount > 0 ? '#fffbeb' : '#f8fafc' },
          ].map(c => (
            <div key={c.label} className="pm-card" style={{ padding: '8px 16px', background: c.bg, minWidth: 110 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 2 }}>{c.label}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</p>
            </div>
          ))}
          <div className="pm-card" style={{ padding: '8px 16px', background: '#eef2ff', minWidth: 130 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 2 }}>택배사</p>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#4f46e5', lineHeight: 1.4 }}>CJ대한통운</p>
          </div>
        </div>
      )}

      {/* 파일 업로드 영역 (파일 없을 때) */}
      {orders.length === 0 && (
        <div className="pm-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
          <Package size={56} style={{ color: '#a5b4fc', opacity: 0.6 }}/>
          <div>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>토스쇼핑 주문서 파일을 업로드하세요</p>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              토스쇼핑 &gt; 주문배송관리 &gt; 상품준비중 &gt; Excel 다운로드<br/>
              파일 형식: <strong>.xlsx</strong> · 데이터 행: 5행부터
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile}/>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#4f46e5', background: '#eef2ff', border: '2px dashed #a5b4fc', borderRadius: 12, padding: '14px 28px', cursor: 'pointer' }}>
            <Upload size={16}/>파일 선택
          </button>
          <p style={{ fontSize: 11, color: '#cbd5e1' }}>B=주문번호 · I=상품명 · L=옵션명 · Q=전화번호 · R=수취인 · T=주소 · V=배송요청</p>
        </div>
      )}

      {/* 주문 테이블 */}
      {orders.length > 0 && (
        <div className="pm-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {/* 테이블 헤더 바 */}
          <div style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>주문 목록</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{fileName}</span>
            <button onClick={handleReset}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fff1f2', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
              <X size={10}/>초기화
            </button>
          </div>

          {/* 테이블 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                  {[
                    { label: '#',                          w: 34  },
                    { label: '주문번호',                   w: 105 },
                    { label: '상품명',                     w: 170 },
                    { label: '옵션',                       w: 90  },
                    { label: '수취인',                     w: 72  },
                    { label: '전화번호',                   w: 105 },
                    { label: '주소',                       w: 200 },
                    { label: '배송요청',                   w: 130 },
                    { label: '송장번호 입력 (CJ대한통운)', w: 155 },
                  ].map(h => (
                    <th key={h.label} style={{ padding: '6px 8px', fontWeight: 800, color: '#64748b', fontSize: 10.5, textAlign: 'left', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', minWidth: h.w }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => {
                  const tracking = trackingMap[order.orderNum] || ''
                  const filled   = !!tracking
                  return (
                    <tr key={order.orderNum}
                      style={{ borderBottom: '1px solid #f8fafc', background: filled ? '#f0fdf4' : 'white', transition: 'background 0.1s' }}>
                      <td style={{ padding: '5px 8px', color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 900, color: '#0f172a', fontSize: 11, whiteSpace: 'nowrap' }}>{order.orderNum}</td>
                      <td style={{ padding: '5px 8px', color: '#334155', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.productName}>
                        {order.productName}
                      </td>
                      <td style={{ padding: '5px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{order.optionName}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{order.recipient}</td>
                      <td style={{ padding: '5px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{order.phone}</td>
                      <td style={{ padding: '5px 8px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.address}>
                        {order.address}
                      </td>
                      <td style={{ padding: '5px 8px', color: '#64748b', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.request}>
                        {order.request || <span style={{ color: '#cbd5e1' }}>-</span>}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="text"
                            value={tracking}
                            onChange={e => setTrackingMap(prev => ({ ...prev, [order.orderNum]: e.target.value }))}
                            placeholder="송장번호"
                            style={{
                              flex: 1,
                              border: `1.5px solid ${filled ? '#86efac' : '#e2e8f0'}`,
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 12,
                              fontWeight: filled ? 800 : 400,
                              color: filled ? '#15803d' : '#475569',
                              outline: 'none',
                              background: filled ? '#f0fdf4' : 'white',
                            }}
                          />
                          {filled && <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }}/>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 하단 다운로드 바 */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <strong style={{ color: '#059669' }}>{filledCount}건</strong> 송장 입력됨
              {totalCount - filledCount > 0 && (
                <span style={{ color: '#d97706', marginLeft: 8 }}>· 미입력 {totalCount - filledCount}건</span>
              )}
              <span style={{ color: '#94a3b8', marginLeft: 8 }}>· 택배사: CJ대한통운 (F열 자동입력)</span>
            </span>
            <button onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'white', background: '#4f46e5', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' }}>
              <Download size={13}/>송장입력파일 다운로드
            </button>
          </div>
        </div>
      )}

      {/* 숨김 파일 input */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile}/>
    </div>
  )
}
