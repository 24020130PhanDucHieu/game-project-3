// Package ai: trợ lý hỏi đáp luật. Model không có kiến thức luật; mọi thông tin phải lấy từ công cụ
// (kho tài liệu trong repo, cấu hình luật/lịch của giải, hỏi đáp công khai của BTC) và câu trả lời bị
// kiểm chứng bằng code: trích dẫn phải nằm nguyên văn trong nguồn mà công cụ đã trả về.
package ai

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

//go:embed kb/*.md
var kbFS embed.FS

// Source là một đoạn dữ liệu thật mà công cụ trả về. ID ổn định, Text nguyên văn.
type Source struct {
	ID    string `json:"source_id"`
	Title string `json:"title"`
	Text  string `json:"text"`
	Link  string `json:"-"`
}

type chunk struct {
	Source
	terms  map[string]int // theo từ có dấu
	fterms map[string]int // theo từ đã bỏ dấu
	size   int
}

// KB là kho tài liệu luật đã tách đoạn và lập chỉ mục BM25.
type KB struct {
	chunks  []chunk
	idf     map[string]float64 // theo từ có dấu
	idfF    map[string]float64 // theo từ đã bỏ dấu
	avgSize float64
	Version string
}

var headerRe = regexp.MustCompile(`^<!--\s*title:\s*(.*?)\s*;\s*link:\s*(\S+?)\s*(?:;.*)?-->`)

// Fold: chữ thường, bỏ dấu tiếng Việt (đ thành d) để tìm không phân biệt dấu.
func Fold(s string) string {
	s = strings.ReplaceAll(strings.ReplaceAll(s, "đ", "d"), "Đ", "d")
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(s)) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// Từ nối/hỏi vô nghĩa khi tìm. Có hai danh sách: dạng có dấu (chính xác) và dạng không dấu chỉ gồm từ
// không trùng với từ nội dung (ví dụ "co" vừa là "có" vừa là "cờ" nên KHÔNG đưa vào).
var stopAccent = setOf(`là và của có không như thế nào gì bao nhiêu được cho tôi mình bạn ở trong một những các thì sẽ đã đang hay hoặc để với khi nếu vì sao tại mà này đó vậy ạ ơi nhé nha về từ đến ra vào lên xuống ai đâu lúc nào cần phải muốn biết hỏi xin cảm ơn`)
var stopFold = setOf(`la va cua khong nhu the nao gi bao nhieu duoc cho toi minh ban o trong mot nhung cac thi se da dang hay hoac de voi khi neu vi sao tai ma nay do vay a oi nhe nha ve tu den ra vao len xuong ai dau luc can phai muon biet hoi xin cam on`)

func setOf(list string) map[string]bool {
	m := map[string]bool{}
	for _, w := range strings.Fields(list) {
		m[w] = true
	}
	return m
}

func isWordSep(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }

// words tách từ, giữ nguyên dấu (chữ thường).
func words(s string) []string { return strings.FieldsFunc(strings.ToLower(s), isWordSep) }

func hasMarks(w string) bool { return Fold(w) != w }

func tokenize(s string) []string { return strings.FieldsFunc(Fold(s), isWordSep) }

// qterm là một từ khóa của câu hỏi: nếu người hỏi gõ có dấu thì so khớp theo dạng có dấu ("giá" khác "gia" trong "tham gia"),
// nếu gõ không dấu thì so khớp theo dạng đã bỏ dấu.
type qterm struct {
	W      string
	Folded bool
}

func queryTerms(q string) []qterm {
	seen := map[string]bool{}
	var out []qterm
	for _, w := range words(q) {
		marked := hasMarks(w)
		if stopAccent[w] || (!marked && stopFold[w]) {
			continue
		}
		t := qterm{W: w, Folded: !marked}
		if seen[t.W] {
			continue
		}
		seen[t.W] = true
		out = append(out, t)
	}
	return out
}

func slug(s string) string {
	return strings.Join(tokenize(s), "-")
}

