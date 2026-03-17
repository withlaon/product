/**
 * 멀티 쇼핑몰 연동 어댑터 인터페이스
 * 모든 쇼핑몰 커넥터는 이 인터페이스를 구현해야 합니다.
 */

export type Credentials = Record<string, string>

/* ─── 통합 상품 모델 ───────────────────────────────────────────── */
export interface ProductOption {
  option_code  : string
  name         : string
  size         : string
  color?       : string
  barcode      : string
  stock        : number
  extra_price  : number
}

export interface UnifiedProduct {
  internal_id      : string
  mall_product_id? : string
  name             : string
  brand            : string
  cost_price       : number
  sale_price       : number
  stock            : number
  images           : string[]
  detail_html      : string
  category_id      : string
  options          : ProductOption[]
  shipping_id      : string
  status?          : 'on_sale' | 'soldout' | 'hidden'
  marketplace?     : string
}

/* ─── 통합 주문 모델 ───────────────────────────────────────────── */
export interface OrderItem {
  product_name  : string
  option_name   : string
  qty           : number
  price         : number
  mall_order_item_id?: string
}

export interface UnifiedOrder {
  order_id         : string
  order_date       : string
  marketplace      : string
  mall_order_no    : string
  buyer_name       : string
  buyer_phone      : string
  receiver_name    : string
  receiver_phone   : string
  receiver_addr    : string
  receiver_zip?    : string
  items            : OrderItem[]
  total_price      : number
  status           : string
  courier          : string
  invoice_no       : string
  delivery_message?: string
}

/* ─── 통합 클레임 모델 ─────────────────────────────────────────── */
export type ClaimType = '취소' | '반품' | '교환' | '환불' | 'CS문의'
export type ClaimStatus = '접수' | '처리중' | '완료' | '거부'

export interface UnifiedClaim {
  claim_id       : string
  order_id       : string
  marketplace    : string
  claim_type     : ClaimType
  claim_date     : string
  reason         : string
  detail         : string
  buyer_name     : string
  buyer_phone    : string
  product_name   : string
  option_name    : string
  qty            : number
  price          : number
  status         : ClaimStatus
  return_courier : string
  return_invoice : string
  return_addr    : string
}

/* ─── 배송 프로필 모델 ─────────────────────────────────────────── */
export interface ShippingProfile {
  id             : string
  name           : string
  delivery_type  : '무료배송' | '유료배송' | '조건부무료'
  fee            : number
  free_condition : number
  return_fee     : number
  exchange_fee   : number
  courier        : string
  warehouse_addr : string
  lead_time      : number
}

/* ─── 쿼리 파라미터 타입 ──────────────────────────────────────── */
export interface OrderQueryParams {
  start_date?    : string
  end_date?      : string
  status_filter? : string
  limit?         : number
}

export interface ClaimQueryParams {
  start_date?  : string
  end_date?    : string
  claim_type?  : ClaimType
}

export interface InvoiceParams {
  order_id     : string
  courier_code : string
  invoice_no   : string
}

/* ─── 마켓플레이스 어댑터 인터페이스 ─────────────────────────── */
export interface IMarketplaceAdapter {
  readonly mallKey  : string
  readonly mallName : string

  /** 인증 정보 세팅 */
  connect(credentials: Credentials): void

  /* 상품 관리 */
  createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }>
  updateProduct(mallProductId: string, product: Partial<UnifiedProduct>): Promise<void>
  deleteProduct(mallProductId: string): Promise<void>
  updateStock(mallProductId: string, stock: number): Promise<void>
  updatePrice(mallProductId: string, price: number): Promise<void>

  /* 주문 관리 */
  getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]>
  uploadInvoice(params: InvoiceParams): Promise<void>
  bulkUploadInvoices(items: InvoiceParams[]): Promise<{ success: number; failed: number }>

  /* CS 관리 */
  getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]>
  cancelOrder(orderId: string, reason?: string): Promise<void>
  approveReturn(claimId: string): Promise<void>
  approveExchange(claimId: string): Promise<void>
  rejectClaim(claimId: string, reason?: string): Promise<void>

  /* 배송 */
  getShippingProfiles?(): Promise<ShippingProfile[]>
}
