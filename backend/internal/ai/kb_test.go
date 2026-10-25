package ai

import (
	"strings"
	"testing"
)

func TestKBLoads(t *testing.T) {
	kb, err := LoadKB()
	if err != nil {
		t.Fatal(err)
	}
	if len(kb.Sources()) < 25 || kb.Version == "" {
		t.Fatalf("kho tài liệu quá nhỏ: %d đoạn", len(kb.Sources()))
	}
	seen := map[string]bool{}
	for _, s := range kb.Sources() {
		if seen[s.ID] {
			t.Fatalf("trùng ID nguồn %s", s.ID)
		}
		seen[s.ID] = true
		if s.Link == "" || len(s.Text) < 20 {
			t.Fatalf("đoạn thiếu liên kết hoặc quá ngắn: %+v", s.ID)
		}
	}
}

// Bộ câu hỏi vàng: câu hỏi (có dấu và không dấu) phải đưa đúng đoạn tài liệu vào top 3.
var golden = []struct{ q, want string }{
	{"Bàn cờ bao nhiêu ô, mỗi bên có mấy quân?", "luat-co-ban#ban-co-va-quan-co"},
	{"ban co kich thuoc bao nhieu", "luat-co-ban#ban-co-va-quan-co"},
	{"Búa thắng Kéo hay Bao thắng Búa?", "luat-co-ban#quan-nao-thang-quan-nao"},
	{"hai quân cùng loại gặp nhau thì sao", "luat-co-ban#quan-nao-thang-quan-nao"},
	{"Làm sao để thắng một hiệp?", "luat-co-ban#cach-thang-mot-hiep"},
	{"khi ban co be tac thi ai thang", "luat-co-ban#ban-co-be-tac"},
	{"bot bị lỗi hoặc quá thời gian thì sao", "luat-co-ban#bot-loi"},
	{"một trận Bo5 gồm mấy hiệp, thắng mấy hiệp thì đi tiếp", "luat-co-ban#the-thuc-tran-bo5"},
	{"Luật sương mù là gì?", "luat-bo-sung#suong-mu"},
	{"luat dao tuong khac la gi", "luat-bo-sung#dao-tuong-khac"},
	{"Quân Joker đi được bao nhiêu bước?", "luat-bo-sung#quan-joker"},
	{"ô tiến hóa, cổng dịch chuyển và bẫy mìn hoạt động thế nào", "luat-bo-sung#o-bi-an"},
	{"chướng ngại ngẫu nhiên là gì", "luat-bo-sung#chuong-ngai-ngau-nhien"},
	{"luật trộn quân thì có luôn 3 quân mỗi loại không", "luat-bo-sung#tron-quan"},
	{"hàm bot python tên gì, nhận tham số gì", "viet-bot#hop-dong-cua-bot"},
	{"game_state gồm những trường nào", "viet-bot#trang-thai-bot-nhan-duoc"},
	{"mã nguồn tối đa bao nhiêu KB", "viet-bot#gioi-han-ky-thuat"},
	{"đấu thử có tính điểm không", "viet-bot#kiem-tra-ma-va-dau-thu"},
	{"quên mật khẩu thì làm sao", "quy-trinh#dang-ky-tai-khoan-doi"},
	{"đăng nhập bằng email được không", "quy-trinh#dang-ky-tai-khoan-doi"},
	{"top 8 vào giải chính thế nào", "quy-trinh#vao-giai-chinh"},
	{"ELO giải chính tính thế nào, K bằng bao nhiêu", "vong-loai-xep-hang#elo-giai-chinh"},
	{"ELO vòng loại có mang sang giải chính không", "vong-loai-xep-hang#elo-giai-chinh"},
	{"ghép cặp vòng loại có đội lẻ thì sao", "vong-loai-xep-hang#ghep-cap-nhieu-luot"},
	{"mất mạng thì nộp bài thế nào", "mat-mang#nop-bai-khi-mat-mang"},
	{"tải gói offline ở đâu", "mat-mang#goi-offline"},
	{"chat trong trận tối đa bao nhiêu ký tự", "phong-tran#chat-trong-tran"},
	{"hai đội có xem được camera của nhau không", "phong-tran#webcam-trong-tran"},
	{"giấy chứng nhận ở đâu", "quy-trinh#giay-chung-nhan"},
	{"tại sao tôi không nộp được bài trong trận", "cau-hoi-thuong-gap#toi-khong-nop-duoc-bai-trong-tran"},
	{"nộp bài qua git được không", "cau-hoi-thuong-gap#co-the-nop-qua-git-khong"},
	{"Giải AI là gì, khác giải thường chỗ nào", "giai-ai#giai-ai-la-gi"},
	{"vòng loại AI chấm điểm thế nào, mỗi lượt đấu bao nhiêu trận", "giai-ai#vong-loai-ai-cham-diem-the-nao"},
	{"bảng riêng tư khi nào mở, chênh lệch là gì", "giai-ai#bang-cong-khai-va-bang-rieng-tu"},
	{"mô hình AI có nhớ biến giữa các lần gọi không", "giai-ai#viet-mo-hinh-cho-giai-ai"},
	{"báo cáo kỹ thuật chấm bao nhiêu tiêu chí", "giai-ai#giai-chinh-ai-va-bao-cao-ky-thuat"},
	{"huy hiệu Giải AI gồm những gì", "giai-ai#elo-va-huy-hieu-giai-ai"},
}

func TestGoldenSearch(t *testing.T) {
	kb, _ := LoadKB()
	for _, g := range golden {
		hits := kb.Search(g.q, 3)
		found := false
		var ids []string
		for _, h := range hits {
			ids = append(ids, h.ID)
			if strings.HasSuffix(h.ID, g.want) {
				found = true
			}
		}
		if !found {
			t.Errorf("%q: muốn %s trong top 3, có %v", g.q, g.want, ids)
		}
	}
}

// Câu ngoài phạm vi cuộc thi phải ra rỗng để trợ lý chuyển cho ban tổ chức thay vì bịa.
func TestOutOfScopeFindsNothing(t *testing.T) {
	kb, _ := LoadKB()
	for _, q := range []string{"thời tiết hôm nay thế nào", "bitcoin hôm nay thế nào", "cách nấu phở bò", "ai là tổng thống Mỹ", "xin chào", ""} {
		if hits := kb.Search(q, 5); len(hits) != 0 {
			t.Errorf("%q: không được tìm thấy gì, có %v", q, hits[0].ID)
		}
	}
}

func TestFold(t *testing.T) {
	if Fold("Đấu Trường Lập Trình") != "dau truong lap trinh" {
		t.Fatalf("Fold sai: %q", Fold("Đấu Trường Lập Trình"))
	}
}
