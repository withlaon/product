/**
 * CS(클레임/취소/반품/교환) 서비스 레이어
 */

import { createAdapter } from '@/marketplaces'
import type { Credentials, UnifiedClaim, ClaimQueryParams } from '@/adapters/marketplace.adapter'

export class CsService {
  /**
   * 단일 쇼핑몰 클레임 수집
   */
  static async collectClaims(
    mallKey    : string,
    credentials: Credentials,
    params     : ClaimQueryParams,
  ): Promise<{ success: boolean; mall: string; claims: UnifiedClaim[]; count: number; error?: string }> {
    try {
      const adapter = createAdapter(mallKey, credentials)
      const claims  = await adapter.getClaims(params)
      return { success: true, mall: mallKey, claims, count: claims.length }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, mall: mallKey, claims: [], count: 0, error: msg }
    }
  }

  /**
   * 여러 쇼핑몰 클레임 동시 수집
   */
  static async collectMultiple(
    channels: Array<{ mallKey: string; credentials: Credentials }>,
    params  : ClaimQueryParams,
  ) {
    const results = await Promise.allSettled(
      channels.map(({ mallKey, credentials }) =>
        CsService.collectClaims(mallKey, credentials, params)
      )
    )
    const allClaims: UnifiedClaim[] = []
    const summary: Array<{ mall: string; count: number; success: boolean; error?: string }> = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        allClaims.push(...r.value.claims)
        summary.push({ mall: channels[i].mallKey, count: r.value.count, success: r.value.success, error: r.value.error })
      } else {
        summary.push({ mall: channels[i].mallKey, count: 0, success: false, error: String(r.reason) })
      }
    })

    return { claims: allClaims, total: allClaims.length, summary }
  }

  /**
   * 취소 승인
   */
  static async approveCancel(
    mallKey    : string,
    credentials: Credentials,
    orderId    : string,
    reason?    : string,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.cancelOrder(orderId, reason)
    return { success: true, mall: mallKey, order_id: orderId }
  }

  /**
   * 반품 승인
   */
  static async approveReturn(
    mallKey    : string,
    credentials: Credentials,
    claimId    : string,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.approveReturn(claimId)
    return { success: true, mall: mallKey, claim_id: claimId }
  }

  /**
   * 교환 승인
   */
  static async approveExchange(
    mallKey    : string,
    credentials: Credentials,
    claimId    : string,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.approveExchange(claimId)
    return { success: true, mall: mallKey, claim_id: claimId }
  }

  /**
   * 클레임 거부
   */
  static async rejectClaim(
    mallKey    : string,
    credentials: Credentials,
    claimId    : string,
    reason?    : string,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.rejectClaim(claimId, reason)
    return { success: true, mall: mallKey, claim_id: claimId }
  }
}
