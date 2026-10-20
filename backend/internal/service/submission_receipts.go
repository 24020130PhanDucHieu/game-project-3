package service

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
)

// Main-bracket receipts live in the same durable snapshot as the code change.
// They contain only verdict metadata, never source, passwords or auth tokens.
func submissionReceipt(params map[string]interface{}) (string, string) {
	key, _ := params["_receipt_key"].(string)
	delete(params, "_receipt_key")
	if key == "" {
		return "", ""
	}
	raw, _ := json.Marshal(params)
	return key, fmt.Sprintf("%x", sha256.Sum256(raw))
}

func compactSubmissionReceipt(result map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for _, key := range []string{"status", "is_valid", "validation", "language"} {
		if value, ok := result[key]; ok {
			out[key] = value
		}
	}
	return out
}
