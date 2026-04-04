/**
 * 마켓플레이스 레지스트리
 * 모든 쇼핑몰 커넥터를 등록하고 팩토리 함수를 제공합니다.
 */

import type { IMarketplaceAdapter, Credentials } from '@/adapters/marketplace.adapter'
import { SmartstoreConnector  } from './smartstore/smartstore.connector'
import { CoupangConnector     } from './coupang/coupang.connector'
import { ElevenStConnector    } from './11st/11st.connector'
import { GmarketConnector     } from './gmarket/gmarket.connector'
import { AuctionConnector     } from './auction/auction.connector'
import { Cafe24Connector      } from './cafe24/cafe24.connector'
import { ZigzagConnector      } from './zigzag/zigzag.connector'
import { AblyConnector        } from './ably/ably.connector'
import { AlwaysConnector      } from './always/always.connector'
import { TossshoppingConnector} from './tosshopping/tosshopping.connector'
import { LotteonConnector     } from './lotteon/lotteon.connector'
import { SsgConnector         } from './ssg/ssg.connector'
import { HalfclubConnector    } from './halfclub/halfclub.connector'
import { FashionplusConnector } from './fashionplus/fashionplus.connector'
import { GsshopConnector      } from './gsshop/gsshop.connector'

/* ─── 지원 쇼핑몰 목록 ──────────────────────────────────────────── */
export const MARKETPLACE_LIST = [
  { key: 'smartstore',   name: '스마트스토어',  auth: ['api_key', 'api_secret'] },
  { key: 'coupang',      name: '쿠팡',          auth: ['seller_id', 'api_key', 'api_secret'] },
  { key: '11st',         name: '11번가',         auth: ['api_key'] },
  { key: 'gmarket',      name: 'G마켓',          auth: ['api_key'] },
  { key: 'auction',      name: '옥션',           auth: ['api_key'] },
  { key: 'cafe24',       name: 'Cafe24',         auth: ['mall_id', 'access_token'] },
  { key: 'zigzag',       name: '지그재그',       auth: ['api_key'] },
  { key: 'ably',         name: '에이블리',       auth: ['api_key'] },
  { key: 'always',       name: '올웨이즈',       auth: ['api_key'] },
  { key: 'tosshopping',  name: '토스쇼핑',       auth: ['api_key'] },
  { key: 'lotteon',      name: '롯데온',         auth: ['api_key'] },
  { key: 'ssg',          name: 'SSG닷컴',        auth: ['api_key'] },
  { key: 'halfclub',     name: '하프클럽',       auth: ['api_key', 'trader_code'] },
  { key: 'fashionplus',  name: '패션플러스',     auth: ['api_key', 'login_id', 'login_pw'] },
  { key: 'gsshop',       name: '지에스샵',       auth: ['api_key', 'seller_id'] },
] as const

export type MarketplaceKey = typeof MARKETPLACE_LIST[number]['key']

/* ─── 커넥터 팩토리 ─────────────────────────────────────────────── */
type ConnectorConstructor = new () => IMarketplaceAdapter

const CONNECTOR_MAP: Record<string, ConnectorConstructor> = {
  smartstore  : SmartstoreConnector,
  naver       : SmartstoreConnector,  // alias
  coupang     : CoupangConnector,
  '11st'      : ElevenStConnector,
  gmarket     : GmarketConnector,
  auction     : AuctionConnector,
  cafe24      : Cafe24Connector,
  zigzag      : ZigzagConnector,
  ably        : AblyConnector,
  ablly       : AblyConnector,        // 오타 호환 alias
  always      : AlwaysConnector,
  alwayz      : AlwaysConnector,      // localStorage 키 호환 alias
  tosshopping : TossshoppingConnector,
  toss        : TossshoppingConnector, // localStorage 키 호환 alias
  lotteon     : LotteonConnector,
  ssg         : SsgConnector,
  halfclub    : HalfclubConnector,
  fashionplus : FashionplusConnector,
  gsshop      : GsshopConnector,
}

/**
 * 쇼핑몰 키로 어댑터 인스턴스 생성
 * credentials를 전달하면 connect()까지 자동 호출
 */
export function createAdapter(mallKey: string, credentials?: Credentials): IMarketplaceAdapter {
  const Connector = CONNECTOR_MAP[mallKey]
  if (!Connector) throw new Error(`지원하지 않는 쇼핑몰: ${mallKey}`)
  const adapter = new Connector()
  if (credentials) adapter.connect(credentials)
  return adapter
}

/** 지원하는 모든 쇼핑몰 키 목록 */
export function getSupportedMalls(): string[] {
  return Object.keys(CONNECTOR_MAP)
}

/** 쇼핑몰 키로 쇼핑몰 정보 조회 */
export function getMallInfo(mallKey: string) {
  return MARKETPLACE_LIST.find(m => m.key === mallKey) || null
}
