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

  // Yêu cầu treo (mạng chập chờn, máy chủ quá tải) không được kẹt mãi: quá hạn thì hủy và báo lỗi để giao diện tự thử lại,
  // thay vì để màn hình đứng đến khi người dùng bấm tải lại trang. Đọc dữ liệu 30 giây; ghi/chấm bài (có thể chạy lâu) 130 giây.
  const isRead = !options.method || options.method.toUpperCase() === 'GET'
  const limitMs = isRead ? 30_000 : 130_000
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, limitMs)
  const outer = options.signal
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    return await send()
  } catch (error) {
    if (timedOut) {
      const e = new Error('Máy chủ phản hồi quá chậm. Hãy thử lại sau ít giây.') as Error & { status?: number }
      e.status = 504
      throw e
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  async function send(): Promise<T> {
  // Mạng chập chờn (Wi-Fi rớt, phần mềm diệt virus ngắt kết nối): thử lại vài lần trước khi báo lỗi.
  // Chỉ thử lại khi yêu cầu chưa tới được máy chủ (fetch ném TypeError), nên không gửi trùng.
  let response: Response | undefined
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url, { ...options, headers, signal: controller.signal })
      break
    } catch (error) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      // Không gửi lại câu hỏi AI tự động: lỗi mạng có thể xảy ra sau khi máy chủ đã nhận câu hỏi.
      const isAiAsk = cleanEndpoint === '/ai/ask' || cleanEndpoint === '/api/ai/ask'
      if (isAiAsk || attempt >= 3 || offline || controller.signal.aborted || !(error instanceof TypeError)) throw error
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt))
    }
  }

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
    const error = new Error(errorMsg) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as unknown as T
  }
}

// =============================================================================
// API SERVICE METHODS
// =============================================================================

/** Một trận làm đổi ELO giải chính của đội. */
export type MainEloEvent = {
  tournament_id: string; tournament_name: string; match_id: string; round_name: string; at: number
  opponent_id: string; opponent_name: string; result: 'win' | 'loss'; score: string
  before: number; after: number; delta: number; expected: number
  /** Chi tiết cách tính (có ở các trận mới): ELO đối thủ trước trận, hệ số K, hệ số thưởng tỉ số, điểm từng hiệp đề ML. */
  opponent_before?: number; k?: number; margin?: number
  rounds?: { n: number; task_name: string; my_score: number; opp_score: number; won: boolean; tie?: boolean }[]
}

/** Nguồn dẫn của một câu trả lời AI: đoạn trích nguyên văn từ tài liệu hoặc dữ liệu thật của giải. */
export type AiSource = { id: string; title: string; quote: string; link: string }
export type AiAnswer = { answer: string; needs_human: boolean; sources: AiSource[]; remaining: number; cached: boolean }
export type AiLogEntry = { id: string; at: number; student_id: string; team_name: string; role: string; question: string; answer: string; needs_human: boolean; reason?: string; source_ids?: string[]; tools?: string[]; tokens: number; cached: boolean }
export type AiSettings = { enabled: boolean; per_team: number; daily_tokens: number }

