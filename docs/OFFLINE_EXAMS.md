# Quy chế & Hướng dẫn Kỹ thuật Thi Offline và Chịu Tải Cao

---

## 1. Quy chế chính thức về nộp bài offline & Biên nhận máy chủ (Server Receipt)

Để đảm bảo tính công bằng, minh bạch và chống gian lận trong các kỳ thi lập trình, hệ thống quy định chặt chẽ:

1. **Bản lưu tại máy trạm chỉ là Bản nháp tạm thời:**
   - Khi mất kết nối mạng, trình duyệt lưu mã nguồn vào `localStorage` của thiết bị (tối đa 20 bản nộp, 64 KB/bản).
   - **CẢNH BÁO:** Thông báo *"Đã lưu trên thiết bị"* **CHƯA ĐƯỢC COI LÀ ĐÃ NỘP BÀI THÀNH CÔNG**.
2. **Biên nhận máy chủ (Receipt) là bằng chứng duy nhất:**
   - Chỉ khi thiết bị thí sinh kết nối lại và Gateway phản hồi mã trạng thái `HTTP 200/202` kèm mã biên nhận số `receipt_id`, bài thi mới chính thức được ghi nhận vào hệ thống chấm.
   - Biên nhận được lưu trữ bền vững trong cơ sở dữ liệu trung tâm (`arena_qualifier_records` / PostgreSQL).
3. **Mốc thời gian nộp bài hoàn toàn do Máy chủ quyết định (Server-Authoritative Clock):**
   - Thời điểm nộp bài được đóng dấu bằng đồng hồ máy chủ (đồng bộ qua chuẩn NTP quốc gia).
   - **Hệ thống KHÔNG chấp nhận và KHÔNG căn cứ vào đồng hồ máy tính thí sinh** nhằm triệt tiêu hoàn toàn gian lận chỉnh lùi giờ hệ điều hành.
   - Mọi bài nộp đồng bộ sau thời điểm hết hạn của vòng đấu (`ends_at`) sẽ bị từ chối tự động.

---

## 2. Quy trình ứng phó khi mất mạng diện rộng tại phòng thi

Khi xảy ra sự cố đứt cáp hoặc mất Internet tại phòng máy:

1. **Đối với thí sinh:**
   - Giữ nguyên tab trình duyệt, **TUYỆT ĐỐI KHÔNG TẮT TRÌNH DUYỆT, KHÔNG XÓA DỮ LIỆU CACHE/COOKIES**.
   - Bấm nút **"Tải bản dự phòng (.json)"** trong phòng thi đấu để lưu mã nguồn bài làm xuống máy tính phòng thi làm bằng chứng đối chiếu ngoại tuyến.
2. **Đối với Giám thị & Ban Tổ chức:**
   - Ban Giám hiệu / Giám sát giải lập tức thực hiện gia hạn thời gian nộp bài cho vòng đấu bị ảnh hưởng:
     ```http
     PUT /api/tournaments/{tournament_id}/stage-schedule
     Content-Type: application/json
     Authorization: Bearer <ADMIN_TOKEN>

     {
       "windows": [
         {"level": 1, "starts_at": 1729600000, "ends_at": 1729605400}
       ]
     }
     ```
   - Phòng máy kỹ thuật chuyển hướng đường truyền sang mạng nội bộ (LAN) trỏ trực tiếp về Gateway máy chủ.
   - Sau khi mạng thông trở lại, thí sinh kiểm tra lại danh sách bài nộp và đảm bảo đã nhận được `receipt_id` thành công trước khi rời phòng thi.

---

## 3. Kiến trúc phục vụ 4.000 Thí sinh đồng thời

- **Sức chứa:** Hệ thống giới hạn tiếp nhận tối đa 4.000 đội thi trong một giải đấu.
- **Hàng đợi chống nghẽn (Async Submission Queue):**
  - Mọi bài nộp của thí sinh được Gateway tiếp nhận, cấp phát biên nhận và trả về phản hồi `HTTP 202 Accepted` trong vòng dưới 100ms.
  - Các tác vụ biên dịch và chạy thử Sandbox được xếp vào hàng đợi bền vững (`qualifier_records`) để các Worker xử lý tuần tự, loại bỏ nguy cơ treo máy do hàng nghìn tiến trình con chạy đồng thời.
- **Tối ưu hóa Polling:**
  - Trang web tự động giãn nhịp polling trạng thái lên 15–20 giây/lần.
  - Hỗ trợ chuẩn `ETag` (HTTP 304 Not Modified) giúp giảm 90% tải xử lý và băng thông của Gateway.

