package humancheck

import (
	"crypto/sha256"
	"strconv"
	"testing"
	"time"
)

func solve(challenge string, need int) string {
	for i := 0; ; i++ {
		s := strconv.Itoa(i)
		if leadingZeroBits(sha256.Sum256([]byte(challenge+":"+s))) >= need {
			return s
		}
	}
}

func TestSolvedChallengeWorksOnce(t *testing.T) {
	g := New([]byte("k"), 10, true)
	c := g.Issue()
	s := solve(c, 10)
	if err := g.Check(c, s); err != nil {
		t.Fatalf("lời giải đúng bị từ chối: %v", err)
	}
	if err := g.Check(c, s); err == nil {
		t.Fatal("lời giải dùng lại lần hai vẫn được chấp nhận")
	}
}

func TestRejectsMissingWrongForgedAndExpired(t *testing.T) {
	g := New([]byte("k"), 10, true)
	if err := g.Check("", ""); err != ErrMissing {
		t.Fatalf("thiếu xác minh: %v", err)
	}
	c := g.Issue()
	bad := "0"
	for leadingZeroBits(sha256.Sum256([]byte(c+":"+bad))) >= 10 {
		bad += "0"
	}
	if g.Check(c, bad) == nil {
		t.Fatal("lời giải sai được chấp nhận")
	}
	other := New([]byte("khóa khác"), 10, true)
	forged := other.Issue()
	if g.Check(forged, solve(forged, 10)) == nil {
		t.Fatal("thử thách giả chữ ký được chấp nhận")
	}
	old := g.Issue()
	answer := solve(old, 10)
	g.now = func() time.Time { return time.Now().Add(10 * time.Minute) }
	if g.Check(old, answer) == nil {
		t.Fatal("thử thách hết hạn được chấp nhận")
	}
}

func TestNotRequiredSkipsCheck(t *testing.T) {
	if err := New([]byte("k"), 16, false).Check("", ""); err != nil {
		t.Fatal(err)
	}
}
