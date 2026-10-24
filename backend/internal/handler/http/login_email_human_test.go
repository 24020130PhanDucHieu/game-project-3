package http

import (
	"crypto/sha256"
	"math/bits"
	"net/http"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func solveHuman(challenge string, need int) string {
	for i := 0; ; i++ {
		s := strconv.Itoa(i)
		sum := sha256.Sum256([]byte(challenge + ":" + s))
		zeros := 0
		for _, b := range sum {
			if b == 0 {
				zeros += 8
				continue
			}
			zeros += bits.LeadingZeros8(b)
			break
		}
		if zeros >= need {
			return s
		}
	}
}

func TestEmailLoginAndHumanCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewAccounts(repo, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	human := humancheck.New([]byte("test"), 8, true)
	tournaments := service.NewTournamentService(repo, nil)
	ah := &AccountsHandler{Store: store, Service: tournaments, Human: human}
	mh := NewMatchHandler(tournaments, auth.NewManager())
	mh.Accounts, mh.Human = store, human
	r := gin.New()
	r.POST("/register", ah.Register)
	r.POST("/login", mh.TeamLogin)
	r.GET("/challenge", ah.HumanChallenge)
	proof := func() map[string]string {
		_, out := send(r, "GET", "/challenge", "", nil)
		c := out["challenge"].(string)
		return map[string]string{"human_challenge": c, "human_solution": solveHuman(c, 8)}
	}
	with := func(body map[string]string, p map[string]string) map[string]string {
		for k, v := range p {
			body[k] = v
		}
		return body
	}

	reg := map[string]string{"student_id": "SV8001", "team_name": "Đội Email", "password": "pass-8001", "email": "Doi8001@Gmail.com"}
	if code, _ := send(r, "POST", "/register", "", reg); code != 400 {
		t.Fatal("đăng ký thiếu xác minh robot phải bị từ chối", code)
	}
	if code, out := send(r, "POST", "/register", "", with(reg, proof())); code != http.StatusCreated {
		t.Fatal("đăng ký có xác minh thất bại", code, out)
	}
	dup := map[string]string{"student_id": "SV8002", "team_name": "Đội Khác", "password": "pass-8002", "email": "doi8001@gmail.com"}
	if code, _ := send(r, "POST", "/register", "", with(dup, proof())); code != http.StatusConflict {
		t.Fatal("email đã dùng phải bị từ chối", code)
	}

	login := map[string]string{"username": "doi8001@GMAIL.com", "password": "pass-8001"}
	if code, _ := send(r, "POST", "/login", "", login); code != 400 {
		t.Fatal("đăng nhập thiếu xác minh robot phải bị từ chối", code)
	}
	p := proof()
	if code, out := send(r, "POST", "/login", "", with(login, p)); code != 200 || out["session_token"] == nil {
		t.Fatal("đăng nhập bằng email thất bại", code, out)
	}
	if code, _ := send(r, "POST", "/login", "", with(map[string]string{"username": "SV8001", "password": "pass-8001"}, p)); code != 400 {
		t.Fatal("lời giải đã dùng không được dùng lại", code)
	}
	if code, out := send(r, "POST", "/login", "", with(map[string]string{"username": "SV8001", "password": "pass-8001"}, proof())); code != 200 {
		t.Fatal("đăng nhập bằng MSSV vẫn phải chạy", code, out)
	}
	if code, _ := send(r, "POST", "/login", "", with(map[string]string{"username": "doi8001@gmail.com", "password": "sai"}, proof())); code != 401 {
		t.Fatal("sai mật khẩu phải bị từ chối", code)
	}
}
