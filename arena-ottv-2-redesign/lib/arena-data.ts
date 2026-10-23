/**
 * PROTOTYPE FIXTURE DATA
 * Mọi dữ liệu dưới đây là dữ liệu mẫu cho bản thiết kế. Khi tích hợp lại vào
 * nền tảng Go, thay các hằng số này bằng dữ liệu trả về từ API hiện có.
 */

export type Role = 'guest' | 'team' | 'admin'

export type ViewId =
  | 'login'
  | 'overview'
  | 'profile'
  | 'bracket'
  | 'ranking'
  | 'match'
  | 'qualifier'
  | 'guide'
  | 'admin'

/** ID của tab tương ứng trong DOM gốc (data-tab="tab-…") */
export const viewDomId: Record<ViewId, string> = {
  login: 'view-login',
  overview: 'tab-overview',
  profile: 'tab-profile',
  bracket: 'tab-bracket',
  ranking: 'tab-ranking',
  match: 'tab-match-arena',
  qualifier: 'tab-qualifier',
  guide: 'tab-guide',
  admin: 'tab-admin-console',
}

export const viewTitle: Record<ViewId, string> = {
  login: 'Đăng nhập',
  overview: 'Tổng quan',
  profile: 'Hồ sơ đội',
  bracket: 'Bảng đấu',
  ranking: 'Xếp hạng',
  match: 'Trận đấu',
  qualifier: 'Vòng loại',
  guide: 'Hướng dẫn thi đấu',
  admin: 'Bàn Quản Trị',
}

/* ------------------------------------------------------------------ */
/* Đội thi                                                             */
/* ------------------------------------------------------------------ */

export type TeamRecord = {
  id: string
  name: string
  mssv: string
  captain: string
  uni: string
  lang: 'py' | 'cpp'
  motto: string
  members: { name: string; mssv: string }[]
  elo: number
  matchesWon: number
  matchesPlayed: number
  heatsWon: number
  heatsTotal: number
  isSample?: boolean
}

export const teams: TeamRecord[] = [
  {
    id: 't1',
    name: 'Cú Đêm K69',
    mssv: '24020277',
    captain: 'Nguyễn Minh Anh',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'py',
    motto: 'Thức khuya, nghĩ sâu, đi nước chắc.',
    members: [
      { name: 'Trần Đức Huy', mssv: '24020281' },
      { name: 'Lê Thu Hà', mssv: '24020295' },
    ],
    elo: 1284,
    matchesWon: 4,
    matchesPlayed: 5,
    heatsWon: 13,
    heatsTotal: 21,
  },
  {
    id: 't2',
    name: 'Rồng Lửa',
    mssv: '24020112',
    captain: 'Phạm Quang Khải',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'cpp',
    motto: 'Nhanh như lửa.',
    members: [{ name: 'Đỗ Hải Nam', mssv: '24020118' }],
    elo: 1312,
    matchesWon: 5,
    matchesPlayed: 5,
    heatsWon: 15,
    heatsTotal: 19,
  },
  {
    id: 't3',
    name: 'Mèo Máy Hà Nội',
    mssv: '24020431',
    captain: 'Vũ Ngọc Lan',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'py',
    motto: 'Bình tĩnh, tính kỹ.',
    members: [],
    elo: 1206,
    matchesWon: 3,
    matchesPlayed: 5,
    heatsWon: 11,
    heatsTotal: 22,
  },
  {
    id: 't4',
    name: 'Lạc Hồng',
    mssv: '24020009',
    captain: 'Hoàng Gia Bảo',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'cpp',
    motto: 'Một lòng một dạ.',
    members: [{ name: 'Ngô Thanh Tùng', mssv: '24020015' }],
    elo: 1251,
    matchesWon: 4,
    matchesPlayed: 5,
    heatsWon: 12,
    heatsTotal: 20,
  },
  {
    id: 't5',
    name: 'Kiến Thợ',
    mssv: '24020388',
    captain: 'Bùi Thị Mai',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'py',
    motto: 'Chăm chỉ từng bước.',
    members: [],
    elo: 1148,
    matchesWon: 2,
    matchesPlayed: 5,
    heatsWon: 9,
    heatsTotal: 21,
  },
  {
    id: 't6',
    name: 'Sao Băng',
    mssv: '24020215',
    captain: 'Đặng Hữu Phước',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'cpp',
    motto: 'Lóe sáng đúng lúc.',
    members: [],
    elo: 1189,
    matchesWon: 3,
    matchesPlayed: 5,
    heatsWon: 10,
    heatsTotal: 22,
  },
  {
    id: 't7',
    name: 'Hổ Báo Code',
    mssv: '24020156',
    captain: 'Lý Văn Đạt',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'py',
    motto: 'Không ngại va chạm.',
    members: [{ name: 'Mai Anh Thư', mssv: '24020160' }],
    elo: 1172,
    matchesWon: 2,
    matchesPlayed: 5,
    heatsWon: 9,
    heatsTotal: 20,
  },
  {
    id: 't8',
    name: 'Bình Minh',
    mssv: '24020302',
    captain: 'Trịnh Khánh Linh',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'cpp',
    motto: 'Khởi đầu mới mỗi hiệp.',
    members: [],
    elo: 1224,
    matchesWon: 3,
    matchesPlayed: 5,
    heatsWon: 11,
    heatsTotal: 20,
  },
]

