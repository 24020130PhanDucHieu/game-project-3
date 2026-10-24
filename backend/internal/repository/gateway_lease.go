package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"time"
)

// Thời hạn khoá ghi: gateway đang chạy gia hạn mỗi leaseRenew; gateway chết thì khoá tự hết hạn sau leaseTTL.
const (
	leaseTTL   = 15 * time.Second
	leaseRenew = 3 * time.Second
	leaseWait  = 30 * time.Second
)

// Tournament snapshots are cached by a single writer. Refuse a second gateway
// rather than silently losing updates. Scale stateless workers separately.
//
// Khoá được lưu thành một dòng có hạn dùng trong bảng thay vì advisory lock của Postgres:
// advisory lock gắn với phiên kết nối, mà pooler của Supabase có thể giữ phiên đó sống sau khi
// gateway cũ đã tắt, làm gateway mới không bao giờ lấy được khoá (web sập sau deploy).
func (s *QualifierRecords) GatewayLease() (<-chan error, error) {
	lost := make(chan error, 1)
	if s.db == nil {
		return lost, nil
	}
	holder := gatewayID()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	_, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS arena_gateway_lease (
		id INT PRIMARY KEY, holder TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`)
	cancel()
	if err != nil {
		return nil, err
	}

	claim := func() (bool, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var got string
		err := s.db.QueryRowContext(ctx, `
INSERT INTO arena_gateway_lease (id, holder, expires_at) VALUES (1, $1, now() + $2::interval)
ON CONFLICT (id) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
WHERE arena_gateway_lease.expires_at < now() OR arena_gateway_lease.holder = EXCLUDED.holder
   OR arena_gateway_lease.holder LIKE EXCLUDED.holder || ':%'
RETURNING holder`, holder, fmt.Sprintf("%d seconds", int(leaseTTL.Seconds()))).Scan(&got)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return false, nil
			}
			return false, err
		}
		return got == holder, nil
	}

	deadline := time.Now().Add(leaseWait)
	for {
		ok, err := claim()
		if err == nil && ok {
			break
		}
		if time.Now().After(deadline) {
			if err != nil {
				return nil, fmt.Errorf("database unavailable for the gateway writer lease: %w", err)
			}
			var other string
			var expires time.Time
			var now time.Time
			probe, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = s.db.QueryRowContext(probe, `SELECT holder, expires_at, now() FROM arena_gateway_lease WHERE id = 1`).Scan(&other, &expires, &now)
			cancel()
			return nil, fmt.Errorf("another Arena gateway holds the database writer lease (holder %q, this gateway %q, expires in %s)", other, holder, expires.Sub(now).Round(time.Second))
		}
		time.Sleep(time.Second)
	}

	go func() {
		ticker := time.NewTicker(leaseRenew)
		defer ticker.Stop()
		lastOK := time.Now()
		for range ticker.C {
			ok, err := claim()
			if err == nil && ok {
				lastOK = time.Now()
				continue
			}
			if err == nil && !ok {
				lost <- errors.New("database writer lease taken by another gateway")
				return
			}
			// Mất kết nối tạm thời: chỉ bỏ khoá khi đã quá hạn dùng, để không gateway nào ghi song song.
			if time.Since(lastOK) > leaseTTL-leaseRenew {
				lost <- fmt.Errorf("database writer lease could not be renewed: %w", err)
				return
			}
		}
	}()
	return lost, nil
}

// gatewayID định danh khoá theo MÁY (GATEWAY_ID hoặc hostname), không theo tiến trình: gateway khởi động lại
// trên cùng máy (deploy, systemd restart) lấy lại khoá của chính nó ngay, còn gateway trên máy khác vẫn bị chặn.
func gatewayID() string {
	if id := os.Getenv("GATEWAY_ID"); id != "" {
		return id
	}
	host, err := os.Hostname()
	if err != nil || host == "" {
		nonce := make([]byte, 6)
		_, _ = rand.Read(nonce)
		return "gateway-" + hex.EncodeToString(nonce)
	}
	return host
}

// ReleaseGatewayLease nhả khoá khi gateway tắt có kiểm soát, để gateway trên máy khác (dự phòng) lên ngay.
func (s *QualifierRecords) ReleaseGatewayLease() {
	if s.db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _ = s.db.ExecContext(ctx, `DELETE FROM arena_gateway_lease WHERE id = 1 AND holder = $1`, gatewayID())
}
