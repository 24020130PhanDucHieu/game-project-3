package http

import (
	"github.com/gin-gonic/gin"
	"math"
	"strings"
	"unicode/utf8"
)

func validBotPayload(c *gin.Context, req map[string]interface{}, draft bool) bool {
	code, ok := req["code_content"].(string)
	if !ok {
		code, ok = req["code"].(string)
	}
	if !ok || len(code) > 65536 || (!draft && strings.TrimSpace(code) == "") {
		c.JSON(400, gin.H{"detail": "Mã nguồn phải là văn bản, không để trống và tối đa 64 KB."})
		return false
	}
	lang, exists := req["language"]
	if exists && lang != "PYTHON" && lang != "CPP" {
		c.JSON(400, gin.H{"detail": "Ngôn ngữ hỗ trợ: Python hoặc C++."})
		return false
	}
	if note, exists := req["explanation"]; exists {
		text, ok := note.(string)
		if !ok || utf8.RuneCountInString(text) > 2000 {
			c.JSON(400, gin.H{"detail": "Giải thích tối đa 2.000 ký tự."})
			return false
		}
	}
	if round, exists := req["round_number"]; exists {
		n, ok := round.(float64)
		if !ok || n != math.Trunc(n) || n < 1 || n > 5 {
			c.JSON(400, gin.H{"detail": "Số hiệp phải từ 1 đến 5."})
			return false
		}
	}
	return true
}