export const CURRENT_TEAM_ID = 't1'
export const teamById = (id: string) => teams.find((t) => t.id === id)
export const currentTeam = teamById(CURRENT_TEAM_ID)!
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/* ------------------------------------------------------------------ */
/* Bàn cờ                                                              */
/* ------------------------------------------------------------------ */

export type Team = 'blue' | 'red'
export type Weapon = 'rock' | 'paper' | 'scissors'

export const weaponLabel: Record<Weapon, string> = { rock: 'Búa', paper: 'Bao', scissors: 'Kéo' }

export type Piece = { id: string; team: Team; weapon: Weapon; row: number; col: number }

export const BOARD_SIZE = 9
export const PIECES_PER_TEAM = 9
export const BLUE_BASE = { row: 8, col: 0 }
export const RED_BASE = { row: 0, col: 8 }

export type Tile = { row: number; col: number; kind: 'wall' | 'swap' }
export const specialTiles: Tile[] = [
  { row: 4, col: 4, kind: 'wall' },
  { row: 3, col: 2, kind: 'wall' },
  { row: 5, col: 6, kind: 'wall' },
  { row: 2, col: 2, kind: 'swap' },
  { row: 6, col: 6, kind: 'swap' },
]

const w = (i: number): Weapon => (['rock', 'paper', 'scissors'] as const)[i % 3]
export const initialPieces: Piece[] = [
  ...[
    [8, 1], [7, 0], [7, 1], [6, 0], [6, 2], [7, 3], [5, 1], [8, 3], [6, 4],
  ].map(([row, col], i) => ({ id: `b${i}`, team: 'blue' as const, weapon: w(i), row, col })),
  ...[
    [0, 7], [1, 8], [1, 7], [2, 8], [2, 6], [1, 5], [3, 7], [0, 5], [2, 4],
  ].map(([row, col], i) => ({ id: `r${i}`, team: 'red' as const, weapon: w(i + 1), row, col })),
]

export type RuleId = 'shuffle' | 'invert' | 'fog' | 'walls' | 'swapTiles'
export const ruleMeta: Record<RuleId, { label: string; description: string }> = {
  shuffle: { label: 'Trộn quân', description: 'Vũ khí của các quân được xáo trộn ngẫu nhiên khi bắt đầu hiệp.' },
  invert: { label: 'Đảo tương khắc', description: 'Quan hệ thắng thua bị đảo: Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa.' },
  fog: { label: 'Sương mù', description: 'Mỗi đội chỉ thấy vũ khí quân đối thủ khi đứng kề cạnh.' },
  walls: { label: 'Chướng ngại vật', description: 'Ô tường không thể đi vào hoặc đi xuyên qua.' },
  swapTiles: { label: 'Ô hoán đổi', description: 'Quân bước vào ô hoán đổi sẽ đổi vũ khí theo vòng Búa → Bao → Kéo.' },
}

/** Luật thường: Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa */
export const normalBeats: Record<Weapon, Weapon> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
/** Đảo tương khắc */
export const invertedBeats: Record<Weapon, Weapon> = { rock: 'paper', paper: 'scissors', scissors: 'rock' }

