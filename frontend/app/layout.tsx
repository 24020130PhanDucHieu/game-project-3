import type { Metadata, Viewport } from 'next'
import './globals.css'
import { themeBootScript } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'BOT K69 | ARENA OTTV2 – Đấu Trường Lập Trình',
  description: 'Nộp bot, theo dõi thi đấu, vòng loại và bảng xếp hạng.',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
          media="print"
          id="gfonts"
        />
        {/* Tải phông không chặn hiển thị trang: nạp xong mới áp dụng (mạng chậm hoặc bị chặn thì trang vẫn hiện ngay bằng phông hệ thống). */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){var l=document.getElementById('gfonts');if(!l)return;function on(){l.media='all'}if(l.sheet)on();else l.addEventListener('load',on)})()" }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  )
}
