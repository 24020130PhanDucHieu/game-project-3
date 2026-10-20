package adapter

import (
	"context"
	"time"
)

// Reserve capacity before dispatch. A slow worker cannot accumulate an
// unbounded HTTP backlog while another worker is idle.
func (a *HTTPBotRunnerAdapter) acquireWorker(ctx context.Context, tried map[int]bool) (int, error) {
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	for {
		a.poolMu.Lock()
		start := int((a.next.Add(1) - 1) % uint64(len(a.workers)))
		best := -1
		for offset := range a.workers {
			i := (start + offset) % len(a.workers)
			if tried[i] || a.active[i] >= a.perWorker || time.Now().Before(a.cooldown[i]) {
				continue
			}
			if best < 0 || a.active[i] < a.active[best] {
				best = i
			}
		}
		if best >= 0 {
			a.active[best]++
			a.poolMu.Unlock()
			return best, nil
		}
		a.poolMu.Unlock()
		select {
		case <-ctx.Done():
			return -1, ctx.Err()
		case <-tick.C:
		}
	}
}

func (a *HTTPBotRunnerAdapter) releaseWorker(index int, failed bool) {
	a.poolMu.Lock()
	defer a.poolMu.Unlock()
	a.active[index]--
	if failed {
		a.cooldown[index] = time.Now().Add(2 * time.Second)
	}
}
