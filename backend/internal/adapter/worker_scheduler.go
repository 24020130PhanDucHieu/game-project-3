package adapter

import (
	"context"
	"strconv"
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
			if tried[i] || a.active[i] >= a.workerCapacity(i) || time.Now().Before(a.cooldown[i]) {
				continue
			}
			if best < 0 || a.active[i] < a.active[best] {
				best = i
			}
		}
		if best >= 0 {
			a.active[best]++
			a.dispatched[best]++
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

// Call with poolMu held. A worker can lower admission, never raise the configured ceiling.
func (a *HTTPBotRunnerAdapter) workerCapacity(i int) int {
	if a.reportedCapacity[i] > 0 {return min(a.perWorker,a.reportedCapacity[i])}
	return a.perWorker
}
func (a *HTTPBotRunnerAdapter) observeCapacity(i int, raw string) {
	if value,err:=strconv.Atoi(raw);err==nil && value>=1 && value<=8 {
		a.poolMu.Lock(); a.reportedCapacity[i]=value; a.poolMu.Unlock()
	}
}

func (a *HTTPBotRunnerAdapter) releaseWorker(index int, failed bool) {
	a.poolMu.Lock()
	defer a.poolMu.Unlock()
	a.active[index]--
	a.finished[index]++
	if failed {
		a.failed[index]++
		a.cooldown[index] = time.Now().Add(2 * time.Second)
	}
}
