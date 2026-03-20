'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, Warehouse,
  Settings,
  PanelLeftClose, PanelLeftOpen, ChevronRight, Boxes, X, PackagePlus, ShoppingCart, Truck, GitMerge,
  ClipboardList, Printer, Send, HeadphonesIcon, History,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavChild {
  label: string
  href: string
  icon: LucideIcon
}

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  children?: NavChild[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: '메인',
    items: [{ label: '대시보드', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: '상품 · 재고',
    items: [
      { label: '상품관리',     href: '/products',              icon: Package },
      {
        label: '주문관리',     href: '/product-transfer',      icon: ShoppingCart,
        children: [
          { label: '주문서등록', href: '/order-registration', icon: ClipboardList },
        ],
      },
      { label: 'CS관리',       href: '/cs-management',         icon: HeadphonesIcon },
      { label: '송장등록관리', href: '/product-edit-transfer/print', icon: Truck },
      { label: '출고내역',     href: '/product-edit-transfer/history', icon: History },
      { label: '재고관리',     href: '/inventory',             icon: Warehouse },
      {
        label: '발주/입고관리', href: '/purchase', icon: PackagePlus,
        children: [
          { label: '발주관리', href: '/purchase/manage',  icon: PackagePlus },
          { label: '입고관리', href: '/purchase/receive', icon: Truck },
        ],
      },
    ],
  },
  {
    label: '시스템',
    items: [
      { label: '매핑관리', href: '/mapping', icon: GitMerge },
      { label: '설정',     href: '/settings', icon: Settings },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onCollapse: (v: boolean) => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-40 select-none',
        'lg:translate-x-0 transition-transform duration-300 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
      style={{
        width: collapsed ? 64 : 220,
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0f1a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      }}
    >
      {/* 로고 */}
      <div
        className={cn(
          'flex items-center h-14 flex-shrink-0',
          collapsed ? 'justify-center' : 'px-4 gap-2.5'
        )}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="relative flex-shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            }}
          >
            <Boxes size={17} className="text-white" />
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: '#34d399', border: '1.5px solid #0d1117' }}
          />
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-white text-[14.5px] leading-none tracking-tight">ProductPRO</p>
              <p
                className="text-[8.5px] font-black mt-0.5 tracking-[0.22em] uppercase"
                style={{ color: 'rgba(59,130,246,0.55)' }}
              >
                Management
              </p>
            </div>
            <button
              onClick={onMobileClose}
              className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-2.5 px-2">
        {navGroups.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-3')}>
            {!collapsed && (
              <p
                className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em]"
                style={{ color: 'rgba(255,255,255,0.18)' }}
              >
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && (
              <div className="mx-auto w-6 my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = !collapsed && item.children && item.children.length > 0
                const isActive = pathname === item.href
                const isParentOfActive = hasChildren && item.children!.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
                const isHighlighted = isActive || isParentOfActive
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className="group relative flex items-center rounded-xl"
                      style={{
                        height: collapsed ? 40 : 36,
                        width: collapsed ? 40 : '100%',
                        margin: collapsed ? '0 auto' : undefined,
                        justifyContent: collapsed ? 'center' : undefined,
                        gap: collapsed ? undefined : 9,
                        padding: collapsed ? undefined : '0 10px',
                        background: isHighlighted
                          ? 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.08) 100%)'
                          : 'transparent',
                        transition: 'background 150ms ease, transform 100ms ease',
                      }}
                      onMouseEnter={e => {
                        if (!isHighlighted) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      }}
                      onMouseLeave={e => {
                        if (!isHighlighted) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {isHighlighted && !collapsed && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                          style={{ width: 3, height: 20, background: '#60a5fa' }}
                        />
                      )}

                      <item.icon
                        size={15}
                        strokeWidth={isHighlighted ? 2.4 : 1.8}
                        style={{
                          flexShrink: 0,
                          color: isHighlighted ? '#60a5fa' : 'rgba(255,255,255,0.28)',
                          transition: 'color 150ms ease',
                        }}
                      />

                      {!collapsed && (
                        <span
                          className="text-[14.5px] font-extrabold flex-1 truncate"
                          style={{
                            color: isHighlighted ? '#f1f5f9' : 'rgba(255,255,255,0.42)',
                            transition: 'color 150ms ease',
                          }}
                        >
                          {item.label}
                        </span>
                      )}

                      {isHighlighted && !collapsed && (
                        <ChevronRight size={11} style={{ color: 'rgba(96,165,250,0.45)', flexShrink: 0 }} />
                      )}

                      {collapsed && (
                        <span
                          className="absolute pointer-events-none"
                          style={{
                            left: 'calc(100% + 10px)',
                            top: '50%',
                            transform: 'translateY(-50%) translateX(6px)',
                            background: '#1e293b',
                            color: '#e2e8f0',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '5px 10px',
                            borderRadius: 8,
                            whiteSpace: 'nowrap',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                            opacity: 0,
                            transition: 'opacity 150ms ease, transform 150ms ease',
                            zIndex: 60,
                          }}
                          data-tooltip
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>

                    {/* 서브 메뉴 아이템 */}
                    {hasChildren && (
                      <ul className="mt-0.5 space-y-0.5" style={{ paddingLeft: 14 }}>
                        {item.children!.map((child) => {
                          const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/')
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className="relative flex items-center rounded-xl"
                                style={{
                                  height: 32,
                                  width: '100%',
                                  gap: 8,
                                  padding: '0 10px',
                                  background: isChildActive
                                    ? 'rgba(59,130,246,0.14)'
                                    : 'transparent',
                                  transition: 'background 150ms ease',
                                  borderLeft: '1.5px solid rgba(255,255,255,0.07)',
                                  paddingLeft: 12,
                                }}
                                onMouseEnter={e => {
                                  if (!isChildActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                }}
                                onMouseLeave={e => {
                                  if (!isChildActive) e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                <child.icon
                                  size={13}
                                  strokeWidth={isChildActive ? 2.4 : 1.8}
                                  style={{
                                    flexShrink: 0,
                                    color: isChildActive ? '#93c5fd' : 'rgba(255,255,255,0.22)',
                                    transition: 'color 150ms ease',
                                  }}
                                />
                                <span
                                  className="text-[13px] font-bold flex-1 truncate"
                                  style={{
                                    color: isChildActive ? '#bfdbfe' : 'rgba(255,255,255,0.32)',
                                    transition: 'color 150ms ease',
                                  }}
                                >
                                  {child.label}
                                </span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 */}
      <div
        className="flex-shrink-0 p-2 space-y-0.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* 유저 */}
        <div
          className={cn(
            'flex items-center rounded-xl cursor-pointer',
            collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-2.5 px-2.5 py-2'
          )}
          style={{ transition: 'background 150ms ease' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div className="relative flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
            >
              관
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
              style={{ background: '#34d399', border: '1.5px solid #0d1117' }}
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-extrabold truncate leading-none" style={{ color: 'rgba(255,255,255,0.72)' }}>관리자</p>
              <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>admin@example.com</p>
            </div>
          )}
        </div>

        {/* 접기 버튼 */}
        <button
          onClick={() => onCollapse(!collapsed)}
          className={cn(
            'hidden lg:flex w-full items-center rounded-xl transition-colors',
            collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-2.5 px-2.5 py-2'
          )}
          style={{
            color: 'rgba(255,255,255,0.2)',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.2)'
          }}
        >
          {collapsed
            ? <PanelLeftOpen size={14} strokeWidth={1.8} />
            : <><PanelLeftClose size={14} strokeWidth={1.8} /><span className="text-[12px] font-bold">접기</span></>
          }
        </button>
      </div>
    </aside>
  )
}
