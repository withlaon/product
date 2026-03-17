/**
 * proxy-fetch.ts
 *
 * Fixie(고정 IP 프록시) 지원 fetch 유틸리티
 *
 * FIXIE_URL 환경변수가 설정되어 있으면 모든 외부 API 호출이
 * Fixie 프록시를 통해 고정 IP에서 발신됩니다.
 *
 * 미설정 시 기본 fetch를 그대로 사용 (개발 환경 호환)
 */

let _agent: unknown = null
let _agentInit = false

function getAgent() {
  if (_agentInit) return _agent
  _agentInit = true

  const fixieUrl = process.env.FIXIE_URL
  if (!fixieUrl) return null

  try {
    // undici는 Node.js 18+에 내장됨 (Next.js 서버사이드 런타임)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require('undici') as typeof import('undici')
    _agent = new ProxyAgent(fixieUrl)
  } catch {
    console.warn('[proxy-fetch] undici ProxyAgent 초기화 실패 — 기본 fetch 사용')
  }
  return _agent
}

/**
 * Fixie 프록시를 통한 fetch
 * - FIXIE_URL 환경변수 있으면 → 고정 IP(Fixie)로 발신
 * - 없으면 → 기본 fetch (개발 환경)
 */
export async function proxyFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const agent = getAgent()

  if (agent) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { fetch: undiciFetch } = require('undici') as typeof import('undici')
      return undiciFetch(url as string, {
        ...(init as object),
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1]) as unknown as Response
    } catch {
      // undici fetch 실패 시 기본 fetch로 폴백
    }
  }

  return fetch(url as string, init)
}

/** 현재 서버의 공인 IP 반환 (Fixie 경유 시 Fixie 고정 IP) */
export async function getServerIp(): Promise<string> {
  const res  = await proxyFetch('https://api.ipify.org?format=json', {
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json() as { ip: string }
  return data.ip
}