/* ------------------------------------------------------------------ */
/* Giải đấu & trận                                                      */
/* ------------------------------------------------------------------ */

export type MatchStatus = 'unscheduled' | 'waiting' | 'live' | 'done'
export const matchStatusLabel: Record<MatchStatus, string> = {
  unscheduled: 'Chờ xếp lịch',
  waiting: 'Chờ thi đấu',
  live: 'Đang thi đấu',
  done: 'Đã kết thúc',
}

export type BracketMatch = {
  id: string
  stage: 'qf' | 'sf' | 'f'
  title: string
  red: string | null
  blue: string | null
  redScore: number | null
  blueScore: number | null
  status: MatchStatus
  pendingLabel?: [string, string]
  heat?: number
  override?: string
}

export const stageLabel = { qf: 'Tứ Kết', sf: 'Bán Kết', f: 'Chung Kết' } as const

export const bracketMatches: BracketMatch[] = [
  { id: 'QF-01', stage: 'qf', title: 'Tứ Kết 1', red: 't2', blue: 't7', redScore: 3, blueScore: 1, status: 'done' },
  { id: 'QF-02', stage: 'qf', title: 'Tứ Kết 2', red: 't3', blue: 't1', redScore: 1, blueScore: 2, status: 'live', heat: 4 },
  { id: 'QF-03', stage: 'qf', title: 'Tứ Kết 3', red: 't4', blue: 't5', redScore: 0, blueScore: 0, status: 'waiting' },
  { id: 'QF-04', stage: 'qf', title: 'Tứ Kết 4', red: 't8', blue: 't6', redScore: null, blueScore: null, status: 'unscheduled' },
  { id: 'SF-01', stage: 'sf', title: 'Bán Kết 1', red: 't2', blue: null, redScore: null, blueScore: null, status: 'unscheduled', pendingLabel: ['Thắng Tứ Kết 1', 'Thắng Tứ Kết 2'] },
  { id: 'SF-02', stage: 'sf', title: 'Bán Kết 2', red: null, blue: null, redScore: null, blueScore: null, status: 'unscheduled', pendingLabel: ['Thắng Tứ Kết 3', 'Thắng Tứ Kết 4'] },
  { id: 'F-01', stage: 'f', title: 'Chung Kết', red: null, blue: null, redScore: null, blueScore: null, status: 'unscheduled', pendingLabel: ['Thắng Bán Kết 1', 'Thắng Bán Kết 2'] },
]

export const LIVE_MATCH_ID = 'QF-02'

export type Tournament = {
  id: string
  name: string
  capacity: number
  enrolled: number
  status: 'running' | 'finished' | 'draft'
  champion?: string
}

export const tournaments: Tournament[] = [
  { id: 'main-2026', name: 'Giải Vô địch OTTV2 K69 – 2026', capacity: 8, enrolled: 8, status: 'running' },
  { id: 'trial-2025', name: 'Giải Giao hữu Học kỳ I', capacity: 4, enrolled: 4, status: 'finished', champion: 'Rồng Lửa' },
]

export type HeatState = 'done' | 'current' | 'upcoming'
export type Heat = {
  n: number
  state: HeatState
  winner?: Team
  reason?: string
  rules: RuleId[]
  steps?: number
  remaining?: { red: number; blue: number }
}

export const heats: Heat[] = [
  { n: 1, state: 'done', winner: 'blue', reason: 'Chiếm căn cứ đối thủ', rules: [], steps: 87, remaining: { red: 4, blue: 6 } },
  { n: 2, state: 'done', winner: 'red', reason: 'Tiêu diệt toàn bộ quân', rules: ['walls'], steps: 112, remaining: { red: 3, blue: 0 } },
  { n: 3, state: 'done', winner: 'blue', reason: 'Hết lượt, nhiều quân hơn', rules: ['invert'], steps: 150, remaining: { red: 2, blue: 5 } },
  { n: 4, state: 'current', rules: ['invert', 'fog', 'walls', 'swapTiles'] },
  { n: 5, state: 'upcoming', rules: ['shuffle', 'invert', 'fog'] },
]

/* ------------------------------------------------------------------ */
/* Bài nộp                                                             */
/* ------------------------------------------------------------------ */

