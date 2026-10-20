package qualifier

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"encoding/json"
	"sort"
	"sync"
	"strings"
	"time"
)

type RejectedSubmission struct{ Message string }

func (e *RejectedSubmission) Error() string { return e.Message }
func reject(message string) error           { return &RejectedSubmission{message} }

// A submission is also its durable receipt. The pending task and receipt are
// committed together before the HTTP handler acknowledges acceptance.
type validationTask struct {
	At float64 `json:"at"`
	Event         string  `json:"event"`
	SID           string  `json:"sid"`
	SubmissionKey string  `json:"submission_key"`
	Digest        string  `json:"digest"`
	Status        string  `json:"status"`
	RetryAt       float64 `json:"retry_at"`
}

func (s *Service) EnqueueSubmission(id, sid, code, language, requestID string) (Submission, error) {
	if len(requestID) > 80 || len(code) > 65536 || strings.TrimSpace(code) == "" {
		return Submission{}, reject("Mã nguồn cần từ 1 đến 64 KB; mã yêu cầu tối đa 80 ký tự.")
	}
	if language != "PYTHON" && language != "CPP" {
		return Submission{}, reject("Ngôn ngữ không hợp lệ.")
	}
	if requestID == "" {
		requestID = uniqueID()
	}
	sum := sha256.Sum256([]byte(id + "\x00" + sid + "\x00" + requestID))
	subID := hex.EncodeToString(sum[:])
	key := "submission:" + id + ":" + sid + ":" + subID
	taskKey := "validation:" + id + ":" + subID
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(language+"\x00"+code)))
	s.mu.Lock()
	defer s.mu.Unlock()
	release, err := s.Store.Lease(id)
	if err != nil {
		return Submission{}, err
	}
	defer release()
	var task validationTask
	if err = s.Store.Get(taskKey, &task); err == nil {
		if task.Digest != digest {
			return Submission{}, reject("Mã yêu cầu đã được dùng cho bài khác.")
		}
		var sub Submission
		err = s.Store.Get(key, &sub)
		return sub, err
	} else if !errors.Is(err, sql.ErrNoRows) {
		return Submission{}, err
	}
	e, err := s.Event(id)
	if errors.Is(err, sql.ErrNoRows) {
		return Submission{}, reject("Không tìm thấy vòng loại.")
	}
	if err != nil {
		return Submission{}, err
	}
	received := now()
	if e.Status != "OPEN" || received >= e.Deadline {
		return Submission{}, reject("Đã hết hạn hoặc bài nộp đã bị khóa.")
	}
	account, err := s.Accounts.Get(sid)
	if err != nil {
		return Submission{}, err
	}
	if account.Deleted {
		return Submission{}, reject("Tài khoản không hợp lệ.")
	}
	var p Participant
	err = s.Store.Get(participantKey(id, sid), &p)
	if errors.Is(err, sql.ErrNoRows) {
		return Submission{}, reject("Hãy đăng ký tham gia vòng loại trước khi nộp bot.")
	}
	if err != nil {
		return Submission{}, err
	}
	if p.Pending >= 20 {
		return Submission{}, reject("Đội có 20 bài đang chờ chấm. Hãy chờ kết quả trước khi nộp tiếp.")
	}
	p.Pending++
	// Preserve order even if two requests arrive in the same millisecond.
	if received <= p.SubmittedAt {
		received = p.SubmittedAt + 0.000001
	}
	p.SubmittedAt = received
	sub := Submission{ID: subID, Code: code, Language: language, At: received, Status: "QUEUED"}
	task = validationTask{Event: id, SID: sid, SubmissionKey: key, Digest: digest, Status: "QUEUED", At: received}
	err = s.Store.Batch(map[string]interface{}{key: sub, taskKey: task, participantKey(id, sid): p})
	return sub, err
}

func (s *Service) processSubmission(key string) error {
	release, err := s.Store.Lease(key)
	if err != nil {
		return err
	}
	defer release()
	var task validationTask
	if err = s.Store.Get(key, &task); err != nil {
		return err
	}
	if task.Status == "DONE" || task.RetryAt > now() {
		return nil
	}
	var sub Submission
	if err = s.Store.Get(task.SubmissionKey, &sub); err != nil {
		return err
	}
	result, engineErr := s.Engine.Mutate(nil, "validate-code", map[string]interface{}{"code_content": sub.Code, "language": sub.Language})
	valid, hasVerdict := result["is_valid"].(bool)
	s.mu.Lock()
	defer s.mu.Unlock()
	unlockEvent, err := s.Store.Lease(task.Event)
	if err != nil {
		return err
	}
	defer unlockEvent()
	if engineErr != nil || !hasVerdict {
		// Infrastructure failures never turn a timely submission into an invalid bot.
		task.RetryAt = now() + 15
		sub.Status = "QUEUED"
		sub.Error = "Máy chấm tạm thời chưa sẵn sàng; bài đã nhận và sẽ tự chấm lại."
		return s.Store.Batch(map[string]interface{}{key: task, task.SubmissionKey: sub})
	}
	var p Participant
	if err = s.Store.Get(participantKey(task.Event, task.SID), &p); err != nil {
		return err
	}
	sub.Valid = valid
	sub.Status = "INVALID"
	sub.Error, _ = result["error_message"].(string)
	if valid {
		sub.Status, sub.Error = "VALID", ""
		// A slow older job must never replace a more recent valid submission.
		var prior Submission
		if p.ValidID != "" {
			if err = s.Store.Get("submission:"+task.Event+":"+task.SID+":"+p.ValidID, &prior); err != nil {
				return err
			}
		}
		if p.ValidID == "" || prior.At < sub.At {
			p.ValidID, p.Code, p.Language = sub.ID, sub.Code, sub.Language
		}
	}
	task.Status = "DONE"
	if p.Pending > 0 {
		p.Pending--
	}
	return s.Store.Batch(map[string]interface{}{key: task, task.SubmissionKey: sub, participantKey(task.Event, task.SID): p})
}

func (s *Service) runSubmissionQueue() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		tasks, err := s.Store.Pending("validation:")
		if err != nil {
			log.Printf("[SubmissionQueue] Storage unavailable")
			continue
		}
		type entry struct { key string; at float64 }
		ready := []entry{}
		for key,raw := range tasks {
			var task validationTask
			if json.Unmarshal(raw,&task)==nil && task.RetryAt <= now() { ready=append(ready,entry{key,task.At}) }
		}
		sort.Slice(ready,func(i,j int)bool { return ready[i].at < ready[j].at })
		queue:=make(chan string)
		var wg sync.WaitGroup
		// Two consumers leave SQL connections free for receipts and event leases.
		// The adapter additionally caps execution across all judging endpoints.
		for i:=0;i<2;i++ {
			wg.Add(1)
			go func(){ defer wg.Done();for key:=range queue {
				if err:=s.processSubmission(key);err!=nil { log.Printf("[SubmissionQueue] Task deferred: %v",err) }
			}}()
		}
		for _,item:=range ready { queue<-item.key }
		close(queue)
		wg.Wait()
	}
}