export const arenaApi = {
  // --- AUTH ---
  async humanChallenge() {
    return apiRequest<{ challenge: string; difficulty: number; required: boolean }>('/auth/human-challenge')
  },

  /** `login` là MSSV hoặc email đã đăng ký của đội. */
  async loginTeam(login: string, password: string, proof?: { human_challenge: string; human_solution: string } | null) {
    const res = await apiRequest<{ session_token: string; team?: { team_name?: string; student_id?: string } }>(
      '/teams/login',
      {
        method: 'POST',
        body: JSON.stringify({ username: login, student_id: login, password, ...(proof || {}) }),
      },
    )
    if (!res.session_token) throw new Error('Máy chủ không trả phiên đăng nhập hợp lệ.')
    setSessionToken(res.session_token)
    return { team_name: res.team?.team_name, student_id: res.team?.student_id }
  },

  async loginAdmin(password: string, username = '', proof?: { human_challenge: string; human_solution: string } | null) {
    const res = await apiRequest<{ session_token: string; judge?: string; display_name?: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ ...(username ? { username } : {}), password, ...(proof || {}) }),
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
    email?: string
    github_url?: string
    human_challenge?: string
    human_solution?: string
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
      judge?: string
      display_name?: string
      owner?: boolean
    }>('/session', { cache: 'no-store' })
  },

  async forgotPassword(studentId: string, email: string, proof?: { human_challenge: string; human_solution: string } | null) {
    return apiRequest('/accounts/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, email, ...(proof || {}) }),
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

  async submitCode(tournamentId: string, matchId: string, payload: any, submissionId?: string) {
    return apiRequest(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/code`,
      {
        method: 'POST',
        headers: submissionId ? { 'X-Submission-Id': submissionId } : undefined,
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
    return apiRequest<any[]>('/matches/history', { cache: 'no-store' })
  },

  async getServerTime() {
    return apiRequest<{ server_time_ms: number }>('/time', { cache: 'no-store' })
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
    boss: 'RANDOM' | 'AGGRESSIVE' | 'ADAPTIVE'
    side?: 'team_a' | 'team_b'
    rule_id?: string
  }) {
    return apiRequest('/bots/practice', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // --- GIẢI AI ---
  async getAiCupEvents() {
    return apiRequest<any[]>('/ai-cup/events', { cache: 'no-store' })
  },
  async getAiCupProblem(qid: string) {
    return apiRequest<any>(`/ai-cup/${encodeURIComponent(qid)}/problem`, { cache: 'no-store' })
  },
  aiCupDatasetUrl(qid: string) {
    return `${getApiBaseUrl()}/api/ai-cup/${encodeURIComponent(qid)}/dataset`
  },
  async getAiCupLeaderboard(qid: string, board: 'public' | 'private') {
    return apiRequest<any>(`/ai-cup/${encodeURIComponent(qid)}/leaderboard?board=${board}`, { cache: 'no-store' })
  },
  async getAiCupMine(qid: string, studentId = '') {
    const q = studentId ? `?student_id=${encodeURIComponent(studentId)}` : ''
    return apiRequest<any>(`/ai-cup/${encodeURIComponent(qid)}/mine${q}`, { cache: 'no-store' })
  },
  async saveAiModelCard(qid: string, payload: { technique: string; model_card: string }) {
    return apiRequest(`/ai-cup/${encodeURIComponent(qid)}/model-card`, { method: 'PUT', body: JSON.stringify(payload) })
  },

  // Giải AI: kho đề học từ thế cờ, bốc đề, dữ liệu từng đề
  async getAiBank() {
    return apiRequest<{ entries: any[]; templates: { id: string; name: string; kind: string }[]; policies: string[] }>('/ai-bank', { cache: 'no-store' })
  },
  async createAiBankEntry(entry: Record<string, unknown>) {
    return apiRequest<{ entry: any }>('/ai-bank', { method: 'POST', body: JSON.stringify(entry) })
  },
  async updateAiBankEntry(id: string, patch: Record<string, unknown>) {
    return apiRequest(`/ai-bank/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) })
  },
  async deleteAiBankEntry(id: string) {
    return apiRequest(`/ai-bank/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  async probeAiBankEntry(entry: Record<string, unknown>) {
    return apiRequest<any>('/ai-bank/probe', { method: 'POST', body: JSON.stringify(entry) })
  },
  async getAiCupTasks(qid: string) {
    return apiRequest<{ tasks: any[]; locked: boolean; count: number }>(`/ai-cup/${encodeURIComponent(qid)}/tasks`, { cache: 'no-store' })
  },
  async getAiCupTaskData(qid: string, n: number) {
    return apiRequest<{ kind: string; meta: any; train: { X: any[]; y: number[] } }>(`/ai-cup/${encodeURIComponent(qid)}/tasks/${n}/data`)
  },
  aiCupTaskDataUrl(qid: string, n: number) {
    return `${getApiBaseUrl()}/api/ai-cup/${encodeURIComponent(qid)}/tasks/${n}/data`
  },
  async rollAiCupTasks(qid: string, payload: { tags?: string[]; difficulties?: number[]; index?: number } = {}) {
    return apiRequest<{ tasks: any[]; locked: boolean }>(`/ai-cup/${encodeURIComponent(qid)}/tasks/roll`, { method: 'POST', body: JSON.stringify(payload) })
  },
  async lockAiCupTasks(qid: string, lock: boolean) {
    return apiRequest(`/ai-cup/${encodeURIComponent(qid)}/tasks/${lock ? 'lock' : 'unlock'}`, { method: 'POST' })
  },

  // Giải chính AI chế độ hiệp đề ML
  async getAiMainTasks(tid: string) {
    return apiRequest<{ locked: boolean; levels: Record<string, any[]>; level_count: number; rounds: number }>(`/ai-main/${encodeURIComponent(tid)}/tasks`, { cache: 'no-store' })
  },
  async rollAiMainTasks(tid: string, payload: { tags?: string[]; difficulties?: number[]; level?: number; index?: number } = {}) {
    return apiRequest<any>(`/ai-main/${encodeURIComponent(tid)}/tasks/roll`, { method: 'POST', body: JSON.stringify(payload) })
  },
  async lockAiMainTasks(tid: string, lock: boolean) {
    return apiRequest<any>(`/ai-main/${encodeURIComponent(tid)}/tasks/${lock ? 'lock' : 'unlock'}`, { method: 'POST' })
  },
  async getAiMainMatchTask(tid: string, mid: string) {
    return apiRequest<{ kind: string; meta: any; train: { X: any[]; y: number[] } }>(`/ai-main/${encodeURIComponent(tid)}/matches/${encodeURIComponent(mid)}/task`, { cache: 'no-store' })
  },

  // Giải chính AI: báo cáo kỹ thuật, chấm rubric, huy hiệu
  async getAiMainReport(tid: string) {
    return apiRequest<any>(`/ai-main/${encodeURIComponent(tid)}/report`, { cache: 'no-store' })
  },
  async saveAiMainReport(tid: string, payload: { summary: string; repo_url: string }) {
    return apiRequest(`/ai-main/${encodeURIComponent(tid)}/report`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  async getAiMainScoreboard(tid: string) {
    return apiRequest<any>(`/ai-main/${encodeURIComponent(tid)}/scoreboard`, { cache: 'no-store' })
  },
  async getAiMainReports(tid: string) {
    return apiRequest<any>(`/ai-main/${encodeURIComponent(tid)}/reports`, { cache: 'no-store' })
  },
  async scoreAiMainReport(tid: string, sid: string, payload: { scores: number[]; comment: string }) {
    return apiRequest(`/ai-main/${encodeURIComponent(tid)}/reports/${encodeURIComponent(sid)}/score`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  async configAiMainReport(tid: string, payload: { deadline: number; published: boolean }) {
    return apiRequest(`/ai-main/${encodeURIComponent(tid)}/report-config`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  async getAiBadges(sid: string) {
    return apiRequest<{ student_id: string; items: { id: string; name: string; desc: string; tone: string; source: string }[] }>(`/ai-badges/${encodeURIComponent(sid)}`, { cache: 'no-store' })
  },

  // --- QUALIFIERS ---
  async getQualifiers() {
    return apiRequest<any[]>('/qualifiers', { cache: 'no-store' })
  },

  async createQualifier(payload: Record<string, unknown>) {
    return apiRequest('/qualifiers', { method: 'POST', body: JSON.stringify(payload) })
  },

  async getQualifier(qid: string, studentId = '') {
    const query = studentId ? `?student_id=${encodeURIComponent(studentId)}` : ''
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}${query}`, { cache: 'no-store' })
  },

  async registerQualifier(qid: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/register`, {
      method: 'POST',
      body: '{}',
    })
  },

  async submitQualifier(qid: string, payload: any, submissionId?: string) {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/submissions`, {
      method: 'POST',
      headers: submissionId ? { 'X-Submission-Id': submissionId } : undefined,
      body: JSON.stringify(payload),
    })
  },

  async getQualifierRanking(qid: string, page = 1) {
    return apiRequest<{ items: any[]; total: number; page: number; page_size: number }>(
      `/qualifiers/${encodeURIComponent(qid)}/ranking?page=${page}`,
      { cache: 'no-store' },
    )
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

  async getQualifierTeams(qid: string, opts: { page?: number; q?: string; filter?: string } = {}) {
    const params = new URLSearchParams({ page: String(opts.page || 1) })
    if (opts.q) params.set('q', opts.q)
    if (opts.filter) params.set('filter', opts.filter)
    return apiRequest<{ items: any[]; total: number; page: number; page_size: number }>(
      `/qualifiers/${encodeURIComponent(qid)}/teams?${params}`,
      { cache: 'no-store' },
    )
  },

  /** Lịch sử tính điểm cả vòng loại (admin): mọi trận đã chấm kèm ELO trước/sau. */
  async getQualifierResults(qid: string, studentId = '') {
    const q = studentId ? `?student_id=${encodeURIComponent(studentId)}` : ''
    return apiRequest<{ items: any[]; total: number }>(`/qualifiers/${encodeURIComponent(qid)}/results${q}`)
  },

  async setQualifierBan(qid: string, studentId: string, banned: boolean, reason = '') {
    return apiRequest(`/qualifiers/${encodeURIComponent(qid)}/actions/${banned ? 'ban' : 'unban'}`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, reason }),
    })
  },

  async changePassword(current: string, next: string) {
    return apiRequest<{ message?: string }>('/teams/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: next }),
    })
  },

  /** Ảnh camera định kỳ của đội trong trận (JPEG nhỏ). */
  async uploadSnapshot(tournamentId: string, matchId: string, image: Blob) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: image,
    })
  },

  async getSnapshots(tournamentId: string, matchId: string, round: number) {
    return apiRequest<{ round: number; items: { side: 'team_a' | 'team_b'; at: number; file: string }[] }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/snapshots?round=${round}`)
  },

  /** Ảnh cần token nên tải bằng fetch rồi tạo object URL (thẻ <img> không gửi được Authorization). */
  async snapshotUrl(tournamentId: string, matchId: string, file: string) {
    const token = getSessionToken()
    const res = await fetch(`${getApiBaseUrl()}/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/snapshots/file?path=${encodeURIComponent(file)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error(`Không tải được ảnh camera (${res.status})`)
    return URL.createObjectURL(await res.blob())
  },

  /** Video ngắn của một hiệp, gửi từng mảnh theo thứ tự `seq` (server nối các mảnh lại thành một tệp phát được). */
  async uploadClipPart(tournamentId: string, matchId: string, round: number, seq: number, mime: string, part: Blob) {
    return apiRequest(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/clips?round=${round}&seq=${seq}&mime=${encodeURIComponent(mime)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: part,
    })
  },

  async getClips(tournamentId: string, matchId: string, round: number) {
    return apiRequest<{ round: number; items: { side: 'team_a' | 'team_b'; file: string; bytes?: number; mime?: string }[] }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/clips?round=${round}`, { cache: 'no-store' })
  },

  async clipUrl(tournamentId: string, matchId: string, file: string) {
    const token = getSessionToken()
    const res = await fetch(`${getApiBaseUrl()}/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/clips/file?path=${encodeURIComponent(file)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error(`Không tải được video camera (${res.status})`)
    return URL.createObjectURL(await res.blob())
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

  async importAccounts(rows: { student_id: string; team_name: string; password?: string; email?: string }[], tournamentId?: string) {
    return apiRequest<{ created: number; enrolled: number; results: any[] }>('/admin/accounts/import', {
      method: 'POST',
      body: JSON.stringify({ rows, tournament_id: tournamentId }),
    })
  },

  async deleteAdminAccount(studentId: string) {
    return apiRequest(`/admin/accounts/${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
    })
  },

  async getAdminEnrollments() {
    return apiRequest<any>('/admin/accounts/enrollments', { cache: 'no-store' })
  },

  async enrollAdminAccount(studentId: string, payload: any) {
    return apiRequest(`/admin/accounts/${encodeURIComponent(studentId)}/enroll`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getMonitoring(tournamentId = '') {
    const query = tournamentId ? `?tournament_id=${encodeURIComponent(tournamentId)}` : ''
    return apiRequest<any>(`/admin/monitoring${query}`, { cache: 'no-store' })
  },

  async optimizeDatabase() {
    return apiRequest('/admin/database/optimize', {
      method: 'POST',
    })
  },

  async getMainEloHistory(studentId: string, track: '' | 'ai' = '') {
    return apiRequest<{ student_id: string; team_name?: string; start: number; rating: number; played: number; wins: number; k_factor?: number; formula?: { base: number; k: number; start: number; zero_sum?: boolean; margin?: Record<string, number> }; events: MainEloEvent[] }>(`/ranking/elo-history?student_id=${encodeURIComponent(studentId)}${track ? `&track=${track}` : ''}`)
  },

  async askAi(question: string, tournamentId?: string, signal?: AbortSignal) {
    return apiRequest<AiAnswer>('/ai/ask', { method: 'POST', signal, body: JSON.stringify({ question, tournament_id: tournamentId || '' }) })
  },

  async getAiUsage() {
    return apiRequest<{ available: boolean; used: number; limit: number; remaining: number }>('/ai/usage')
  },

  async getAiSettings() {
    return apiRequest<{ available: boolean; settings: AiSettings; tokens_today: number; asked_today: number; needs_human_today: number; model: string; kb_version: string; last_error?: string; last_error_at?: number }>('/ai/settings')
  },

  async saveAiSettings(body: AiSettings) {
    return apiRequest<{ settings: AiSettings }>('/ai/settings', { method: 'PUT', body: JSON.stringify(body) })
  },

  async getAiLog(onlyHuman = false) {
    return apiRequest<{ items: AiLogEntry[] }>(`/ai/log?days=3${onlyHuman ? '&only=human' : ''}`)
  },

  async getCertificates(tournamentId?: string) {
    return apiRequest<{ items: import('./certificate').CertificateData[] }>(`/certificates${tournamentId ? `?tournament_id=${encodeURIComponent(tournamentId)}` : ''}`)
  },

  async saveCertificates(tournamentId: string, body: { org: string; signer: string; date: string }) {
    return apiRequest<{ items: import('./certificate').CertificateData[]; notified: number }>(`/tournaments/${encodeURIComponent(tournamentId)}/certificates`, { method: 'PUT', body: JSON.stringify(body) })
  },

  async broadcastNotification(payload: { title: string; message: string; link_tab?: string }) {
    return apiRequest('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async viewAccountPassword(studentId: string) {
    return apiRequest<{ password: string }>(`/admin/accounts/${encodeURIComponent(studentId)}/password`, { cache: 'no-store' })
  },

  async getTeamEmail() {
    return apiRequest<{ has_email: boolean; email_masked: string }>('/teams/email', { cache: 'no-store' })
  },

  async setTeamEmail(email: string) {
    return apiRequest<{ has_email: boolean; email_masked: string }>('/teams/email', { method: 'PUT', body: JSON.stringify({ email }) })
  },

  async getJudges() {
    return apiRequest<{ items: any[] }>('/admin/judges', { cache: 'no-store' })
  },

  async createJudge(payload: { username: string; display_name: string; password: string; email?: string }) {
    return apiRequest('/admin/judges', { method: 'POST', body: JSON.stringify(payload) })
  },

  async setJudgeEmail(username: string, email: string) {
    return apiRequest(`/admin/judges/${encodeURIComponent(username)}/email`, { method: 'PUT', body: JSON.stringify({ email }) })
  },

  // --- ĐỔI / ĐẶT LẠI MẬT KHẨU QUẢN TRỊ (mật khẩu hiện tại + mã gửi email) ---
  async requestAdminPasswordCode(currentPassword: string) {
    return apiRequest<{ sent_to: string; expires_in: number; resend_after: number }>('/admin/password/request', { method: 'POST', body: JSON.stringify({ current_password: currentPassword }) })
  },

  async changeAdminPassword(payload: { current_password: string; code: string; new_password: string }) {
    const res = await apiRequest<{ session_token: string; message?: string }>('/admin/password/change', { method: 'POST', body: JSON.stringify(payload) })
    if (res.session_token) setSessionToken(res.session_token) // phiên cũ đã bị thu hồi, dùng phiên mới
    return res
  },

  async forgotAdminPassword(proof?: { human_challenge: string; human_solution: string } | null) {
    return apiRequest<{ message?: string; expires_in?: number }>('/admin/password/forgot', { method: 'POST', body: JSON.stringify({ ...(proof || {}) }) })
  },

  async resetAdminPassword(code: string, newPassword: string) {
    return apiRequest<{ message?: string }>('/admin/password/reset', { method: 'POST', body: JSON.stringify({ code, new_password: newPassword }) })
  },

  async judgeAction(username: string, action: 'disable' | 'enable' | 'reset-password', password?: string) {
    return apiRequest(`/admin/judges/${encodeURIComponent(username)}/${action}`, { method: 'POST', body: JSON.stringify(password ? { password } : {}) })
  },

  // --- HỎI ĐÁP BTC ---
  async getClarifications(opts: { page?: number; status?: string } = {}) {
    const params = new URLSearchParams({ page: String(opts.page || 1) })
    if (opts.status) params.set('status', opts.status)
    return apiRequest<{ items: any[]; total: number; page: number; page_size: number; open?: number }>(`/clarifications?${params}`, { cache: 'no-store' })
  },

  async askClarification(payload: { topic: string; question: string; tournament_id?: string }) {
    return apiRequest('/clarifications', { method: 'POST', body: JSON.stringify(payload) })
  },

  async answerClarification(id: string, payload: { answer: string; public: boolean; status?: 'ANSWERED' | 'REJECTED' }) {
    return apiRequest(`/admin/clarifications/${encodeURIComponent(id)}/answer`, { method: 'POST', body: JSON.stringify(payload) })
  },

  // --- GIAO HỮU ---
  async getScrimmages() {
    return apiRequest<{ items: any[]; accept: boolean }>('/scrimmages', { cache: 'no-store' })
  },

  async createScrimmage(payload: { qualifier_id: string; opponent_student_id: string; rule_id?: string; code?: string; language?: string }) {
    return apiRequest<{ scrimmage: any; board_steps: any[]; my_bot_error?: string }>('/scrimmages', { method: 'POST', body: JSON.stringify(payload) })
  },

  async getScrimmage(id: string) {
    return apiRequest<{ scrimmage: any; board_steps: any[] }>(`/scrimmages/${encodeURIComponent(id)}`, { cache: 'no-store' })
  },

  async setScrimmageAccept(accept: boolean) {
    return apiRequest('/scrimmages/settings', { method: 'PUT', body: JSON.stringify({ accept }) })
  },

  // --- THỬ THÁCH & HUY HIỆU ---
  async getChallenges() {
    return apiRequest<{ items: any[]; passed: number; total: number }>('/challenges', { cache: 'no-store' })
  },

  async attemptChallenge(id: string, payload: { code: string; language: string }) {
    return apiRequest<any>(`/challenges/${encodeURIComponent(id)}/attempt`, { method: 'POST', body: JSON.stringify(payload) })
  },

  async getBadges(studentId: string) {
    return apiRequest<{ items: any[] }>(`/badges/${encodeURIComponent(studentId)}`)
  },

  // --- CHỐNG GIAN LẬN ---
  async getSimilarity(source: 'qualifier' | 'tournament', id: string, min = 0.7) {
    return apiRequest<{ pairs: any[]; documents: number }>(`/admin/similarity?source=${source}&id=${encodeURIComponent(id)}&min=${min}`, { cache: 'no-store' })
  },

  async getSimilarityPair(source: string, id: string, a: string, b: string) {
    return apiRequest<{ a: any; b: any }>(`/admin/similarity/pair?source=${source}&id=${encodeURIComponent(id)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { cache: 'no-store' })
  },

  async reviewSimilarity(payload: { source: string; id: string; a: string; b: string; status: 'CLEARED' | 'SUSPECT'; note?: string }) {
    return apiRequest('/admin/similarity/review', { method: 'POST', body: JSON.stringify(payload) })
  },

  async getAuditLogs(tournamentId = '') {
    const query = tournamentId ? `?tournament_id=${encodeURIComponent(tournamentId)}` : ''
    return apiRequest<{ logs: any[] }>(`/admin/audit-logs${query}`, { cache: 'no-store' })
  },

  // --- NOTIFICATIONS ---
  async getNotifications() {
    return apiRequest<{ notifications: any[]; unread_count: number }>('/notifications', { cache: 'no-store' })
  },

  async markNotificationRead(id?: string) {
    return apiRequest('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : { all: true }),
    })
  },

  // --- RANKING & GITHUB ---
  async getRanking(track: '' | 'ai' = '') {
    return apiRequest<any[]>(`/ranking${track ? `?track=${track}` : ''}`, { cache: 'no-store' })
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