export type SubmissionState = 'none' | 'received' | 'checking' | 'invalid' | 'valid' | 'locked'
export const submissionStateLabel: Record<SubmissionState, string> = {
  none: 'Chờ nộp bot',
  received: 'Đã nộp code',
  checking: 'Đang kiểm tra',
  invalid: 'Không hợp lệ',
  valid: 'Sẵn sàng',
  locked: 'Đã khóa',
}

export type Submission = {
  id: string
  teamId: string
  heat: number
  lang: 'py' | 'cpp'
  time: string
  state: SubmissionState
  source: 'github' | 'direct'
}

export const matchSubmissions: Submission[] = [
  { id: 'S-4112', teamId: 't1', heat: 3, lang: 'py', time: '23/10 19:42', state: 'locked', source: 'github' },
  { id: 'S-4098', teamId: 't1', heat: 2, lang: 'py', time: '23/10 19:10', state: 'locked', source: 'direct' },
  { id: 'S-4051', teamId: 't1', heat: 1, lang: 'py', time: '23/10 18:31', state: 'locked', source: 'direct' },
]

export type QualifierStatus = 'none' | 'received' | 'invalid' | 'valid' | 'locked'
export const qualifierStatusLabel: Record<QualifierStatus, string> = {
  none: 'Chưa nộp',
  received: 'Đã nhận · Đang chấm',
  invalid: 'Chưa có bản hợp lệ',
  valid: 'Có bản hợp lệ',
  locked: 'Đã khóa',
}

export type QualifierEntry = {
  teamId: string
  status: QualifierStatus
  elo: number
  wins: number
  played: number
  lastSubmit: string
  versions: { v: number; time: string; lang: 'py' | 'cpp'; valid: boolean }[]
}

export const qualifierEntries: QualifierEntry[] = [
  { teamId: 't2', status: 'locked', elo: 1312, wins: 9, played: 10, lastSubmit: '22/10 22:10', versions: [{ v: 3, time: '22/10 22:10', lang: 'cpp', valid: true }, { v: 2, time: '22/10 20:01', lang: 'cpp', valid: true }, { v: 1, time: '21/10 17:45', lang: 'cpp', valid: false }] },
  { teamId: 't1', status: 'valid', elo: 1284, wins: 8, played: 10, lastSubmit: '22/10 23:41', versions: [{ v: 2, time: '22/10 23:41', lang: 'py', valid: true }, { v: 1, time: '22/10 21:02', lang: 'py', valid: true }] },
  { teamId: 't4', status: 'locked', elo: 1251, wins: 7, played: 10, lastSubmit: '22/10 20:03', versions: [{ v: 1, time: '22/10 20:03', lang: 'cpp', valid: true }] },
  { teamId: 't8', status: 'valid', elo: 1224, wins: 7, played: 10, lastSubmit: '22/10 17:58', versions: [{ v: 1, time: '22/10 17:58', lang: 'cpp', valid: true }] },
  { teamId: 't3', status: 'received', elo: 1206, wins: 6, played: 10, lastSubmit: '23/10 08:15', versions: [{ v: 2, time: '23/10 08:15', lang: 'py', valid: false }, { v: 1, time: '22/10 21:55', lang: 'py', valid: true }] },
  { teamId: 't6', status: 'valid', elo: 1189, wins: 6, played: 10, lastSubmit: '22/10 18:20', versions: [{ v: 1, time: '22/10 18:20', lang: 'cpp', valid: true }] },
  { teamId: 't7', status: 'valid', elo: 1172, wins: 5, played: 10, lastSubmit: '22/10 16:40', versions: [{ v: 1, time: '22/10 16:40', lang: 'py', valid: true }] },
  { teamId: 't5', status: 'invalid', elo: 1148, wins: 4, played: 10, lastSubmit: '22/10 19:47', versions: [{ v: 1, time: '22/10 19:47', lang: 'py', valid: false }] },
  { teamId: 's1', status: 'none', elo: 1200, wins: 0, played: 0, lastSubmit: '—', versions: [] },
]

export type QualifierEvent = {
  id: string
  name: string
  deadline: string
  lockedBots: number
  round: number
  rounds: number
  matchesDone: number
  matchesTotal: number
  topK: number
  registered: boolean
  gitMode: boolean
  template: string
}

