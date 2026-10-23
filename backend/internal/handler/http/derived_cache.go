package http

import (
	"sync"
	"time"
)

// derivedCache giữ kết quả tổng hợp đắt (xếp hạng, lịch sử trận) vốn phải quét mọi giải.
// Dữ liệu bị bỏ khi có thao tác ghi (InvalidateDerived) và tự hết hạn sau derivedTTL
// để những thay đổi không đi qua HTTP (chuyển hiệp tự động, khôi phục) vẫn hiện ra.
const derivedTTL = 5 * time.Second

type derivedEntry struct {
	value   interface{}
	expires time.Time
	version uint64
}

var derived = struct {
	sync.Mutex
	version uint64
	items   map[string]derivedEntry
}{items: map[string]derivedEntry{}}

func derivedGet(key string) (interface{}, bool) {
	derived.Lock()
	defer derived.Unlock()
	entry, ok := derived.items[key]
	if !ok || entry.version != derived.version || time.Now().After(entry.expires) {
		return nil, false
	}
	return entry.value, true
}

// derivedSet chỉ lưu nếu không có thao tác ghi nào xen vào trong lúc tính (startVersion).
func derivedSet(key string, startVersion uint64, value interface{}) {
	derived.Lock()
	defer derived.Unlock()
	if startVersion != derived.version {
		return
	}
	derived.items[key] = derivedEntry{value: value, expires: time.Now().Add(derivedTTL), version: startVersion}
}

func derivedVersion() uint64 {
	derived.Lock()
	defer derived.Unlock()
	return derived.version
}

// InvalidateDerived được gọi sau mọi thao tác ghi thành công và khi engine đổi trạng thái hiệp.
func InvalidateDerived() {
	derived.Lock()
	derived.version++
	derived.Unlock()
}
