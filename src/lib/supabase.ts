import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          sku: string
          barcode: string | null
          category: string | null
          brand: string | null
          description: string | null
          purchase_price: number
          selling_price: number
          stock_quantity: number
          min_stock: number
          status: 'active' | 'inactive' | 'discontinued'
          images: string[] | null
          weight: number | null
          dimensions: string | null
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      inventory_transactions: {
        Row: {
          id: string
          created_at: string
          product_id: string
          type: 'in' | 'out' | 'adjustment'
          quantity: number
          reason: string | null
          reference_id: string | null
          notes: string | null
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['inventory_transactions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['inventory_transactions']['Insert']>
      }
      orders: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          order_number: string
          channel: string
          channel_order_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_email: string | null
          shipping_address: string
          status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'
          total_amount: number
          shipping_fee: number
          tracking_number: string | null
          carrier: string | null
          notes: string | null
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          product_name: string
          sku: string
          quantity: number
          unit_price: number
          total_price: number
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      cs_tickets: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          ticket_number: string
          order_id: string | null
          channel: string | null
          type: 'inquiry' | 'complaint' | 'return' | 'exchange' | 'refund' | 'other'
          status: 'open' | 'in_progress' | 'resolved' | 'closed'
          priority: 'low' | 'medium' | 'high' | 'urgent'
          customer_name: string
          customer_phone: string | null
          customer_email: string | null
          subject: string
          content: string
          response: string | null
          resolved_at: string | null
          assigned_to: string | null
        }
        Insert: Omit<Database['public']['Tables']['cs_tickets']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['cs_tickets']['Insert']>
      }
      channels: {
        Row: {
          id: string
          created_at: string
          name: string
          type: 'coupang' | 'naver' | 'gmarket' | '11st' | 'auction' | 'tmon' | 'wemakeprice' | 'kakao' | 'other'
          api_key: string | null
          api_secret: string | null
          seller_id: string | null
          is_active: boolean
          settings: Record<string, unknown> | null
        }
        Insert: Omit<Database['public']['Tables']['channels']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['channels']['Insert']>
      }
    }
  }
}