export const qualifierEvents: QualifierEvent[] = [
  { id: 'q1', name: 'Vòng loại OTTV2 K69 – Đợt 1', deadline: '23:59 24/10/2026', lockedBots: 2, round: 6, rounds: 10, matchesDone: 24, matchesTotal: 40, topK: 8, registered: true, gitMode: true, template: 'https://github.com/arena-k69/ottv2-bot-template' },
  { id: 'q2', name: 'Vòng loại bổ sung – Đợt 2', deadline: '23:59 02/11/2026', lockedBots: 0, round: 0, rounds: 8, matchesDone: 0, matchesTotal: 0, topK: 4, registered: false, gitMode: false, template: '' },
]

/* ------------------------------------------------------------------ */
/* Thông báo                                                           */
/* ------------------------------------------------------------------ */

export type Notification = { id: string; title: string; body: string; time: string; unread: boolean; target: ViewId }

export const initialNotifications: Notification[] = [
  { id: 'n1', title: 'Hiệp 4 đã mở nhận bài', body: 'Tứ Kết 2 áp dụng Đảo tương khắc, Sương mù, Chướng ngại vật và Ô hoán đổi.', time: '2 phút trước', unread: true, target: 'match' },
  { id: 'n2', title: 'Cập nhật lịch Bán Kết', body: 'Bán Kết mở nhận bài lúc 08:00 25/10/2026.', time: '1 giờ trước', unread: true, target: 'bracket' },
  { id: 'n3', title: 'Kết quả vòng loại', body: 'Cú Đêm K69 xếp hạng 2 với ELO 1.284 và giành suất vào giải chính.', time: '3 giờ trước', unread: true, target: 'qualifier' },
  { id: 'n4', title: 'Nhắc hạn nộp', body: 'Hạn nộp vòng loại đợt 1: 23:59 24/10/2026.', time: 'Hôm qua', unread: false, target: 'qualifier' },
]

/* ------------------------------------------------------------------ */
/* Admin – giám sát                                                    */
/* ------------------------------------------------------------------ */

export type WorkerState = 'healthy' | 'degraded' | 'down' | 'stale' | 'unknown'
export type Worker = {
  id: string
  address: string
  state: WorkerState
  active: number | null
  capacity: number | null
  latencyMs: number | null
  executed: number | null
  failed: number | null
}

export const workers: Worker[] = [
  { id: 'judge-01', address: '10.0.1.11:7070', state: 'healthy', active: 3, capacity: 4, latencyMs: 18, executed: 2184, failed: 3 },
  { id: 'judge-02', address: '10.0.1.12:7070', state: 'healthy', active: 2, capacity: 4, latencyMs: 22, executed: 2097, failed: 1 },
  { id: 'judge-03', address: '10.0.1.13:7070', state: 'degraded', active: 4, capacity: 4, latencyMs: 412, executed: 1630, failed: 27 },
  { id: 'judge-04', address: '10.0.1.14:7070', state: 'stale', active: null, capacity: 4, latencyMs: null, executed: 988, failed: 4 },
  { id: 'judge-05', address: '10.0.1.15:7070', state: 'down', active: null, capacity: null, latencyMs: null, executed: null, failed: null },
]

export const workerStateMeta: Record<WorkerState, { label: string; tone: 'success' | 'warning' | 'red' | 'neutral' }> = {
  healthy: { label: 'Hoạt động', tone: 'success' },
  degraded: { label: 'Suy giảm', tone: 'warning' },
  down: { label: 'Không phản hồi', tone: 'red' },
  stale: { label: 'Dữ liệu cũ', tone: 'neutral' },
  unknown: { label: 'Chưa rõ', tone: 'neutral' },
}

export type ExecLog = { id: number; time: string; task: string; worker: string; outcome: 'ok' | 'timeout' | 'error'; durationMs: number }

