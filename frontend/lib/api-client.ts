/**
 * Client API kết nối với Go Backend Gateway cho BOT ARENA K69.
 * Hỗ trợ fallback offline, xác thực Bearer token, session persistence và sync outbox.
 */

const DEFAULT_REMOTE_API = 'https://arena.13.250.49.111.sslip.io'

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')
  if (
    window.location.hostname.endsWith('.workers.dev') ||
    window.location.hostname.endsWith('.pages.dev') ||
    window.location.origin === 'null' ||
    window.location.protocol === 'file:'
  ) {
    return DEFAULT_REMOTE_API
  }
  return window.location.origin
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('arenaSessionToken') || localStorage.getItem('arenaSessionToken')
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('arenaSessionToken', token)
  localStorage.setItem('arenaSessionToken', token)
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem('arenaSessionToken')
  localStorage.removeItem('arenaSessionToken')
  sessionStorage.removeItem('ARENA_STUDENT_ID')
  sessionStorage.removeItem('ARENA_TEAM_NAME')
  sessionStorage.setItem('ARENA_USER_ROLE', 'GUEST')
  localStorage.setItem('ARENA_USER_ROLE', 'GUEST')
  localStorage.removeItem('ARENA_STUDENT_ID')
  localStorage.removeItem('ARENA_TEAM_NAME')
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getApiBaseUrl()
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${base}${cleanEndpoint.startsWith('/api') ? cleanEndpoint : `/api${cleanEndpoint}`}`

  const token = getSessionToken()
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (token && response.status === 401 && !endpoint.includes('/login')) {
    clearSessionToken()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('arena-session-expired'))
    }
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
  }

  if (!response.ok) {
    let errorMsg = `Lỗi yêu cầu: ${response.status} ${response.statusText}`
    try {
      const data = await response.json()
      if (data.detail) errorMsg = data.detail
      else if (data.error) errorMsg = data.error
      else if (data.message) errorMsg = data.message
    } catch {}
    throw new Error(errorMsg)
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as unknown as T
}

// =============================================================================
// API SERVICE METHODS
// =============================================================================

export const arenaApi = {
  // --- AUTH ---
  async loginTeam(studentId: string, password: string) {
    const res = await apiRequest<{ session_token: string; team?: { team_name?: string; student_id?: string } }>(
      '/teams/login',
      {
        method: 'POST',
        body: JSON.stringify({ username: studentId, student_id: studentId, password }),
      },
    )
    if (!res.session_token) throw new Error('Máy chủ không trả phiên đăng nhập hợp lệ.')
    setSessionToken(res.session_token)
    return { team_name: res.team?.team_name, student_id: res.team?.student_id }
  },

  async loginAdmin(password: string) {
    const res = await apiRequest<{ session_token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    if (!res.session_token) throw new Error('Máy chủ không trả phiên quản trị hợp lệ.')
    setSessionToken(res.session_token)
    return res
  },

  async registerTeam(data: {
    student_id: string
    team_name: string
    password?: string
    contact_email?: string
    github_url?: string
  }) {
    return apiRequest('/teams/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async logout() {
    try {
      await apiRequest('/logout', { method: 'POST' })
    } finally {
      clearSessionToken()
    }
  },

  async getSession() {
    return apiRequest<{
      role: 'GUEST' | 'TEAM' | 'ADMIN'
      student_id?: string
      team_name?: string
      tournament_id?: string
      match_id?: string
    }>('/session', { cache: 'no-store' })
  },

  async forgotPassword(studentId: string, email: string) {
    return apiRequest('/accounts/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, email }),
    })
  },

  async resetPassword(studentId: string, code: string, newPass: string) {
    return apiRequest('/accounts/reset-password', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, reset_token: code, new_password: newPass }),
    })
  },

  // --- TOURNAMENTS ---
  async getTournaments() {
    return apiRequest('/tournaments')
  },

  async getTournamentList() {
    return apiRequest<any[]>('/tournaments/list', { cache: 'no-store' })
  },

  async getTournament(id: string) {
    return apiRequest(`/tournaments/${encodeURIComponent(id)}`, { cache: 'no-store' })
  },

  async createTournament(data: any) {
    return apiRequest('/tournaments/create', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async deleteTournament(id: string) {
    return apiRequest(`/tournaments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  async autoSchedule(tournamentId: string) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/auto-schedule`, {
      method: 'POST',
    })
  },

  async setStageSchedule(tournamentId: string, schedule: any) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/stage-schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    })
  },

  async setStageRules(tournamentId: string, rules: any, correction = false) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/stage-rules`, {
      method: 'PUT',
      body: JSON.stringify({ rules, correction }),
    })
  },

  async swapBracket(tournamentId: string, payload: { teamA: string; teamB: string }) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/swap-bracket`, {
      method: 'POST',
      body: JSON.stringify({ team_1: payload.teamA, team_2: payload.teamB }),
    })
  },

  async disqualifyTeam(tournamentId: string, payload: { student_id: string; reason: string }) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/disqualify-team`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // --- TEAMS ---
  async getTeams(tournamentId: string) {
    return apiRequest<any[]>(`/tournaments/${encodeURIComponent(tournamentId)}/teams`)
  },

  async addTeam(tournamentId: string, team: any) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/teams`, {
      method: 'POST',
      body: JSON.stringify(team),
    })
  },

  async removeTeam(tournamentId: string, studentId: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(studentId)}`,
      { method: 'DELETE' },
    )
  },

  async quickFillTeams(tournamentId: string) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/teams/quick-fill`, {
      method: 'POST',
    })
  },

  async getProfile(studentId: string) {
    return apiRequest(`/teams/profile?student_id=${encodeURIComponent(studentId)}`, {
      cache: 'no-store',
    })
  },

  async updateProfile(profile: any) {
    return apiRequest('/teams/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    })
  },

  // --- MATCH ACTIONS & SUBMISSIONS ---
  async selectTeamMatch(tournamentId: string, matchId: string) {
    const res = await apiRequest<{ session_token?: string; side?: string; team_name?: string }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/select`,
      { method: 'POST' },
    )
    if (res.session_token) {
      setSessionToken(res.session_token)
    }
    return res
  },

  async submitCode(tournamentId: string, matchId: string, payload: any) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/code`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async submitDraftCode(tournamentId: string, matchId: string, payload: any) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/draft-code`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async getSubmissions(tournamentId: string, matchId: string, role = '', studentId = '') {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/submissions?role=${encodeURIComponent(role)}&student_id=${encodeURIComponent(studentId)}`,
    )
  },

  async playRound(tournamentId: string, matchId: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/play-round`,
      { method: 'POST' },
    )
  },

  async nextRound(tournamentId: string, matchId: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/next-round`,
      { method: 'POST' },
    )
  },

  async demoFill(tournamentId: string, matchId: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/demo-fill`,
      { method: 'POST' },
    )
  },

  async resetMatch(tournamentId: string, matchId: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/reset`,
      { method: 'POST' },
    )
  },

  async correctMatch(tournamentId: string, matchId: string, payload: any) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/correction`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async getRoundReplay(tournamentId: string, matchId: string, roundNumber: number) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/replay/${roundNumber}`,
    )
  },

  async getMatchHistory() {
    return apiRequest('/matches/history')
  },

  // --- BOTS (VALIDATION & PRACTICE) ---
  async validateCode(codeContent: string, language = 'PYTHON', ruleId = 'STAGE_1_STANDARD') {
    return apiRequest('/bots/validate', {
      method: 'POST',
      body: JSON.stringify({ code_content: codeContent, language, rule_id: ruleId }),
    })
  },

  async practiceBot(payload: {
    code_content: string
    language: string
    boss_difficulty: 'RANDOM' | 'AGGRESSIVE' | 'ADAPTIVE'
  }) {
    return apiRequest('/bots/practice', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // --- QUALIFIERS ---
  async getQualifiers() {
    return apiRequest<any[]>('/qualifiers', { cache: 'no-store' })
  },

  async createQualifier(payload: Record<string, unknown>) {
    return apiRequest('/qualifiers', { method: 'POST', body: JSON.stringify(payload) })
  },

  async getQualifier(qid: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}`)
  },

  async registerQualifier(qid: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/register`, {
      method: 'POST',
      body: '{}',
    })
  },

  async submitQualifier(qid: string, payload: any) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/submissions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getQualifierRanking(qid: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/ranking`)
  },

  async qualifierAction(qid: string, action: string, payload: Record<string, unknown> = {}) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/actions/${encodeURIComponent(action)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async configureQualifier(qid: string, payload: Record<string, unknown>) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async getQualifierTeams(qid: string) {
    return apiRequest<{ items: any[]; total: number }>(`/qualifiers/${encodeURIComponent(qid)}/teams`)
  },

  async deleteQualifier(qid: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}`, {
      method: 'DELETE',
    })
  },

  // --- ADMIN & MONITORING ---
  async getAdminAccounts() {
    return apiRequest<any[]>('/admin/accounts')
  },

  async deleteAdminAccount(studentId: string) {
    return apiRequest(`/admin/accounts/${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
    })
  },

  async enrollAdminAccount(studentId: string, payload: any) {
    return apiRequest(`/admin/accounts/${encodeURIComponent(studentId)}/enroll`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getMonitoring() {
    return apiRequest('/admin/monitoring')
  },

  async optimizeDatabase() {
    return apiRequest('/admin/database/optimize', {
      method: 'POST',
    })
  },

  async broadcastNotification(payload: { title: string; message: string; link_tab?: string }) {
    return apiRequest('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getAuditLogs() {
    return apiRequest<{ logs: any[] }>('/admin/audit-logs')
  },

  // --- NOTIFICATIONS ---
  async getNotifications() {
    return apiRequest<{ notifications: any[]; unread_count: number }>('/notifications')
  },

  async markNotificationRead(id?: string) {
    return apiRequest('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : { all: true }),
    })
  },

  // --- RANKING & GITHUB ---
  async getRanking() {
    return apiRequest<any[]>('/ranking', { cache: 'no-store' })
  },

  async fetchGitHub(url: string, branch = 'main', filePath = 'bot.py') {
    return apiRequest<{ code: string; language: string }>('/github/fetch', {
      method: 'POST',
      body: JSON.stringify({ repo_url: url, branch, file_path: filePath }),
    })
  },

  async getCapabilities() {
    return apiRequest<{ languages: string[] }>('/capabilities')
  },
}
