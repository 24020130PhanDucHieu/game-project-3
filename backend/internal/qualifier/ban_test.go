package qualifier

import "testing"

func TestBannedTeamIsNotPairedOrRanked(t *testing.T) {
	s, e := fixture(t, 4)
	if err := s.SetBanned(e.ID, "B", true, ""); err == nil {
		t.Fatal("loại đội phải có lý do")
	}
	if err := s.SetBanned(e.ID, "B", true, "Gian lận mã nguồn"); err != nil {
		t.Fatal(err)
	}
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	people, _ := s.Participants(e.ID)
	if people["B"].Played != 0 {
		t.Fatalf("đội bị loại vẫn được ghép cặp: %+v", people["B"])
	}
	if people["B"].BanReason != "Gian lận mã nguồn" || !people["B"].Banned {
		t.Fatalf("mất thông tin loại đội: %+v", people["B"])
	}
	ranked, err := s.Ranked(e.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range ranked {
		if p.SID == "B" {
			t.Fatal("đội bị loại vẫn có trong bảng xếp hạng")
		}
	}
	if len(ranked) != 3 {
		t.Fatalf("bảng xếp hạng phải còn 3 đội, có %d", len(ranked))
	}
	if err := s.SetBanned(e.ID, "B", false, ""); err != nil {
		t.Fatal(err)
	}
	people, _ = s.Participants(e.ID)
	if people["B"].Banned || people["B"].BanReason != "" {
		t.Fatal("bỏ loại không xoá trạng thái", people["B"])
	}
}