export const execLogs: ExecLog[] = [
  { id: 9, time: '20:14:52', task: 'QF-02 · Hiệp 4 · lượt 31', worker: 'judge-01', outcome: 'ok', durationMs: 42 },
  { id: 8, time: '20:14:51', task: 'Vòng loại · cặp 6-14', worker: 'judge-02', outcome: 'ok', durationMs: 1830 },
  { id: 7, time: '20:14:49', task: 'Kiểm tra bài S-4127', worker: 'judge-03', outcome: 'timeout', durationMs: 5000 },
  { id: 6, time: '20:14:47', task: 'QF-02 · Hiệp 4 · lượt 30', worker: 'judge-01', outcome: 'ok', durationMs: 38 },
  { id: 5, time: '20:14:44', task: 'Vòng loại · cặp 6-13', worker: 'judge-02', outcome: 'ok', durationMs: 1712 },
  { id: 4, time: '20:14:40', task: 'Kiểm tra bài S-4126', worker: 'judge-03', outcome: 'error', durationMs: 214 },
  { id: 3, time: '20:14:37', task: 'QF-02 · Hiệp 4 · lượt 29', worker: 'judge-01', outcome: 'ok', durationMs: 40 },
]

export type Account = { teamId: string; username: string; password: string | null; tournament: string | null }

export const accounts: Account[] = teams.map((t, i) => ({
  teamId: t.id,
  username: t.mssv,
  password: i === 4 ? null : `K69-${t.mssv.slice(-4)}-${['an', 'binh', 'cuc', 'dao', 'em', 'gia', 'ha', 'ich'][i]}`,
  tournament: i < 8 ? 'main-2026' : null,
}))

/* ------------------------------------------------------------------ */
/* Mã mẫu                                                              */
/* ------------------------------------------------------------------ */

export const pythonTemplate = `import sys

# Đọc trạng thái bàn cờ 9x9, in nước đi: hàng cột hàng_đích cột_đích
def read_state():
    n = int(sys.stdin.readline())
    board = [sys.stdin.readline().split() for _ in range(n)]
    return n, board

def choose_move(n, board):
    for r in range(n):
        for c in range(n):
            if board[r][c].startswith("B"):
                return r, c, max(0, r - 1), c
    return 0, 0, 0, 0

if __name__ == "__main__":
    n, board = read_state()
    print(*choose_move(n, board))
`

export const cppTemplate = `#include <bits/stdc++.h>
using namespace std;

// Đọc trạng thái bàn cờ 9x9, in nước đi
int main() {
    int n; cin >> n;
    vector<vector<string>> board(n, vector<string>(n));
    for (auto& row : board)
        for (auto& cell : row) cin >> cell;

    for (int r = 0; r < n; ++r)
        for (int c = 0; c < n; ++c)
            if (board[r][c][0] == 'B') {
                cout << r << ' ' << c << ' '
                     << max(0, r - 1) << ' ' << c << '\\n';
                return 0;
            }
    cout << "0 0 0 0\\n";
}
`

export const fetchedGithubSource = `# Nguồn: GitHub · commit 7c1e9a2
import sys
from collections import deque

DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

def main():
    n = int(sys.stdin.readline())
    board = [sys.stdin.readline().split() for _ in range(n)]
    # BFS tới căn cứ đối thủ, tránh ô tường "#"
    ...

main()
`

export const teamLabel: Record<Team, string> = { blue: 'Đội Xanh', red: 'Đội Đỏ' }
export const beats = normalBeats

export type LogEntry = { id: number; turn: number; team: Team; text: string }
export const initialLog: LogEntry[] = [
  { id: 1, turn: 42, team: 'blue', text: 'Đội Xanh điều quân Kéo áp sát căn cứ Đỏ.' },
  { id: 2, turn: 41, team: 'red', text: 'Đội Đỏ phòng thủ: Búa bảo vệ trung lộ.' },
]

export type SubmissionStatus = 'submitted' | 'pending' | 'error' | 'locked'
export type QualifierTeam = {
  id: string
  name: string
  sbd: string
  elo: number
  status: SubmissionStatus
  updatedAt: string
  locked?: boolean
  advanced?: boolean
  won?: number
  played?: number
}
export const qualifierTeams: QualifierTeam[] = teams.map((t, i) => ({
  id: t.id,
  name: t.name,
  sbd: t.mssv,
  elo: t.elo,
  status: i === 4 ? 'pending' : i === 7 ? 'error' : i % 2 === 0 ? 'submitted' : 'locked',
  updatedAt: '23/10 14:15',
  locked: i % 2 !== 0,
  advanced: i < 8,
  won: t.matchesWon,
  played: t.matchesPlayed,
}))
