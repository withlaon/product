'use client'
import { useState } from 'react'
import { Send, RefreshCw, CheckCircle2, XCircle, Clock, Store, Package } from 'lucide-react'

const CHANNELS = [
  { id: 'coupang',    name: '쿠팡',      domain: 'coupang.com' },
  { id: 'naver',      name: '스마트스토어', domain: 'smartstore.naver.com' },
  { id: 'gmarket',    name: 'G마켓',      domain: 'gmarket.co.kr' },
  { id: 'auction',    name: '옥션',       domain: 'auction.co.kr' },
  { id: '11st',       name: '11번가',     domain: '11st.co.kr' },
  { id: 'kakao',      name: '카카오',     domain: 'store.kakao.com' },
  { id: 'wemakeprice',name: '위메프',     domain: 'wemakeprice.com' },
]

type TransferStatus = 'idle' | 'sending' | 'success' | 'error'

interface TransferRecord {
  id: string
  channel: string
  product_name: string
  status: TransferStatus
  sent_at: string
  message?: string
}

function ChannelLogo({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false)
  if (err) return <span style={{ fontSize: 18 }}>🛒</span>
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={name}
      width={20} height={20}
      style={{ borderRadius: 4, objectFit: 'contain' }}
      onError={() => setErr(true)}
    />
  )
}

const statusStyle: Record<TransferStatus, { bg: string; color: string; label: string }> = {
  idle:    { bg: '#f1f5f9', color: '#64748b', label: '대기' },
  sending: { bg: '#fef9c3', color: '#ca8a04', label: '전송중' },
  success: { bg: '#dcfce7', color: '#15803d', label: '완료' },
  error:   { bg: '#fee2e2', color: '#dc2626', label: '오류' },
}

export default function ProductTransferPage() {
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [records, setRecords] = useState<TransferRecord[]>([])

  const toggleChannel = (id: string) =>
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )

  return (
    <div className="pm-content">
      {/* KPI */}
      <div className="pm-kpi-grid">
        {[
          { label: '전체 전송', value: records.length, color: '#2563eb', bg: '#eff6ff' },
          { label: '완료', value: records.filter(r => r.status === 'success').length, color: '#16a34a', bg: '#f0fdf4' },
          { label: '오류', value: records.filter(r => r.status === 'error').length,   color: '#dc2626', bg: '#fef2f2' },
          { label: '전송중', value: records.filter(r => r.status === 'sending').length, color: '#d97706', bg: '#fffbeb' },
        ].map(k => (
          <div key={k.label} className="pm-kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
            <p className="pm-kpi-label">{k.label}</p>
            <p className="pm-kpi-value" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 채널 선택 */}
      <div className="pm-card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 14 }}>
          📡 전송 채널 선택
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {CHANNELS.map(ch => {
            const active = selectedChannels.includes(ch.id)
            return (
              <button
                key={ch.id}
                onClick={() => toggleChannel(ch.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                  border: active ? '2px solid #2563eb' : '2px solid #e2e8f0',
                  background: active ? '#eff6ff' : '#f8fafc',
                  fontWeight: 700, fontSize: 13, color: active ? '#2563eb' : '#64748b',
                  transition: 'all 0.18s',
                }}
              >
                <ChannelLogo domain={ch.domain} name={ch.name} />
                {ch.name}
                {active && <CheckCircle2 size={14} color="#2563eb" />}
              </button>
            )
          })}
        </div>
        {selectedChannels.length > 0 && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
            ✅ {selectedChannels.length}개 채널 선택됨
          </p>
        )}
      </div>

      {/* 전송 내역 테이블 */}
      <div className="pm-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>
            📋 전송 내역
          </p>
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              background: selectedChannels.length === 0 ? '#f1f5f9' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
              color: selectedChannels.length === 0 ? '#94a3b8' : '#fff',
              border: 'none', fontSize: 13, fontWeight: 700,
            }}
            disabled={selectedChannels.length === 0}
          >
            <Send size={13} />
            상품 전송
          </button>
        </div>

        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Send size={40} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 14, fontWeight: 700 }}>전송 내역이 없습니다</p>
              <p style={{ fontSize: 12 }}>채널을 선택 후 상품을 전송하면 내역이 표시됩니다</p>
            </div>
          </div>
        ) : (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>채널</th>
                  <th>상품명</th>
                  <th>전송일시</th>
                  <th>상태</th>
                  <th>메시지</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const st = statusStyle[r.status]
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.channel}</td>
                      <td>{r.product_name}</td>
                      <td style={{ fontSize: 12, color: '#94a3b8' }}>{r.sent_at}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 800,
                          background: st.bg, color: st.color,
                          padding: '3px 10px', borderRadius: 99,
                        }}>
                          {r.status === 'sending' && <RefreshCw size={10} />}
                          {r.status === 'success' && <CheckCircle2 size={10} />}
                          {r.status === 'error'   && <XCircle size={10} />}
                          {r.status === 'idle'    && <Clock size={10} />}
                          {st.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{r.message || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
