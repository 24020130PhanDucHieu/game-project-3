import { Card } from './ui'

/** Thông báo xử lý dữ liệu cá nhân (theo tinh thần Nghị định 13/2023/NĐ-CP): thu gì, để làm gì, giữ bao lâu, quyền của thí sinh. */
export const PRIVACY_ITEMS: { title: string; body: string }[] = [
  { title: 'Dữ liệu được thu', body: 'Mã sinh viên, tên đội, email, mật khẩu (lưu dạng băm và mã hóa), mã nguồn bot, lịch sử bài nộp và kết quả thi đấu, địa chỉ IP trong nhật ký bảo mật.' },
  { title: 'Mục đích', body: 'Tổ chức và chấm giải, chống gian lận (so sánh mã giữa các đội, nhật ký đăng nhập), gửi mã khôi phục mật khẩu và thông báo của ban tổ chức. Không dùng cho quảng cáo, không bán hay chia sẻ cho bên thứ ba.' },
  { title: 'Webcam', body: 'Chỉ bật khi bạn bấm “Bật camera”. Hình truyền trực tiếp giữa các trình duyệt (WebRTC) tới ban tổ chức (và đối thủ nếu ban tổ chức cho phép); máy chủ không ghi hình hay lưu lại.' },
  { title: 'Nơi lưu và thời hạn', body: 'Dữ liệu lưu trên máy chủ AWS và cơ sở dữ liệu Supabase tại Singapore. Ban tổ chức giữ dữ liệu trong thời gian diễn ra giải và tối đa 12 tháng sau khi giải kết thúc để giải quyết khiếu nại, sau đó xóa hoặc ẩn danh.' },
  { title: 'Quyền của bạn', body: 'Bạn có quyền xem, sửa email trong Hồ sơ, và yêu cầu ban tổ chức xóa tài khoản qua tab “Hỏi BTC”. Kết quả thi đấu đã công bố có thể được giữ ở dạng ẩn danh.' },
]

export function PrivacyPolicy() {
  return (
    <Card title="Dữ liệu cá nhân và quyền riêng tư" subtitle="Ban tổ chức BOT K69 ARENA xử lý dữ liệu của bạn như sau">
      <dl className="space-y-4 text-sm">
        {PRIVACY_ITEMS.map((item) => (
          <div key={item.title}>
            <dt className="font-semibold text-foreground">{item.title}</dt>
            <dd className="mt-1 text-muted-foreground">{item.body}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
