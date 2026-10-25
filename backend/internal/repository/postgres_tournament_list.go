package repository

import (
	"context"
	"project-tuan3/internal/model"
	"time"
)

// Never download bot sources or match replays for the tournament picker.
// A database failure must not be returned as an empty, successful list.
func (r *PostgresTournamentRepository) GetListChecked() ([]model.TournamentSummary, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	rows, err := r.db.QueryContext(ctx, `SELECT id, name, num_teams, COALESCE(status,''), COALESCE(champion,''), COALESCE((data->>'created_at')::double precision,0), COALESCE(data->>'track','') FROM tournaments ORDER BY COALESCE((data->>'created_at')::double precision,0) DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.TournamentSummary{}
	for rows.Next() {
		var item model.TournamentSummary
		if err := rows.Scan(&item.TournamentID, &item.Name, &item.NumTeams, &item.Status, &item.Champion, &item.CreatedAt, &item.Track); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}
