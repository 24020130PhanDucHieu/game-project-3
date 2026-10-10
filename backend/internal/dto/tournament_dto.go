package dto

type CreateTournamentRequest struct {
	Name     string `json:"name" binding:"required"`
	NumTeams int    `json:"num_teams"`
}

type AddTeamRequest struct {
	TeamName   string `json:"team_name" binding:"required"`
	StudentID  string `json:"student_id" binding:"required"`
	University string `json:"university"`
}

type MatchLoginRequest struct {
	MatchID   string `json:"match_id"`
	StudentID string `json:"student_id" binding:"required"`
	Password  string `json:"password" binding:"required"`
}

type SubmitCodeRequest struct {
	MatchID     string `json:"match_id"`
	StudentID   string `json:"student_id" binding:"required"`
	Language    string `json:"language" binding:"required"`
	CodeContent string `json:"code_content" binding:"required"`
}

type MutateWorkerRequest struct {
	Tournament interface{}            `json:"tournament,omitempty"`
	Action     string                 `json:"action"`
	Params     map[string]interface{} `json:"params"`
}

type MutateWorkerResponse struct {
	Status     string                 `json:"status"`
	Tournament map[string]interface{} `json:"tournament"`
	Detail     string                 `json:"detail,omitempty"`
}

type APIResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}
