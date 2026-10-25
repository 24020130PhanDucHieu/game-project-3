package model

type TournamentSummary struct {
	TournamentID string  `json:"tournament_id"`
	Name         string  `json:"name"`
	NumTeams     int     `json:"num_teams"`
	CreatedAt    float64 `json:"created_at,omitempty"`
	Status       string  `json:"status,omitempty"`
	Champion     string  `json:"champion,omitempty"`
	// Track là "AI" cho giải chính của Giải AI; rỗng cho giải thường.
	Track string `json:"track,omitempty"`
}

type Tournament struct {
	TournamentID string                 `json:"tournament_id"`
	Name         string                 `json:"name"`
	NumTeams     int                    `json:"num_teams"`
	Teams        []Team                 `json:"teams,omitempty"`
	Matches      []Match                `json:"matches,omitempty"`
	Status       string                 `json:"status,omitempty"`
	CreatedAt    string                 `json:"created_at,omitempty"`
	RawData      map[string]interface{} `json:"raw_data,omitempty"`
}

type Team struct {
	TeamID     string `json:"team_id"`
	TeamName   string `json:"team_name"`
	StudentID  string `json:"student_id"`
	University string `json:"university,omitempty"`
	Rating     int    `json:"rating,omitempty"`
}

type Match struct {
	MatchID     string      `json:"match_id"`
	RoundNumber int         `json:"round_number"`
	TeamA       interface{} `json:"team_a"`
	TeamB       interface{} `json:"team_b"`
	Winner      string      `json:"winner,omitempty"`
	Status      string      `json:"status"`
}
