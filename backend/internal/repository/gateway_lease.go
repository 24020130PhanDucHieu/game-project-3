package repository

import (
	"context"
	"errors"
	"time"
)

// Tournament snapshots are cached by a single writer. Refuse a second gateway
// rather than silently losing updates. Scale stateless workers separately.
func (s *QualifierRecords) GatewayLease() (<-chan error, error) {
	lost := make(chan error, 1)
	if s.db == nil {
		return lost, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	var acquired bool
	err = conn.QueryRowContext(ctx, `SELECT pg_try_advisory_lock(724615902361)`).Scan(&acquired)
	if err != nil || !acquired {
		conn.Close()
		return nil, errors.New("another Arena gateway holds the database writer lease, or the database is unavailable")
	}
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		defer conn.Close()
		for range ticker.C {
			probe, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			err := conn.PingContext(probe)
			cancel()
			if err != nil {
				lost <- errors.New("database writer lease connection lost")
				return
			}
		}
	}()
	return lost, nil
}
