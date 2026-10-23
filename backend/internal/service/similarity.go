package service

import (
	"hash/fnv"
	"math"
	"regexp"
	"sort"
	"strings"
)

// Phát hiện mã nguồn giống nhau theo kiểu MOSS: chuẩn hóa token (bỏ chú thích, chuỗi, tên biến),
// băm k-gram rồi "winnowing" để lấy dấu vân tay; so cặp qua chỉ mục ngược thay vì so mọi cặp.
const (
	simK      = 5 // độ dài k-gram token
	simWindow = 4 // cửa sổ winnowing
)

type SimilarityDoc struct {
	ID       string
	Name     string
	Language string
	Code     string
}

type SimilarityPair struct {
	A           string  `json:"a"`
	B           string  `json:"b"`
	Score       float64 `json:"score"`       // Jaccard của tập dấu vân tay
	Containment float64 `json:"containment"` // phần trăm bài ngắn hơn nằm trong bài kia
	Shared      int     `json:"shared"`
}

var (
	pyKeywords  = wordSet("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print len range enumerate zip dict list set tuple min max sorted sum any all abs int float str get items keys values append")
	cppKeywords = wordSet("auto bool break case catch char class const continue default delete do double else enum explicit extern false float for friend goto if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while include std string vector map set cout cin endl getline")
	tokenRe     = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|==|!=|<=|>=|\+=|-=|\*=|/=|&&|\|\||<<|>>|->|::|[^\s\w]`)
	pyComments  = regexp.MustCompile(`(?s)"""[\s\S]*?"""|'''[\s\S]*?'''|#[^\n]*`)
	cppComments = regexp.MustCompile(`(?s)/\*.*?\*/|//[^\n]*`)
	strLiterals = regexp.MustCompile(`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`)
)

func wordSet(s string) map[string]bool {
	m := map[string]bool{}
	for _, w := range strings.Fields(s) {
		m[w] = true
	}
	return m
}

// NormalizeTokens trả chuỗi token đã ẩn tên định danh, số và chuỗi; giữ từ khóa và toán tử.
func NormalizeTokens(code, language string) []string {
	cpp := strings.EqualFold(language, "CPP")
	if cpp {
		code = cppComments.ReplaceAllString(code, " ")
	} else {
		code = pyComments.ReplaceAllString(code, " ")
	}
	code = strLiterals.ReplaceAllString(code, ` STR `)
	keywords := pyKeywords
	if cpp {
		keywords = cppKeywords
	}
	raw := tokenRe.FindAllString(code, -1)
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		switch {
		case t == "STR":
			out = append(out, "S")
		case t[0] >= '0' && t[0] <= '9':
			out = append(out, "N")
		case (t[0] >= 'A' && t[0] <= 'Z') || (t[0] >= 'a' && t[0] <= 'z') || t[0] == '_':
			if keywords[t] {
				out = append(out, t)
			} else {
				out = append(out, "I")
			}
		default:
			out = append(out, t)
		}
	}
	return out
}

// Fingerprints chọn hash nhỏ nhất của mỗi cửa sổ k-gram (winnowing), cho tập dấu vân tay ổn định.
func Fingerprints(tokens []string) map[uint64]bool {
	out := map[uint64]bool{}
	if len(tokens) < simK {
		if len(tokens) > 0 {
			h := fnv.New64a()
			h.Write([]byte(strings.Join(tokens, "\x00")))
			out[h.Sum64()] = true
		}
		return out
	}
	hashes := make([]uint64, 0, len(tokens)-simK+1)
	for i := 0; i+simK <= len(tokens); i++ {
		h := fnv.New64a()
		h.Write([]byte(strings.Join(tokens[i:i+simK], "\x00")))
		hashes = append(hashes, h.Sum64())
	}
	if len(hashes) <= simWindow {
		for _, v := range hashes {
			out[v] = true
		}
		return out
	}
	for i := 0; i+simWindow <= len(hashes); i++ {
		min := hashes[i]
		for _, v := range hashes[i : i+simWindow] {
			if v < min {
				min = v
			}
		}
		out[min] = true
	}
	return out
}

// CompareAll trả các cặp có điểm ≥ minScore, sắp giảm dần, tối đa limit cặp.
// Dấu vân tay xuất hiện ở quá nhiều bài (thường là mã mẫu chung) bị bỏ qua để không báo động giả.
func CompareAll(docs []SimilarityDoc, minScore float64, limit int) []SimilarityPair {
	prints := make([]map[uint64]bool, len(docs))
	index := map[uint64][]int{}
	for i, d := range docs {
		prints[i] = Fingerprints(NormalizeTokens(d.Code, d.Language))
		for fp := range prints[i] {
			index[fp] = append(index[fp], i)
		}
	}
	common := int(math.Max(3, math.Ceil(0.05*float64(len(docs)))))
	shared := map[[2]int]int{}
	ignored := make([]map[uint64]bool, len(docs))
	for fp, owners := range index {
		if len(owners) > common {
			for _, o := range owners {
				if ignored[o] == nil {
					ignored[o] = map[uint64]bool{}
				}
				ignored[o][fp] = true
			}
			continue
		}
		for x := 0; x < len(owners); x++ {
			for y := x + 1; y < len(owners); y++ {
				shared[[2]int{owners[x], owners[y]}]++
			}
		}
	}
	size := func(i int) int { return len(prints[i]) - len(ignored[i]) }
	pairs := []SimilarityPair{}
	for key, n := range shared {
		a, b := size(key[0]), size(key[1])
		if a <= 0 || b <= 0 {
			continue
		}
		score := float64(n) / float64(a+b-n)
		if score < minScore {
			continue
		}
		pairs = append(pairs, SimilarityPair{A: docs[key[0]].ID, B: docs[key[1]].ID, Score: round3(score), Containment: round3(float64(n) / math.Min(float64(a), float64(b))), Shared: n})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].Score != pairs[j].Score {
			return pairs[i].Score > pairs[j].Score
		}
		return pairs[i].A+pairs[i].B < pairs[j].A+pairs[j].B
	})
	if len(pairs) > limit {
		pairs = pairs[:limit]
	}
	return pairs
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
