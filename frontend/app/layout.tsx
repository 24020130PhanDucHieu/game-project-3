import type { Metadata, Viewport } from 'next'
import portal from '@/generated/portal.json'

export const metadata: Metadata = {
  title: 'ARENA OTTV2 – Đấu Trường Lập Trình BOT K69',
  description: 'Nộp bot, theo dõi thi đấu, vòng loại và bảng xếp hạng.',
  icons: { icon: '/static/img/favicon.svg' },
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#f8fafc' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><head>
    {portal.styles.map(href => <link key={href} href={href} rel="stylesheet" />)}
  </head><body>{children}</body></html>
}
