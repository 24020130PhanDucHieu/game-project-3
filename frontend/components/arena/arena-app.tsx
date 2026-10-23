'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { arenaApi, getSessionToken } from '@/lib/api-client'
import { createTournamentSocket } from '@/lib/match-socket'
import { AuthModal, type AuthModalMode } from './modals/auth-modal'

type Role = 'GUEST' | 'TEAM' | 'ADMIN'
type View = 'overview' | 'bracket' | 'match' | 'qualifier' | 'ranking' | 'profile' | 'notifications' | 'admin' | 'practice'
type TournamentSummary = { tournament_id: string; name: string; status?: string; num_teams?: number }
type Session = { role: Role; student_id?: string; team_name?: string; tournament_id?: string; match_id?: string }
type Qualifier = { id: string; name: string; status: string; deadline?: number; rounds?: number; top_k?: number; current_round?: number; git_mode?: boolean }
type Match = { match_id: string; title?: string; round_name?: string; round_level?: number; status?: string; round_status?: string; current_round_idx?: number; team_a?: { student_id?: string; team_name?: string }; team_b?: { student_id?: string; team_name?: string }; rounds_history?: unknown[]; submissions_history?: unknown[]; winner_name?: string }

const labels: Record<View, string> = {
  overview: 'Tổng quan', bracket: 'Bảng đấu', match: 'Trận đấu', qualifier: 'Vòng loại',
  ranking: 'Xếp hạng', profile: 'Hồ sơ đội', notifications: 'Thông báo',
  admin: 'Quản trị', practice: 'Chạy thử bot',
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>
}

function Button({ children, onClick, disabled = false, type = 'button', secondary = false }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; secondary?: boolean
}) {
  return <button type={type} onClick={onClick} disabled={disabled}
    className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${secondary ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
    {children}
  </button>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)}
      className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900" />
  </label>
}