// LoadKB đọc mọi tệp kb/*.md: mỗi mục "## " là một đoạn có ID kb:<tệp>#<mục>.
func LoadKB() (*KB, error) {
	entries, err := kbFS.ReadDir("kb")
	if err != nil {
		return nil, err
	}
	kb := &KB{idf: map[string]float64{}, idfF: map[string]float64{}}
	hash := sha256.New()
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		raw, err := kbFS.ReadFile("kb/" + e.Name())
		if err != nil {
			return nil, err
		}
		hash.Write(raw)
		text := strings.ReplaceAll(string(raw), "\r\n", "\n")
		lines := strings.Split(text, "\n")
		m := headerRe.FindStringSubmatch(strings.TrimSpace(lines[0]))
		if m == nil {
			return nil, fmt.Errorf("kb/%s: thiếu dòng tiêu đề <!-- title: ...; link: ... -->", e.Name())
		}
		docTitle, link := m[1], m[2]
		base := strings.TrimSuffix(e.Name(), ".md")
		var heading string
		var body []string
		flush := func() {
			content := strings.TrimSpace(strings.Join(body, "\n"))
			if heading == "" || content == "" {
				return
			}
			kb.chunks = append(kb.chunks, chunk{Source: Source{ID: "kb:" + base + "#" + slug(heading), Title: docTitle + " › " + heading, Text: heading + "\n" + content, Link: link}})
		}
		for _, line := range lines[1:] {
			if strings.HasPrefix(line, "## ") {
				flush()
				heading, body = strings.TrimSpace(strings.TrimPrefix(line, "## ")), nil
				continue
			}
			body = append(body, line)
		}
		flush()
	}
	if len(kb.chunks) == 0 {
		return nil, fmt.Errorf("kho tài liệu rỗng")
	}
	kb.Version = hex.EncodeToString(hash.Sum(nil))[:12]
	df, dfF := map[string]int{}, map[string]int{}
	total := 0
	for i := range kb.chunks {
		c := &kb.chunks[i]
		c.terms, c.fterms = map[string]int{}, map[string]int{}
		add := func(text string, weight int) {
			for _, w := range words(text) {
				c.terms[w] += weight
				c.fterms[Fold(w)] += weight
			}
		}
		add(c.Text, 1)
		add(c.Title, 2) // tiêu đề có trọng số gấp đôi để câu hỏi đúng chủ đề ra đúng mục
		for _, n := range c.terms {
			c.size += n
		}
		for t := range c.terms {
			df[t]++
		}
		for t := range c.fterms {
			dfF[t]++
		}
		total += c.size
	}
	kb.avgSize = float64(total) / float64(len(kb.chunks))
	n := float64(len(kb.chunks))
	for t, d := range df {
		kb.idf[t] = math.Log(1 + (n-float64(d)+0.5)/(float64(d)+0.5))
	}
	for t, d := range dfF {
		kb.idfF[t] = math.Log(1 + (n-float64(d)+0.5)/(float64(d)+0.5))
	}
	return kb, nil
}

// minScore: dưới ngưỡng này coi như "không tìm thấy" để model không bị đưa đoạn không liên quan.
const minScore = 2.0

// Search xếp hạng BM25. Trả rỗng khi không có đoạn nào đủ liên quan.
func (kb *KB) Search(query string, limit int) []Source {
	terms := queryTerms(query)
	if len(terms) == 0 {
		return nil
	}
	type hit struct {
		c       *chunk
		score   float64
		matched int
	}
	var hits []hit
	for i := range kb.chunks {
		c := &kb.chunks[i]
		score, matched := 0.0, 0
		for _, t := range terms {
			tf, idf := float64(c.terms[t.W]), kb.idf[t.W]
			if t.Folded {
				tf, idf = float64(c.fterms[t.W]), kb.idfF[t.W]
			}
			if tf == 0 {
				continue
			}
			matched++
			score += idf * (tf * 2.5) / (tf + 1.5*(0.25+0.75*float64(c.size)/kb.avgSize))
		}
		need := 1
		if len(terms) >= 3 {
			need = 2
		}
		if matched >= need && score >= minScore {
			hits = append(hits, hit{c, score, matched})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].score > hits[j].score })
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]Source, 0, len(hits))
	for _, h := range hits {
		out = append(out, h.c.Source)
	}
	return out
}

// Sources trả về mọi đoạn (dùng cho test đối chiếu tài liệu).
func (kb *KB) Sources() []Source {
	out := make([]Source, 0, len(kb.chunks))
	for _, c := range kb.chunks {
		out = append(out, c.Source)
	}
	return out
}
