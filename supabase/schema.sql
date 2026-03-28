-- ProductPRO 데이터베이스 스키마
-- Supabase SQL Editor에서 실행하세요

-- 상품 테이블
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL UNIQUE,
  barcode VARCHAR(100),
  category VARCHAR(100),
  brand VARCHAR(100),
  description TEXT,
  purchase_price INTEGER NOT NULL DEFAULT 0,
  selling_price INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  images TEXT[],
  weight INTEGER,
  dimensions VARCHAR(100)
);

-- 재고 트랜잭션 테이블
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason VARCHAR(255),
  reference_id VARCHAR(100),
  notes TEXT,
  created_by UUID
);

-- 채널 테이블
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('coupang', 'naver', 'gmarket', '11st', 'auction', 'tmon', 'wemakeprice', 'kakao', 'other')),
  api_key TEXT,
  api_secret TEXT,
  seller_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT false,
  settings JSONB
);

-- 주문 테이블
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  channel VARCHAR(100) NOT NULL,
  channel_order_id VARCHAR(100),
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  shipping_address TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  total_amount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  tracking_number VARCHAR(100),
  carrier VARCHAR(100),
  notes TEXT
);

-- 주문 상품 테이블
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

-- CS 티켓 테이블
CREATE TABLE IF NOT EXISTS cs_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id),
  channel VARCHAR(100),
  type VARCHAR(20) NOT NULL CHECK (type IN ('inquiry', 'complaint', 'return', 'exchange', 'refund', 'other')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  response TEXT,
  resolved_at TIMESTAMPTZ,
  assigned_to UUID
);

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 설정
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_cs_tickets_updated_at
  BEFORE UPDATE ON cs_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_status ON cs_tickets(status);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_priority ON cs_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id ON inventory_transactions(product_id);

-- RLS (Row Level Security) 비활성화 (개발용)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE cs_tickets DISABLE ROW LEVEL SECURITY;

-- ─── ProductPRO 상품관리 전용 테이블 ───────────────────────────
-- Supabase SQL Editor에서 아래 SQL을 실행하세요

CREATE TABLE IF NOT EXISTS pm_products (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  code         TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  category     TEXT        DEFAULT '',
  loca         TEXT        DEFAULT '',
  cost_price   NUMERIC(10,2) DEFAULT 0,
  cost_currency TEXT       DEFAULT 'CNY',
  status       TEXT        DEFAULT 'active',
  supplier     TEXT        DEFAULT '',
  options      JSONB       DEFAULT '[]',
  channel_prices JSONB     DEFAULT '[]'
);

CREATE OR REPLACE FUNCTION update_pm_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pm_products_updated_at
  BEFORE UPDATE ON pm_products
  FOR EACH ROW EXECUTE FUNCTION update_pm_products_updated_at();

ALTER TABLE pm_products DISABLE ROW LEVEL SECURITY;

-- 이후 추가된 컬럼 (기존 테이블에 없는 경우 실행)
ALTER TABLE pm_products ADD COLUMN IF NOT EXISTS mall_categories JSONB DEFAULT '[]';
ALTER TABLE pm_products ADD COLUMN IF NOT EXISTS basic_info JSONB DEFAULT NULL;
ALTER TABLE pm_products ADD COLUMN IF NOT EXISTS abbr TEXT DEFAULT '';

-- cost_price 컬럼 타입 변경: integer → numeric(10,2) (소숫점 원가 지원)
-- 이미 numeric인 경우 자동으로 무시됩니다
ALTER TABLE pm_products ALTER COLUMN cost_price TYPE NUMERIC(10,2) USING cost_price::numeric;

-- 쇼핑몰 등록현황 컬럼 추가 (매핑 또는 상품전송 완료 시 쇼핑몰명 저장)
ALTER TABLE pm_products ADD COLUMN IF NOT EXISTS registered_malls JSONB DEFAULT '[]';

-- ─── 발주/입고 관리 테이블 ──────────────────────────────────────
-- pm_products와 연동하여 발주·입고 수량을 자동 반영합니다.

CREATE TABLE IF NOT EXISTS pm_purchases (
  id           TEXT        PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  order_date   TEXT        NOT NULL,
  supplier     TEXT        DEFAULT '',
  status       TEXT        DEFAULT 'ordered',
  ordered_at   TIMESTAMPTZ DEFAULT NOW(),
  received_at  TIMESTAMPTZ,
  items        JSONB       DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_pm_purchases_order_date ON pm_purchases(order_date);
CREATE INDEX IF NOT EXISTS idx_pm_purchases_status     ON pm_purchases(status);

ALTER TABLE pm_purchases DISABLE ROW LEVEL SECURITY;

-- 출고내역 (클라이언트 ShippedOrder JSON 전체 보관, 명시 삭제 시에만 제거)
CREATE TABLE IF NOT EXISTS pm_shipped_orders (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_shipped_orders_updated ON pm_shipped_orders(updated_at DESC);

ALTER TABLE pm_shipped_orders DISABLE ROW LEVEL SECURITY;