function stamp(value: unknown) {
  if (!value) return '—'
  const number = Number(value)
  const date = Number.isFinite(number) ? new Date(number < 1e12 ? number * 1000 : number) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

function MatchBoard({ match }: { match: Match }) {
  const rounds = (match.rounds_history || []) as any[]
  const steps = rounds.at(-1)?.board_steps as any[] | undefined
  const board = steps?.at(-1)
  if (!board) return <p className="text-sm text-slate-500">Chưa có dữ liệu bàn cờ từ server.</p>
  const pieces = [...(board.red_pieces || []).map((piece: any) => ({ ...piece, side: 'red' })),
    ...(board.blue_pieces || []).map((piece: any) => ({ ...piece, side: 'blue' }))]
  const cells = new Map(pieces.filter((piece) => piece.alive !== false).map((piece) => [`${piece.row}:${piece.col}`, piece]))
  return <div><div className="grid w-fit grid-cols-9 overflow-hidden rounded-lg border border-slate-400">
    {Array.from({ length: 81 }, (_, index) => {
      const row = Math.floor(index / 9), col = index % 9
      const piece: any = cells.get(`${row}:${col}`)
      return <div key={index} title={piece ? `${piece.side === 'red' ? 'Đỏ' : 'Xanh'} · ${piece.type || 'Ẩn'}` : `${row}, ${col}`}
        className={`flex size-8 items-center justify-center border border-slate-200 text-[10px] font-bold sm:size-10 ${piece?.side === 'red' ? 'bg-red-100 text-red-700' : piece?.side === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-white'}`}>
        {piece ? `${piece.side === 'red' ? 'Đ' : 'X'}${String(piece.type || '?').slice(0, 1)}` : ''}
      </div>
    })}
  </div><p className="mt-2 text-xs text-slate-500">Bước {steps?.length || 0} · Hiệp {rounds.at(-1)?.round_number || rounds.length}. Dữ liệu được server lọc theo quyền xem.</p></div>
}

export function ArenaApp() {
  const [view, setView] = useState<View>('overview')
  const [session, setSession] = useState<Session>({ role: 'GUEST' })
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthModalMode>('login')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [tournamentId, setTournamentId] = useState('')
  const [tournament, setTournament] = useState<any>(null)
  const [matchId, setMatchId] = useState('')
  const [submissions, setSubmissions] = useState<any[]>([])
  const [replay, setReplay] = useState<any>(null)
  const [practiceResult, setPracticeResult] = useState<any>(null)
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([])
  const [qualifierId, setQualifierId] = useState('')
  const [qualifierDetail, setQualifierDetail] = useState<any>(null)
  const [qualifierRanking, setQualifierRanking] = useState<any[]>([])
  const [qualifierTeams, setQualifierTeams] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [monitoring, setMonitoring] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('PYTHON')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [filePath, setFilePath] = useState('bot.py')
  const [commit, setCommit] = useState('')
  const [createName, setCreateName] = useState('')
  const [createSize, setCreateSize] = useState('8')
  const [teamId, setTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamUniversity, setTeamUniversity] = useState('')
  const [swapA, setSwapA] = useState('')
  const [swapB, setSwapB] = useState('')
  const [reason, setReason] = useState('')
  const [stageSchedule, setStageSchedule] = useState('[]')
  const [stageRules, setStageRules] = useState('[]')
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [qualifierName, setQualifierName] = useState('')
  const [qualifierDeadline, setQualifierDeadline] = useState('')
  const [qualifierRounds, setQualifierRounds] = useState('5')
  const [qualifierTopK, setQualifierTopK] = useState('8')
  const [correctionA, setCorrectionA] = useState('0')
  const [correctionB, setCorrectionB] = useState('0')

  const role = session.role
  const match: Match | null = tournament?.matches?.[matchId] ?? null
  const matches = useMemo(() => Object.entries(tournament?.matches || {}) as [string, Match][], [tournament])
  const ownMatch = role === 'TEAM' && !!session.student_id && !!match &&
    session.tournament_id === tournamentId && session.match_id === matchId &&
    [match.team_a?.student_id, match.team_b?.student_id].some((id) => id?.toUpperCase() === session.student_id?.toUpperCase())

  const loadSession = useCallback(async (): Promise<Session> => {
    if (!getSessionToken()) { const guest: Session = { role: 'GUEST' }; setSession(guest); return guest }
    try {
      const current = await arenaApi.getSession()
      setSession(current)
      if (current.tournament_id) setTournamentId(current.tournament_id)
      if (current.match_id) setMatchId(current.match_id)
      return current
    } catch {
      const guest: Session = { role: 'GUEST' }
      setSession(guest)
      return guest
    }
  }, [])

  const loadPublic = useCallback(async () => {
    const [t, q, r] = await Promise.all([arenaApi.getTournamentList(), arenaApi.getQualifiers(), arenaApi.getRanking()])
    const list = Array.isArray(t) ? t as TournamentSummary[] : []
    setTournaments(list)
    setQualifiers(Array.isArray(q) ? q : [])
    setRanking(Array.isArray(r) ? r : [])
    setTournamentId((old) => old || list.find((item) => item.status === 'RUNNING')?.tournament_id || list[0]?.tournament_id || '')
    setQualifierId((old) => old || (Array.isArray(q) ? q[0]?.id : '') || '')
  }, [])

  const loadTournament = useCallback(async (id: string) => {
    if (!id) { setTournament(null); return }
    try {
      const detail = await arenaApi.getTournament(id)
      setTournament(detail)
      setMatchId((old) => old && detail?.matches?.[old] ? old : Object.keys(detail?.matches || {})[0] || '')
    } catch (error) { setTournament(null); throw error }
  }, [])

  const loadQualifier = useCallback(async (id: string) => {
    if (!id) { setQualifierDetail(null); setQualifierRanking([]); return }
    try {
      const [detail, rank] = await Promise.all([arenaApi.getQualifier(id), arenaApi.getQualifierRanking(id)])
      setQualifierDetail(detail)
      setQualifierRanking(Array.isArray(rank?.items) ? rank.items : [])
    } catch (error) { setQualifierDetail(null); setQualifierRanking([]); throw error }
  }, [])

  const loadNotifications = useCallback(async () => {
    const response = await arenaApi.getNotifications()
    setNotifications(Array.isArray(response.notifications) ? response.notifications : [])
  }, [])

  const loadProfile = useCallback(async (studentId: string) => {
    if (!studentId) return
    const response = await arenaApi.getProfile(studentId)
    setProfile(response.profile)
  }, [])

  const loadAdmin = useCallback(async () => {
    const [monitor, logs, users] = await Promise.all([arenaApi.getMonitoring(), arenaApi.getAuditLogs(), arenaApi.getAdminAccounts()])
    setMonitoring(monitor)
    setAuditLogs(Array.isArray(logs?.logs) ? logs.logs : [])
    setAccounts(Array.isArray(users) ? users : [])
  }, [])

  useEffect(() => { void loadSession(); void loadPublic().catch((e) => setError(e.message)) }, [loadSession, loadPublic])
  useEffect(() => {
    const expired = () => { setSession({ role: 'GUEST' }); setProfile(null); setTournament(null); setSubmissions([]); setView('overview') }
    window.addEventListener('arena-session-expired', expired)
    return () => window.removeEventListener('arena-session-expired', expired)
  }, [])
  useEffect(() => { void loadTournament(tournamentId).catch((e) => setError(e.message)) }, [tournamentId, loadTournament])
  useEffect(() => { void loadQualifier(qualifierId).catch((e) => setError(e.message)) }, [qualifierId, loadQualifier])
  useEffect(() => {
    if (!qualifierId) return
    const timer = window.setInterval(() => { void loadQualifier(qualifierId).catch((e) => setError(e.message)) }, 15000)
    return () => window.clearInterval(timer)
  }, [qualifierId, loadQualifier])
  useEffect(() => { void loadNotifications().catch((e) => setError(e.message)) }, [session, loadNotifications])
  useEffect(() => {
    const timer = window.setInterval(() => { void loadNotifications().catch((e) => setError(e.message)) }, 30000)
    return () => window.clearInterval(timer)
  }, [loadNotifications])
  useEffect(() => { if (role === 'TEAM' && session.student_id) void loadProfile(session.student_id).catch((e) => setError(e.message)) }, [role, session.student_id, loadProfile])
  useEffect(() => { if (role === 'ADMIN') void loadAdmin().catch((e) => setError(e.message)) }, [role, loadAdmin])
  useEffect(() => {
    if (role !== 'ADMIN' || !tournamentId) return
    void arenaApi.getTournament(tournamentId).then((detail: any) => {
      const windows = Object.entries(detail.stage_schedule || {}).map(([level, value]) => ({ level: Number(level), ...(value as object) }))
      const rules = Object.entries(detail.stage_rules || {}).map(([level, value]) => ({ level: Number(level), ...(value as object) }))
      setStageSchedule(JSON.stringify(windows, null, 2))
      setStageRules(JSON.stringify(rules, null, 2))
    }).catch((e) => setError(e.message))
  }, [role, tournamentId])
  useEffect(() => {
    if (!tournamentId) return
    const socket = createTournamentSocket(tournamentId)
    const unsubscribe = socket.subscribe(() => { void loadTournament(tournamentId).catch((e) => setError(e.message)) })
    socket.connect()
    const timer = window.setInterval(() => { void loadTournament(tournamentId).catch((e) => setError(e.message)) }, 15000)
    return () => { unsubscribe(); socket.destroy(); window.clearInterval(timer) }
  }, [tournamentId, loadTournament])
  useEffect(() => {
    if (!tournamentId || !matchId || (role !== 'ADMIN' && !ownMatch)) { setSubmissions([]); return }
    const refresh = () => { void arenaApi.getSubmissions(tournamentId, matchId).then((items) => setSubmissions(Array.isArray(items) ? items : [])).catch((e) => setError(e.message)) }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => window.clearInterval(timer)
  }, [tournamentId, matchId, role, ownMatch])

  async function run(task: () => Promise<unknown>, success: string, reload?: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('')
    try {
      await task()
      setNotice(success)
      if (reload) {
        try { await reload() }
        catch (e) { setError(`Thao tác đã được server chấp nhận, nhưng không tải lại được dữ liệu: ${e instanceof Error ? e.message : 'Lỗi không xác định'}`) }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Yêu cầu thất bại') }
    finally { setBusy(false) }
  }

  async function chooseMatch(id: string) {
    if (role === 'TEAM') {
      const selected = tournament?.matches?.[id] as Match | undefined
      if (![selected?.team_a?.student_id, selected?.team_b?.student_id].some((studentId) => studentId?.toUpperCase() === session.student_id?.toUpperCase())) {
        setMatchId(id); setView('match'); return
      }
      await run(() => arenaApi.selectTeamMatch(tournamentId, id), 'Đã chọn trận đấu', loadSession)
    }
    setMatchId(id); setView('match')
  }

  function openAuth(mode: AuthModalMode) { setAuthMode(mode); setAuthOpen(true) }
  async function logout() {
    await run(() => arenaApi.logout(), 'Đã đăng xuất', async () => {
      await loadSession()
      await loadTournament(tournamentId)
      await loadNotifications()
    })
    setSession({ role: 'GUEST' })
    setProfile(null)
    setSubmissions([])
    setTournament(null)
    void loadTournament(tournamentId).catch((e) => setError(e.message))
    setView('overview')
  }
  async function refreshAll() {
    await loadPublic()
    if (tournamentId) await loadTournament(tournamentId)
    if (qualifierId) await loadQualifier(qualifierId)
    await loadNotifications()
    if (role === 'ADMIN') await loadAdmin()
  }
  async function submitMatch(event: FormEvent) {
    event.preventDefault()
    await run(() => arenaApi.submitCode(tournamentId, matchId, { code_content: code, language }), 'Server đã nhận bài nộp', async () => {
      await loadTournament(tournamentId)
      const list = await arenaApi.getSubmissions(tournamentId, matchId)
      setSubmissions(Array.isArray(list) ? list : [])
    })
  }
  async function submitQualifier(event: FormEvent) {
    event.preventDefault()
    await run(() => arenaApi.submitQualifier(qualifierId, {
      code, language, git_repo_url: commit ? repoUrl : undefined, git_commit_hash: commit || undefined,
    }), 'Bài đã vào hàng đợi chấm của server', () => loadQualifier(qualifierId))
  }
  async function fetchSource() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await arenaApi.fetchGitHub(repoUrl, branch, filePath) as any
      setCode(result.code || '')
      setLanguage(result.language || 'PYTHON')
      setCommit(result.commit_sha || '')
      setNotice(`Đã tải mã nguồn ${result.commit_sha || ''} từ GitHub`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được GitHub') }
    finally { setBusy(false) }
  }

  return <div className="min-h-dvh bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <strong className="text-lg">BOT K69 · ARENA OTTV2</strong>
      <div className="flex items-center gap-2 text-sm"><span>{role === 'GUEST' ? 'Khách' : `${session.team_name || session.student_id || 'Admin'} · ${role}`}</span>
        {role === 'GUEST' ? <><Button onClick={() => openAuth('login')}>Đăng nhập</Button><Button secondary onClick={() => openAuth('register')}>Đăng ký</Button></> : <Button secondary onClick={() => void logout()}>Đăng xuất</Button>}
      </div>
    </div></header>
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:grid-cols-[220px_1fr]">
      <nav className="flex flex-wrap gap-2 self-start rounded-2xl border border-slate-200 bg-white p-3 md:flex-col" aria-label="Chức năng">
        {(Object.keys(labels) as View[]).filter((item) => item !== 'profile' || role === 'TEAM').filter((item) => item !== 'admin' || role === 'ADMIN').map((item) =>
          <button key={item} onClick={() => setView(item)} className={`rounded-xl px-3 py-2 text-left text-sm ${view === item ? 'bg-indigo-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{labels[item]}</button>)}
      </nav>
      <main className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{labels[view]}</h1><Button secondary disabled={busy} onClick={() => void run(refreshAll, 'Đã cập nhật dữ liệu')}>Làm mới</Button></div>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
        {['overview', 'bracket', 'match', 'admin'].includes(view) && <Card><label className="text-sm font-semibold">Giải đấu
          <select value={tournamentId} onChange={(e) => { setTournamentId(e.target.value); setMatchId('') }} className="ml-3 rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Chọn giải</option>{tournaments.map((item) => <option key={item.tournament_id} value={item.tournament_id}>{item.name} · {item.status}</option>)}
          </select></label></Card>}

        {view === 'overview' && <><Card><h2 className="mb-3 text-lg font-semibold">{tournament?.name || 'Chưa có giải đấu'}</h2>
          {tournament && <div className="grid gap-3 sm:grid-cols-3"><div>Trạng thái: <strong>{tournament.status || '—'}</strong></div><div>Số đội: <strong>{tournament.teams?.length || 0}</strong></div><div>Số trận: <strong>{matches.length}</strong></div></div>}</Card>
          <Card><h2 className="mb-3 font-semibold">Các trận đấu</h2>{matches.length ? matches.map(([id, item]) => <button key={id} onClick={() => void chooseMatch(id)} className="mb-2 block w-full rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400">{item.title || id}: {item.team_a?.team_name || 'Chờ đội'} – {item.team_b?.team_name || 'Chờ đội'} · {item.status || '—'}</button>) : <p>Chưa có trận đấu.</p>}</Card></>}

        {view === 'bracket' && <Card><h2 className="mb-3 font-semibold">Nhánh đấu · {tournament?.name || 'Chọn giải đấu'}</h2>
          {matches.length ? matches.sort((a, b) => Number(a[1].round_level || 0) - Number(b[1].round_level || 0)).map(([id, item]) =>
            <button key={id} onClick={() => void chooseMatch(id)} className="mb-2 block w-full rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400">
              <strong>{item.round_name || item.title || id}</strong><span className="ml-2 text-slate-500">{item.status || '—'}</span><p>{item.team_a?.team_name || 'Chờ đội'} – {item.team_b?.team_name || 'Chờ đội'}</p>{item.winner_name && <small>Thắng: {item.winner_name}</small>}
            </button>) : <p>Chưa có nhánh đấu.</p>}</Card>}

        {view === 'match' && <><Card><label className="text-sm font-semibold">Trận đấu <select value={matchId} onChange={(e) => void chooseMatch(e.target.value)} className="ml-3 rounded-lg border border-slate-300 px-3 py-2"><option value="">Chọn trận</option>{matches.map(([id, item]) => <option key={id} value={id}>{item.title || id}</option>)}</select></label></Card>
          {match ? <><Card><h2 className="text-lg font-semibold">{match.title || matchId}</h2><p>{match.team_a?.team_name || 'Chờ đội'} – {match.team_b?.team_name || 'Chờ đội'}</p><p>Trạng thái: {match.status || '—'} · Hiệp: {match.current_round_idx || 1} · {match.round_status || '—'}</p>{match.winner_name && <p>Đội thắng: {match.winner_name}</p>}</Card><Card><h2 className="mb-3 font-semibold">Bàn cờ từ hiệp gần nhất</h2><MatchBoard match={match} /></Card>
            {ownMatch && <Card><h2 className="mb-3 font-semibold">Nộp bot cho trận</h2><div className="mb-3 grid gap-3 sm:grid-cols-3"><Field label="GitHub repository" value={repoUrl} onChange={setRepoUrl} /><Field label="Nhánh" value={branch} onChange={setBranch} /><Field label="Đường dẫn file" value={filePath} onChange={setFilePath} /></div><Button secondary disabled={busy || !repoUrl} onClick={() => void fetchSource()}>Tải code từ GitHub</Button><form onSubmit={(e) => void submitMatch(e)} className="mt-3 space-y-3"><select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="PYTHON">Python</option><option value="CPP">C++</option></select><textarea required value={code} onChange={(e) => setCode(e.target.value)} rows={12} className="block w-full rounded-xl border border-slate-300 p-3 font-mono text-sm" placeholder="Mã nguồn bot" /><div className="flex gap-2"><Button type="submit" disabled={busy || !code.trim()}>Nộp bài thật</Button><Button secondary disabled={busy || !code.trim()} onClick={() => void run(() => arenaApi.validateCode(code, language), 'Server xác nhận mã hợp lệ')}>Kiểm tra trên server</Button></div></form></Card>}
            {(ownMatch || role === 'ADMIN') && <Card><h2 className="mb-3 font-semibold">Lịch sử nộp</h2>{submissions.length ? submissions.map((item, index) => <div key={item.id || index} className="border-b py-2 text-sm">{item.id || `Bài ${index + 1}`} · {item.status || '—'} · {item.language || '—'} · {stamp(item.created_at || item.at)}</div>) : <p>Chưa có bài nộp.</p>}</Card>}
            <Card><h2 className="mb-3 font-semibold">Các hiệp đã đấu</h2>{(match.rounds_history || []).length ? (match.rounds_history || []).map((item: any, index) => <Button key={index} secondary onClick={() => void run(async () => setReplay(await arenaApi.getRoundReplay(tournamentId, matchId, item.round_number || index + 1)), 'Đã tải replay')}>Xem hiệp {item.round_number || index + 1}</Button>) : <p>Chưa có hiệp hoàn tất.</p>}{replay && <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-white">{JSON.stringify(replay, null, 2)}</pre>}</Card>
            {role === 'ADMIN' && <Card><h2 className="mb-3 font-semibold">Điều hành trận</h2><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void run(() => arenaApi.playRound(tournamentId, matchId), 'Đã bắt đầu hiệp trên server', () => loadTournament(tournamentId))}>Chạy hiệp</Button><Button disabled={busy} secondary onClick={() => void run(() => arenaApi.nextRound(tournamentId, matchId), 'Đã chuyển hiệp', () => loadTournament(tournamentId))}>Hiệp tiếp theo</Button><Button disabled={busy} secondary onClick={() => { if (confirm('Đặt lại trận đấu này?')) void run(() => arenaApi.resetMatch(tournamentId, matchId), 'Đã đặt lại trận', () => loadTournament(tournamentId)) }}>Đặt lại trận</Button></div><h3 className="mt-5 mb-2 font-semibold">Sửa kết quả có ghi nhật ký</h3><div className="grid gap-3 sm:grid-cols-3"><Field label="Điểm đội A" value={correctionA} onChange={setCorrectionA} type="number" /><Field label="Điểm đội B" value={correctionB} onChange={setCorrectionB} type="number" /><Field label="Lý do" value={reason} onChange={setReason} /></div><div className="mt-3 flex gap-2"><Button disabled={busy || !tournament?.correction_token || reason.trim().length < 5} onClick={() => { if (confirm('Xác nhận sửa kết quả trận?')) void run(() => arenaApi.correctMatch(tournamentId, matchId, { token: tournament.correction_token, action: 'result', score_a: Number(correctionA), score_b: Number(correctionB), reason }), 'Đã sửa kết quả và nhánh đi tiếp', () => loadTournament(tournamentId)) }}>Xác nhận kết quả</Button><Button secondary disabled={busy || !tournament?.correction_token || reason.trim().length < 5} onClick={() => { if (confirm('Hoàn tác lần sửa kết quả cuối?')) void run(() => arenaApi.correctMatch(tournamentId, matchId, { token: tournament.correction_token, action: 'rollback', reason }), 'Đã hoàn tác', () => loadTournament(tournamentId)) }}>Hoàn tác</Button></div></Card>}</> : <Card>Chọn một trận đấu để xem dữ liệu thật.</Card>}</>}

        {view === 'qualifier' && <><Card><label className="text-sm font-semibold">Vòng loại <select value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="ml-3 rounded-lg border border-slate-300 px-3 py-2"><option value="">Chọn vòng loại</option>{qualifiers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></Card>
          {qualifierDetail && <><Card><h2 className="text-lg font-semibold">{qualifierDetail.event?.name}</h2><p>Trạng thái: {qualifierDetail.event?.status} · Hạn nộp: {stamp(qualifierDetail.event?.deadline)}</p><p>Vòng: {qualifierDetail.event?.current_round || 0}/{qualifierDetail.event?.rounds || 0} · Top {qualifierDetail.event?.top_k || 0}</p>{role === 'TEAM' && <div className="mt-3"><p>Đội: {qualifierDetail.participant?.team_name || 'Chưa đăng ký'}</p>{!qualifierDetail.participant?.student_id && <Button disabled={busy} onClick={() => void run(() => arenaApi.registerQualifier(qualifierId), 'Đã đăng ký vòng loại', () => loadQualifier(qualifierId))}>Đăng ký vòng loại</Button>}</div>}</Card>
            {role === 'TEAM' && <Card><h2 className="mb-3 font-semibold">Nộp bài vòng loại</h2><div className="mb-3 grid gap-3 sm:grid-cols-3"><Field label="GitHub repository" value={repoUrl} onChange={setRepoUrl} /><Field label="Nhánh" value={branch} onChange={setBranch} /><Field label="Đường dẫn file" value={filePath} onChange={setFilePath} /></div><Button secondary disabled={busy || !repoUrl} onClick={() => void fetchSource()}>Tải code từ GitHub thật</Button><form onSubmit={(e) => void submitQualifier(e)} className="mt-3 space-y-3"><select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="PYTHON">Python</option><option value="CPP">C++</option></select><textarea required value={code} onChange={(e) => { setCode(e.target.value); setCommit('') }} rows={12} className="block w-full rounded-xl border border-slate-300 p-3 font-mono text-sm" placeholder="Mã nguồn bot" /><Button type="submit" disabled={busy || !code.trim()}>Gửi tới hàng đợi chấm</Button></form><h3 className="mt-5 font-semibold">Lịch sử của đội</h3>{(qualifierDetail.history || []).map((item: any) => <div key={item.id} className="border-b py-2 text-sm">{item.id} · {item.status} · {item.error || stamp(item.at)}</div>)}</Card>}
            <Card><h2 className="mb-3 font-semibold">Xếp hạng vòng loại</h2>{qualifierRanking.length ? qualifierRanking.map((item) => <p key={item.student_id} className="border-b py-2 text-sm">#{item.rank} · {item.team_name} · {item.elo?.toFixed?.(2) || item.elo} ELO · {item.wins}/{item.played} trận</p>) : <p>Chưa có kết quả.</p>}</Card></>}</>}

        {view === 'ranking' && <Card><h2 className="mb-3 font-semibold">Bảng xếp hạng toàn hệ thống</h2>{ranking.length ? ranking.map((item, index) => <p key={item.student_id || index} className="border-b py-2 text-sm">#{index + 1} · {item.bot_name || item.team_name || item.name || item.student_id} · {item.elo_score ?? item.elo ?? item.score ?? '—'} ELO · {item.wins ?? 0}/{item.matches_played ?? 0} trận</p>) : <p>Chưa có dữ liệu xếp hạng.</p>}</Card>}

        {view === 'profile' && role === 'TEAM' && <Card><h2 className="mb-3 font-semibold">Hồ sơ {session.student_id}</h2>{profile ? <form onSubmit={(e) => { e.preventDefault(); void run(() => arenaApi.updateProfile(profile), 'Đã lưu hồ sơ vào database', () => loadProfile(session.student_id || '')) }} className="space-y-3"><Field label="Tên đội" value={profile.team_name || ''} onChange={(v) => setProfile({ ...profile, team_name: v })} /><Field label="Đội trưởng" value={profile.captain_name || ''} onChange={(v) => setProfile({ ...profile, captain_name: v })} /><Field label="Trường" value={profile.university || ''} onChange={(v) => setProfile({ ...profile, university: v })} /><label className="block text-sm font-medium">Giới thiệu<textarea value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={4} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label><Button type="submit" disabled={busy}>Lưu hồ sơ</Button></form> : <p>Đang tải hồ sơ...</p>}</Card>}

        {view === 'notifications' && <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Thông báo từ server</h2>{role !== 'GUEST' && <Button secondary disabled={busy} onClick={() => void run(() => arenaApi.markNotificationRead(), 'Đã đánh dấu tất cả', loadNotifications)}>Đánh dấu đã đọc</Button>}</div>{notifications.length ? notifications.map((item) => <div key={item.id} className="border-b py-3"><strong>{item.title}</strong><p className="text-sm">{item.message}</p><small>{stamp(item.created_at)} · {item.is_read ? 'Đã đọc' : 'Chưa đọc'}</small>{role !== 'GUEST' && !item.is_read && <div className="mt-2"><Button secondary disabled={busy} onClick={() => void run(() => arenaApi.markNotificationRead(item.id), 'Đã đánh dấu thông báo', loadNotifications)}>Đánh dấu đã đọc</Button></div>}</div>) : <p>Chưa có thông báo.</p>}</Card>}

        {view === 'practice' && <Card><h2 className="mb-3 font-semibold">Chạy thử bot trên worker</h2>{role === 'GUEST' ? <p>Đăng nhập để chạy thử bot.</p> : <><select value={language} onChange={(e) => setLanguage(e.target.value)} className="mb-3 rounded-lg border border-slate-300 px-3 py-2"><option value="PYTHON">Python</option><option value="CPP">C++</option></select><textarea value={code} onChange={(e) => setCode(e.target.value)} rows={12} className="block w-full rounded-xl border border-slate-300 p-3 font-mono text-sm" /><div className="mt-3"><Button disabled={busy || !code.trim()} onClick={() => void run(async () => { const result = await arenaApi.practiceBot({ code_content: code, language, boss_difficulty: 'RANDOM' }); setPracticeResult(result) }, 'Worker đã trả kết quả chạy thử')}>Chạy thử thật</Button></div>{practiceResult && <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-white">{JSON.stringify(practiceResult, null, 2)}</pre>}</>}</Card>}

        {view === 'admin' && role === 'ADMIN' && <><Card><h2 className="mb-3 font-semibold">Giám sát hệ thống</h2><pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-white">{JSON.stringify(monitoring, null, 2)}</pre></Card>
          <Card><h2 className="mb-3 font-semibold">Tài khoản đội</h2>{accounts.length ? accounts.map((item) => <div key={item.student_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span>{item.team_name} · {item.student_id}</span><div className="flex gap-2">{tournamentId && <Button secondary disabled={busy} onClick={() => void run(() => arenaApi.enrollAdminAccount(item.student_id, { tournament_id: tournamentId }), 'Đã ghi danh đội', () => loadTournament(tournamentId))}>Ghi danh</Button>}<Button secondary disabled={busy} onClick={() => { if (confirm(`Xóa tài khoản ${item.student_id}?`)) void run(() => arenaApi.deleteAdminAccount(item.student_id), 'Đã xóa tài khoản', loadAdmin) }}>Xóa tài khoản</Button></div></div>) : <p>Chưa có tài khoản.</p>}</Card>
          <Card><h2 className="mb-3 font-semibold">Tạo giải</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Tên giải" value={createName} onChange={setCreateName} /><Field label="Số đội (4, 8, 16, ...)" value={createSize} onChange={setCreateSize} type="number" /></div><div className="mt-3"><Button disabled={busy || !createName.trim()} onClick={() => void run(() => arenaApi.createTournament({ name: createName, num_teams: Number(createSize) }), 'Đã tạo giải', loadPublic)}>Tạo giải trên server</Button></div></Card>
          {tournamentId && <><Card><h2 className="mb-3 font-semibold">Quản lý đội · {tournament?.name}</h2>{(tournament?.teams || []).map((item: any) => <div key={item.student_id} className="flex items-center justify-between border-b py-2 text-sm"><span>{item.team_name} · {item.student_id}</span><Button secondary disabled={busy} onClick={() => { if (confirm(`Xóa đội ${item.team_name} khỏi giải?`)) void run(() => arenaApi.removeTeam(tournamentId, item.student_id), 'Đã xóa đội', () => loadTournament(tournamentId)) }}>Xóa</Button></div>)}<div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="MSSV" value={teamId} onChange={setTeamId} /><Field label="Tên đội" value={teamName} onChange={setTeamName} /><Field label="Trường" value={teamUniversity} onChange={setTeamUniversity} /></div><div className="mt-3 flex gap-2"><Button disabled={busy || !teamId || !teamName} onClick={() => void run(() => arenaApi.addTeam(tournamentId, { student_id: teamId, team_name: teamName, university: teamUniversity }), 'Đã thêm đội', () => loadTournament(tournamentId))}>Thêm đội</Button><Button secondary disabled={busy} onClick={() => void run(() => arenaApi.autoSchedule(tournamentId), 'Đã xếp lịch thi đấu', () => loadTournament(tournamentId))}>Xếp lịch</Button></div></Card>
          <Card><h2 className="mb-3 font-semibold">Lịch và luật theo giai đoạn</h2><p className="mb-2 text-xs text-slate-500">Lịch: mảng level, starts_at, ends_at (Unix giây). Luật: mảng cấu hình giai đoạn theo API. Server kiểm tra trước khi lưu.</p><label className="block text-sm">Lịch<textarea value={stageSchedule} onChange={(e) => setStageSchedule(e.target.value)} rows={5} className="mt-1 block w-full rounded-xl border p-3 font-mono text-xs" /></label><Button disabled={busy} onClick={() => void run(() => arenaApi.setStageSchedule(tournamentId, { windows: JSON.parse(stageSchedule) }), 'Đã lưu lịch', () => loadTournament(tournamentId))}>Lưu lịch</Button><label className="mt-3 block text-sm">Luật<textarea value={stageRules} onChange={(e) => setStageRules(e.target.value)} rows={5} className="mt-1 block w-full rounded-xl border p-3 font-mono text-xs" /></label><Button disabled={busy} onClick={() => void run(() => arenaApi.setStageRules(tournamentId, JSON.parse(stageRules)), 'Đã lưu luật', () => loadTournament(tournamentId))}>Lưu luật</Button></Card>
            <Card><h2 className="mb-3 font-semibold">Đổi nhánh / loại đội</h2><div className="grid gap-3 sm:grid-cols-3"><Field label="Đội 1 (MSSV)" value={swapA} onChange={setSwapA} /><Field label="Đội 2 (MSSV)" value={swapB} onChange={setSwapB} /><Field label="Lý do loại" value={reason} onChange={setReason} /></div><div className="mt-3 flex gap-2"><Button disabled={busy || !swapA || !swapB} onClick={() => void run(() => arenaApi.swapBracket(tournamentId, { teamA: swapA, teamB: swapB }), 'Đã đổi nhánh', () => loadTournament(tournamentId))}>Đổi nhánh</Button><Button secondary disabled={busy || !swapA} onClick={() => { if (confirm(`Loại đội ${swapA}?`)) void run(() => arenaApi.disqualifyTeam(tournamentId, { student_id: swapA, reason }), 'Đã loại đội', () => loadTournament(tournamentId)) }}>Loại đội 1</Button></div></Card></>}
          <Card><h2 className="mb-3 font-semibold">Tạo vòng loại</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Tên vòng loại" value={qualifierName} onChange={setQualifierName} /><Field label="Hạn nộp" value={qualifierDeadline} onChange={setQualifierDeadline} type="datetime-local" /><Field label="Số vòng" value={qualifierRounds} onChange={setQualifierRounds} type="number" /><Field label="Top K" value={qualifierTopK} onChange={setQualifierTopK} type="number" /></div><div className="mt-3"><Button disabled={busy || !qualifierName || !qualifierDeadline} onClick={() => void run(() => arenaApi.createQualifier({ name: qualifierName, deadline: new Date(qualifierDeadline).getTime() / 1000, rounds: Number(qualifierRounds), top_k: Number(qualifierTopK) }), 'Đã tạo vòng loại', loadPublic)}>Tạo vòng loại</Button></div></Card>
          {qualifierId && <Card><h2 className="mb-3 font-semibold">Điều hành vòng loại · {qualifierDetail?.event?.name}</h2><div className="flex flex-wrap gap-2">{['start', 'pause', 'freeze'].map((action) => <Button key={action} secondary disabled={busy} onClick={() => void run(() => arenaApi.qualifierAction(qualifierId, action), `Đã thực hiện ${action}`, () => loadQualifier(qualifierId))}>{action}</Button>)}{tournamentId && <Button secondary disabled={busy} onClick={() => { if (confirm('Chốt đội đi tiếp vào giải đang chọn?')) void run(() => arenaApi.qualifierAction(qualifierId, 'promote', { tournament_id: tournamentId }), 'Đã chốt đội đi tiếp', refreshAll) }}>Chốt đội đi tiếp</Button>}</div><div className="mt-4"><Button secondary disabled={busy} onClick={() => void run(async () => { const response = await arenaApi.getQualifierTeams(qualifierId); setQualifierTeams(response.items || []) }, 'Đã tải danh sách đội')}>Tải danh sách đội</Button></div>{qualifierTeams.map((item) => <p key={item.student_id} className="border-b py-2 text-sm">{item.team_name} · {item.student_id} · {item.status} · {item.elo} ELO</p>)}</Card>}
          <Card><h2 className="mb-3 font-semibold">Phát thông báo</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Tiêu đề" value={broadcastTitle} onChange={setBroadcastTitle} /><Field label="Nội dung" value={broadcastMessage} onChange={setBroadcastMessage} /></div><div className="mt-3"><Button disabled={busy || !broadcastTitle || !broadcastMessage} onClick={() => void run(() => arenaApi.broadcastNotification({ title: broadcastTitle, message: broadcastMessage }), 'Đã phát thông báo', loadNotifications)}>Gửi cho tất cả</Button></div></Card>
          <Card><h2 className="mb-3 font-semibold">Nhật ký quản trị</h2>{auditLogs.map((item, index) => <p key={item.id || index} className="border-b py-2 text-sm">{stamp(item.created_at)} · {item.action} · {item.tournament_id || ''}</p>)}</Card></>}
      </main>
    </div>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} onLoginSuccess={() => {
      void (async () => {
        const current = await loadSession()
        await loadPublic()
        await loadTournament(current.tournament_id || tournamentId)
        await loadNotifications()
        if (current.role === 'ADMIN') await loadAdmin()
      })().catch((e) => setError(e.message))
      setView('overview')
    }} />
  </div>
}
