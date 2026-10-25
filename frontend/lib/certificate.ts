'use client'

/**
 * Giấy chứng nhận dựng bằng SVG (khổ A4 ngang): cùng một mẫu cho xem trên web, tải ảnh PNG và in/lưu PDF.
 * Chỉ dùng phông hệ thống để ảnh tải về giống hệt bản xem (ảnh SVG không nạp được phông web).
 */
export type CertificateData = {
  tournament_id: string
  tournament_name: string
  place: string
  rank: number
  team_name: string
  student_id: string
  org: string
  signer: string
  date: string
  issued_at?: number
}

const W = 1123
const H = 794

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// Màu huy chương theo hạng: vàng, bạc, đồng.
const MEDAL: Record<number, { a: string; b: string; ink: string }> = {
  1: { a: '#fde68a', b: '#d97706', ink: '#92400e' },
  2: { a: '#f1f5f9', b: '#94a3b8', ink: '#334155' },
  3: { a: '#fed7aa', b: '#c2410c', ink: '#7c2d12' },
}

/** Cỡ chữ vừa khung cho tên dài. */
function fit(text: string, base: number, max: number) {
  const len = [...text].length
  return len * base * 0.56 > max ? Math.max(22, Math.floor(max / (len * 0.56))) : base
}

export function certificateSvg(c: CertificateData): string {
  const m = MEDAL[c.rank] || MEDAL[3]
  const font = `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`
  const serif = `'Times New Roman', 'Noto Serif', 'DejaVu Serif', Times, serif`
  const team = esc(c.team_name)
  const teamSize = fit(c.team_name, 54, 820)
  const event = esc(c.tournament_name)
  const eventSize = fit(`tại ${c.tournament_name}`, 22, 760)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${font}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#fbfaff"/><stop offset="1" stop-color="#f3efff"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.75"><stop offset="0" stop-color="#ede9fe" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8862f"/><stop offset="0.5" stop-color="#f2d27a"/><stop offset="1" stop-color="#b8862f"/></linearGradient>
    <linearGradient id="medal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.a}"/><stop offset="1" stop-color="${m.b}"/></linearGradient>
    <linearGradient id="ribbonL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
    <linearGradient id="ribbonR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#9f1239"/></linearGradient>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#7c3aed" fill-opacity="0.07"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="22" fill="none" stroke="url(#gold)" stroke-width="6"/>
  <rect x="42" y="42" width="${W - 84}" height="${H - 84}" rx="14" fill="none" stroke="#b8862f" stroke-opacity="0.55" stroke-width="1.5"/>
  <path d="M42 120 L42 42 L120 42" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linecap="round"/>
  <path d="M${W - 120} 42 L${W - 42} 42 L${W - 42} 120" fill="none" stroke="#e11d48" stroke-width="5" stroke-linecap="round"/>
  <path d="M42 ${H - 120} L42 ${H - 42} L120 ${H - 42}" fill="none" stroke="#e11d48" stroke-width="5" stroke-linecap="round"/>
  <path d="M${W - 120} ${H - 42} L${W - 42} ${H - 42} L${W - 42} ${H - 120}" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linecap="round"/>

  <text x="${W / 2}" y="104" text-anchor="middle" font-size="17" font-weight="700" letter-spacing="7" fill="#6d28d9">${esc(c.org.toUpperCase())}</text>
  <text x="${W / 2}" y="176" text-anchor="middle" font-family="${serif}" font-size="60" font-weight="700" letter-spacing="5" fill="#b8862f">GIẤY CHỨNG NHẬN</text>
  <line x1="${W / 2 - 150}" y1="200" x2="${W / 2 + 150}" y2="200" stroke="url(#gold)" stroke-width="2"/>
  <text x="${W / 2}" y="246" text-anchor="middle" font-size="21" fill="#475569">Ban tổ chức trân trọng chứng nhận đội</text>
  <text x="${W / 2}" y="${300 + teamSize * 0.2}" text-anchor="middle" font-size="${teamSize}" font-weight="800" fill="#3b0764">${team}</text>
  <text x="${W / 2}" y="352" text-anchor="middle" font-size="17" fill="#64748b">Đội trưởng · MSSV ${esc(c.student_id)}</text>
  <text x="${W / 2}" y="396" text-anchor="middle" font-size="21" fill="#475569">đã xuất sắc đạt danh hiệu</text>

  <g transform="translate(${W / 2} 470)">
    <path d="M-58 22 L-86 112 L-56 96 L-40 124 L-18 40 Z" fill="url(#ribbonL)"/>
    <path d="M58 22 L86 112 L56 96 L40 124 L18 40 Z" fill="url(#ribbonR)"/>
    <circle r="58" fill="url(#medal)" stroke="#ffffff" stroke-width="5"/>
    <circle r="45" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="2"/>
    <text y="16" text-anchor="middle" font-family="${serif}" font-size="48" font-weight="700" fill="${m.ink}">${c.rank}</text>
  </g>
  <text x="${W / 2}" y="636" text-anchor="middle" font-size="40" font-weight="800" letter-spacing="3" fill="#be123c">${esc(c.place.toUpperCase())}</text>
  <text x="${W / 2}" y="676" text-anchor="middle" font-size="${eventSize}" fill="#334155">tại ${event}</text>

  <text x="140" y="706" font-size="15" fill="#64748b">Ngày cấp</text>
  <text x="140" y="732" font-size="19" font-weight="700" fill="#1e1b4b">${esc(c.date)}</text>
  <line x1="${W - 380}" y1="712" x2="${W - 140}" y2="712" stroke="#94a3b8" stroke-width="1.2"/>
  <text x="${W - 260}" y="700" text-anchor="middle" font-family="${serif}" font-style="italic" font-size="24" fill="#1e1b4b">${esc(c.signer)}</text>
  <text x="${W - 260}" y="736" text-anchor="middle" font-size="15" fill="#64748b">Trưởng ban tổ chức</text>
</svg>`
}

export function certificateFileName(c: CertificateData, ext: string) {
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `giay-chung-nhan-${slug(c.team_name)}-${slug(c.tournament_name)}.${ext}`
}

/** Tải giấy về dạng ảnh PNG (gấp đôi độ phân giải để in đẹp). */
export async function downloadCertificatePng(c: CertificateData) {
  const url = URL.createObjectURL(new Blob([certificateSvg(c)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Không dựng được ảnh giấy chứng nhận.')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ vẽ ảnh.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Không tạo được file ảnh.')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = certificateFileName(c, 'png')
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Mở cửa sổ in (chọn “Lưu thành PDF” để có file PDF); mỗi giấy một trang A4 ngang. */
export function printCertificates(list: CertificateData[]) {
  const win = window.open('', '_blank')
  if (!win) throw new Error('Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.')
  const pages = list.map((c) => `<section class="page">${certificateSvg(c)}</section>`).join('')
  win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Giấy chứng nhận</title>
<style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb}
.page{width:297mm;height:210mm;page-break-after:always;display:flex;align-items:center;justify-content:center;background:#fff;margin:0 auto}
.page svg{width:100%;height:100%}@media screen{.page{margin:12px auto;box-shadow:0 4px 20px rgba(0,0,0,.15)}}</style></head>
<body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`)
  win.document.close()
}
