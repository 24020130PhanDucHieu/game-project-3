/** Định dạng thời gian, nhãn trạng thái và giải mã luật cho giao diện. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '' || value === 0) return null
  const number = Number(value)
  const date = Number.isFinite(number) ? new Date(number < 1e12 ? number * 1000 : number) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

export function stamp(value: unknown): string {
  const date = toDate(value)
  return date ? date.toLocaleString('vi-VN', { hour12: false }) : '—'
}

export function shortTime(value: unknown): string {
  const date = toDate(value)
  return date ? date.toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}

export function relative(value: unknown, nowMs = Date.now()): string {
  const date = toDate(value)
  if (!date) return '—'
  const diff = Math.round((date.getTime() - nowMs) / 1000)
  const abs = Math.abs(diff)
  const unit = abs < 60 ? `${abs} giây` : abs < 3600 ? `${Math.round(abs / 60)} phút` : abs < 86400 ? `${Math.round(abs / 3600)} giờ` : `${Math.round(abs / 86400)} ngày`
  return diff >= 0 ? `còn ${unit}` : `${unit} trước`
}

export function countdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00'
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d ? `${d} ngày ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Chuyển giây Unix <-> giá trị cho ô datetime-local. */
export function toLocalInput(value: unknown): string {
  const date = toDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

export const statusInfo: Record<string, { label: string; tone: Tone }> = {
  BANNED: { label: 'Bị loại', tone: 'danger' },
  // Giải đấu
  CONFIGURING: { label: 'Đang cấu hình', tone: 'neutral' },
  READY: { label: 'Sẵn sàng', tone: 'info' },
  CREATED: { label: 'Mới tạo', tone: 'neutral' },
  RUNNING: { label: 'Đang diễn ra', tone: 'success' },
  FINISHED: { label: 'Đã kết thúc', tone: 'accent' },
  // Trận đấu
  WAITING: { label: 'Chờ đội', tone: 'neutral' },
  PENDING: { label: 'Đang chờ', tone: 'warning' },
  IN_PROGRESS: { label: 'Đang đấu', tone: 'success' },
  COMPLETED: { label: 'Hoàn tất', tone: 'accent' },
  // Hiệp
  AWAITING_SUBMISSIONS: { label: 'Chờ nộp bot', tone: 'warning' },
  READY_FOR_BATTLE: { label: 'Sẵn sàng khai hỏa', tone: 'info' },
  BATTLE_RUNNING: { label: 'Đang chạy hiệp', tone: 'success' },
  ROUND_FINISHED: { label: 'Nghỉ giữa hiệp', tone: 'info' },
  // Vòng loại
  OPEN: { label: 'Đang nhận bài', tone: 'success' },
  CLOSING: { label: 'Đang đóng', tone: 'warning' },
  LOCKED: { label: 'Đã khóa bài', tone: 'info' },
  PAUSED: { label: 'Tạm dừng', tone: 'warning' },
  PROMOTED: { label: 'Đã chốt đội', tone: 'accent' },
  // Bài nộp / hàng đợi
  QUEUED: { label: 'Trong hàng đợi', tone: 'warning' },
  VALID: { label: 'Hợp lệ', tone: 'success' },
  VALIDATED: { label: 'Hợp lệ', tone: 'success' },
  INVALID: { label: 'Không hợp lệ', tone: 'danger' },
  NOT_SUBMITTED: { label: 'Chưa nộp', tone: 'neutral' },
  DONE: { label: 'Đã chấm', tone: 'success' },
  ERROR: { label: 'Lỗi chấm', tone: 'danger' },
  FAILED: { label: 'Thất bại', tone: 'danger' },
  EXECUTED: { label: 'Đã chạy', tone: 'success' },
  // Hạ tầng
  UNAVAILABLE: { label: 'Không khả dụng', tone: 'danger' },
  DEGRADED: { label: 'Suy giảm', tone: 'warning' },
  UNKNOWN: { label: 'Chưa rõ', tone: 'neutral' },
}

export function statusOf(status: unknown): { label: string; tone: Tone } {
  const key = String(status || '').toUpperCase()
  return statusInfo[key] ?? { label: key || '—', tone: 'neutral' }
}

export const qualifierSteps = ['OPEN', 'LOCKED', 'RUNNING', 'FINISHED', 'PROMOTED'] as const

/** Giải mã ID luật thành danh sách luật đang bật. */
export const ruleBits = [
  { bit: 1, key: 'shuffle', label: 'Trộn quân', hint: 'Số lượng và vị trí quân được xáo ngẫu nhiên, hai bên đối xứng.' },
  { bit: 2, key: 'reverse', label: 'Đảo tương khắc', hint: 'Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa.' },
  { bit: 4, key: 'fog', label: 'Sương mù', hint: 'Không thấy loại quân của đối thủ (hiện ?).' },
  { bit: 8, key: 'mystery', label: 'Ô bí ẩn', hint: 'Một số ô đặc biệt trên bàn kích hoạt hiệu ứng khi quân bước vào.' },
  { bit: 16, key: 'obstacles', label: 'Chướng ngại ngẫu nhiên', hint: 'Mỗi trận sinh ngẫu nhiên các khối đá đối xứng trên bàn; không quân nào đi vào hay xuyên qua được.' },
] as const

export function decodeRule(ruleId: unknown): { id: string; active: string[]; extra: string[] } {
  const id = String(ruleId || 'STAGE_1_STANDARD')
  const combo = /^COMBO_(\d+)$/.exec(id)
  if (combo) {
    const mask = Number(combo[1])
    return { id, active: ruleBits.filter((r) => mask & r.bit).map((r) => r.label), extra: [] }
  }
  switch (id) {
    case 'STAGE_2_MUTATED':
      return { id, active: ['Trộn quân'], extra: [] }
    case 'RULE_REVERSE':
      return { id, active: ['Đảo tương khắc'], extra: [] }
    case 'RULE_FOG':
      return { id, active: ['Sương mù'], extra: [] }
    case 'RULE_SPECIAL_TILES':
    case 'STAGE_SPECIAL_TILES':
      return { id, active: ['Ô bí ẩn'], extra: [] }
    case 'RULE_OBSTACLES':
    case 'STAGE_OBSTACLES':
      return { id, active: ['Chướng ngại ngẫu nhiên'], extra: [] }
    default:
      return { id, active: [], extra: [] }
  }
}

export function comboId(mask: number): string {
  return `COMBO_${mask}`
}

export function rulesMask(ruleId: unknown): number {
  const combo = /^COMBO_(\d+)$/.exec(String(ruleId || ''))
  if (combo) return Number(combo[1]) & 31
  const decoded = decodeRule(ruleId).active
  return ruleBits.reduce((mask, r) => (decoded.includes(r.label) ? mask | r.bit : mask), 0)
}

export function levelName(tournament: any, level: number): string {
  const match = Object.values(tournament?.matches || {}).find((m: any) => Number(m.round_level) === level) as any
  return match?.round_name || `Vòng ${level}`
}

export function sameStudent(a?: string, b?: string): boolean {
  return !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase()
}
