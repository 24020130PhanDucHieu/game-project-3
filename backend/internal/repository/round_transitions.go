package repository

import (
	"context"
	"time"
)

type RoundTransition struct{ TournamentID, MatchID string }

// Only IDs of due matches cross the database connection, never bot code or replays.
func (r *PostgresTournamentRepository) DueRoundTransitions(now float64) ([]RoundTransition, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := r.db.QueryContext(ctx, `SELECT t.id, m.key FROM tournaments t
	CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.data->'matches')='object' THEN t.data->'matches' ELSE '{}'::jsonb END) m
	WHERE m.value->>'round_status'='ROUND_FINISHED'
	AND CASE WHEN jsonb_typeof(m.value->'intermission_ends_at')='number'
	THEN (m.value->>'intermission_ends_at')::numeric ELSE 0 END > 0
	AND CASE WHEN jsonb_typeof(m.value->'intermission_ends_at')='number'
	THEN (m.value->>'intermission_ends_at')::numeric ELSE 0 END <= $1`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []RoundTransition{}
	for rows.Next() {
		var item RoundTransition
		if err := rows.Scan(&item.TournamentID, &item.MatchID); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

// Keep JSON repositories and test implementations on the same transition rules.
func DueRoundTransitions(repo TournamentRepository, now float64) ([]RoundTransition, error) {
	if projected, ok := repo.(interface {
		DueRoundTransitions(float64) ([]RoundTransition, error)
	}); ok {
		return projected.DueRoundTransitions(now)
	}
	result := []RoundTransition{}
	for tournamentID, raw := range repo.GetAll() {
		t, _ := raw.(map[string]interface{})
		matches, _ := t["matches"].(map[string]interface{})
		for matchID, rawMatch := range matches {
			match, _ := rawMatch.(map[string]interface{})
			deadline, _ := match["intermission_ends_at"].(float64)
			if match["round_status"] == "ROUND_FINISHED" && deadline > 0 && deadline <= now {
				result = append(result, RoundTransition{tournamentID, matchID})
			}
		}
	}
	return result, nil
}
