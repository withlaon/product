import type { Metadata } from 'next'
import { Nanum_Gothic } from 'next/font/google'
import './globals.css'
import { LayoutShell } from '@/components/layout/LayoutShell'

const nanumGothic = Nanum_Gothic({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nanum',
})

export const metadata: Metadata = {
  title: 'ProductPRO - 통합 상품관리 시스템',
  description: '상품관리, 재고관리, 주문관리, CS관리, 쇼핑몰 연동을 하나의 플랫폼에서',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={nanumGothic.variable}>
      <body className={`${nanumGothic.className} bg-slate-50`}>
        <LayoutShell>
          {children}
        </LayoutShell>
      </body>
    </html>
  )
}
