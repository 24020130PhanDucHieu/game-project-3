'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, Shuffle, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate } from '@/lib/cache'
import { comboId, fromLocalInput, ruleBits, rulesMask, toLocalInput } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, Field, Select } from '../../ui'
import { useLive } from '../../context'

function TournamentCreate({ onDone }: { onDone: () => void }) {
  const { run, setTournamentId, tournaments, busy } = useLive()
  const [name, setName] = useState('')
  const [size, setSize] = useState('8')
  return (
    <form className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(e) => {
      e.preventDefault()
      void run(async () => {
        const created: any = await arenaApi.createTournament({ name: name.trim(), num_teams: Number(size) })
        const id = created?.tournament_id || created?.tournament?.tournament_id
        invalidate('tl')
        await tournaments.reload() // danh sách phải có giải mới trước, nếu không bộ chọn sẽ nhảy về giải cũ
        if (id) setTournamentId(id)
        setName('')
        onDone()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, `Đã tạo và chọn giải “${name.trim()}”`)
    }}>
      <Field label="Tên giải mới" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <Select label="Số đội" value={size} onChange={(e) => setSize(e.target.value)}>{[4, 8, 16, 32, 64, 128].map((n) => <option key={n} value={n}>{n} đội</option>)}</Select>
      <Button type="submit" disabled={busy || !name.trim()}><Plus className="size-4" />Tạo và chọn</Button>
    </form>
  )
}

function Roster({ tournament, id }: { tournament: any; id: string }) {
  const { run, confirm, busy } = useLive()
  const [sid, setSid] = useState('')
  const [name, setName] = useState('')
  const [uni, setUni] = useState('')
  const [swapA, setSwapA] = useState('')
  const [swapB, setSwapB] = useState('')
  const [dqId, setDqId] = useState('')
  const [dqReason, setDqReason] = useState('')
  const teams: any[] = tournament.teams || []
  const reload = () => { invalidate('t:'); invalidate('tl') }
  const full = teams.length >= tournament.num_teams
  const scheduled = Object.values(tournament.matches || {}).some((m: any) => m.team_a || m.team_b)

  return (
    <div className="space-y-6">
      <Card
        title={`Đội trong giải (${teams.length}/${tournament.num_teams})`}
        action={<>
          <Button size="sm" variant="secondary" disabled={busy || full} onClick={() => void run(() => arenaApi.quickFillTeams(id), 'Đã nạp đội mẫu', reload)}>Nạp đội mẫu</Button>
          <Button size="sm" disabled={busy || teams.length < 2} onClick={async () => { if (await confirm({ title: scheduled ? 'Xếp lại lịch đấu?' : 'Xếp lịch thi đấu?', message: 'Ghép cặp vòng 1 từ danh sách đội hiện tại. Server sẽ từ chối nếu đã có trận bắt đầu.', confirmLabel: 'Xếp lịch' })) void run(() => arenaApi.autoSchedule(id), 'Đã xếp lịch thi đấu', reload) }}><Shuffle className="size-4" />Xếp lịch</Button>
        </>}
      >
        {teams.length ? (
          <DataTable head={['MSSV', 'Đội', 'Trường', '']}>
            {teams.map((t) => (
              <tr key={t.student_id}>
                <td className="px-3 py-2.5 font-mono text-xs">{t.student_id}</td>
                <td className="px-3 py-2.5 font-medium">{t.team_name}{t.disqualified && <Badge tone="danger" className="ml-2">Bị loại</Badge>}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{t.university}</td>
                <td className="px-3 py-2.5 text-right"><Button size="sm" variant="ghost" aria-label={`Xóa ${t.team_name}`} disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa đội ${t.team_name}?`, danger: true, confirmLabel: 'Xóa' })) void run(() => arenaApi.removeTeam(id, t.student_id), 'Đã xóa đội khỏi giải', reload) }}><Trash2 className="size-4" /></Button></td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Chưa có đội" hint="Thêm đội thủ công, ghi danh từ tab Tài khoản, hoặc chuyển từ vòng loại." />}
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_2fr_auto] sm:items-end">
          <Field label="MSSV" value={sid} onChange={(e) => setSid(e.target.value)} />
          <Field label="Tên đội" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Trường" value={uni} onChange={(e) => setUni(e.target.value)} />
          <Button disabled={busy || full || !sid.trim() || !name.trim()} onClick={() => void run(async () => { await arenaApi.addTeam(id, { student_id: sid.trim(), team_name: name.trim(), university: uni.trim() || undefined }); setSid(''); setName(''); setUni('') }, 'Đã thêm đội', reload)}><UserPlus className="size-4" />Thêm</Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Hoán đổi cặp đấu" subtitle="Bị chặn nếu trận đã diễn ra">
          <div className="space-y-3">
            <Select label="Đội thứ nhất" value={swapA} onChange={(e) => setSwapA(e.target.value)}><option value="">— Chọn đội —</option>{teams.map((t) => <option key={t.student_id} value={t.student_id}>{t.team_name} ({t.student_id})</option>)}</Select>
            <Select label="Đội thứ hai" value={swapB} onChange={(e) => setSwapB(e.target.value)}><option value="">— Chọn đội —</option>{teams.filter((t) => t.student_id !== swapA).map((t) => <option key={t.student_id} value={t.student_id}>{t.team_name} ({t.student_id})</option>)}</Select>
            <Button variant="secondary" disabled={busy || !swapA || !swapB} onClick={() => void run(() => arenaApi.swapBracket(id, { teamA: swapA, teamB: swapB }), 'Đã hoán đổi cặp đấu', reload)}>Hoán đổi</Button>
          </div>
        </Card>
        <Card title="Loại đội khỏi giải">
          <div className="space-y-3">
            <Select label="Đội bị loại" value={dqId} onChange={(e) => setDqId(e.target.value)}><option value="">— Chọn đội —</option>{teams.map((t) => <option key={t.student_id} value={t.student_id}>{t.team_name} ({t.student_id})</option>)}</Select>
            <Field label="Lý do" value={dqReason} onChange={(e) => setDqReason(e.target.value)} placeholder="Vi phạm quy chế" />
            <Button variant="danger" disabled={busy || !dqId} onClick={async () => { if (await confirm({ title: 'Loại đội này?', message: 'Thao tác được ghi vào nhật ký quản trị.', danger: true, confirmLabel: 'Loại đội' })) void run(() => arenaApi.disqualifyTeam(id, { student_id: dqId, reason: dqReason }), 'Đã loại đội', reload) }}><UserMinus className="size-4" />Loại đội</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function StageEditor({ tournament, id }: { tournament: any; id: string }) {
  const { run, busy } = useLive()
  const levels = useMemo(() => {
    const map = new Map<number, string>()
    Object.values(tournament.matches || {}).forEach((m: any) => map.set(Number(m.round_level), m.round_name))
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [tournament])

  type Row = { start: string; end: string; mask: number; publish: string }
  const initial = useMemo(() => Object.fromEntries(levels.map(([level]) => {
    const w = tournament.stage_schedule?.[level]
    const r = tournament.stage_rules?.[level]
    return [level, { start: toLocalInput(w?.starts_at), end: toLocalInput(w?.ends_at), mask: r && !r.hidden ? rulesMask(r.rule_id) : 0, publish: toLocalInput(r?.publish_at) } as Row]
  })), [levels, tournament])
  const [rows, setRows] = useState<Record<string, Row>>(initial)
  const [dirtyRules, setDirtyRules] = useState<Set<number>>(new Set())
  const [dirtySchedule, setDirtySchedule] = useState(false)
  const [correction, setCorrection] = useState(false)
  useEffect(() => { setRows(initial); setDirtyRules(new Set()); setDirtySchedule(false) }, [initial])

  const patch = (level: number, change: Partial<Row>, kind: 'rule' | 'schedule') => {
    setRows((r) => ({ ...r, [level]: { ...r[level], ...change } }))
    if (kind === 'rule') setDirtyRules((s) => new Set(s).add(level))
    else setDirtySchedule(true)
  }
  const reload = () => { invalidate('t:') }

  if (!levels.length) return <Card title="Lịch và luật từng vòng"><EmptyState title="Giải chưa có vòng nào" /></Card>

  return (
    <Card title="Lịch và luật từng vòng" subtitle="Giờ theo múi giờ trình duyệt; server lưu Unix giây. Chỉ lưu những vòng bạn đã sửa." action={<CalendarClock className="size-4 text-muted-foreground" />}>
      <div className="space-y-4">
        {levels.map(([level, name]) => {
          const row = rows[level]
          if (!row) return null
          const locked = tournament.stage_rules?.[level] && !tournament.stage_rules[level].hidden && Number(tournament.stage_rules[level].publish_at || 0) * 1000 <= Date.now()
          return (
            <div key={level} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{name}</h3>{locked && <Badge tone="warning">Luật đã công bố (khóa)</Badge>}</div>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Mở vòng" type="datetime-local" value={row.start} onChange={(e) => patch(level, { start: e.target.value }, 'schedule')} />
                <Field label="Đóng vòng" type="datetime-local" value={row.end} onChange={(e) => patch(level, { end: e.target.value }, 'schedule')} />
                <Field label="Công bố luật (trống = ngay)" type="datetime-local" value={row.publish} onChange={(e) => patch(level, { publish: e.target.value }, 'rule')} />
                <fieldset className="md:col-span-1"><legend className="mb-1 text-xs font-semibold text-muted-foreground">Luật bật</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {ruleBits.map((b) => (
                      <label key={b.key} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-primary" checked={!!(row.mask & b.bit)} onChange={(e) => patch(level, { mask: e.target.checked ? row.mask | b.bit : row.mask & ~b.bit }, 'rule')} />{b.label}</label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={busy || !dirtySchedule} onClick={() => void run(() => arenaApi.setStageSchedule(id, { windows: levels.filter(([l]) => rows[l]?.start && rows[l]?.end).map(([level]) => ({ level, starts_at: fromLocalInput(rows[level].start), ends_at: fromLocalInput(rows[level].end) })) }), 'Đã lưu lịch các vòng', reload)}>Lưu lịch</Button>
        <Button disabled={busy || !dirtyRules.size} onClick={() => void run(() => arenaApi.setStageRules(id, [...dirtyRules].map((level) => ({ level, rule_id: comboId(rows[level].mask), publish_at: fromLocalInput(rows[level].publish) })), correction), 'Đã lưu luật các vòng', reload)}>Lưu luật ({dirtyRules.size} vòng)</Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="accent-primary" checked={correction} onChange={(e) => setCorrection(e.target.checked)} />Sửa luật đã công bố (chỉ khi vòng chưa có trận bắt đầu)</label>
      </div>
    </Card>
  )
}

export function TournamentTab() {
  const { tournament, tournamentId, tournaments, setTournamentId, run, confirm, busy } = useLive()
  const t = tournament.data
  const [creating, setCreating] = useState(false)
  const empty = tournaments.data && !tournaments.data.length
  useEffect(() => { if (empty) setCreating(true) }, [empty])
  const teams = t?.teams?.length ?? 0
  return (
    <div className="space-y-6">
      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Select label="Giải đang quản lý" aria-label="Chọn giải" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} className="min-w-64 flex-1">
            {!tournaments.data?.length && <option value="">Chưa có giải</option>}
            {tournaments.data?.filter((x) => x.track !== 'AI').map((x) => <option key={x.tournament_id} value={x.tournament_id}>{x.name} · {x.status}</option>)}
          </Select>
          <Button variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)} aria-expanded={creating}><Plus className="size-4" />{creating ? 'Đóng' : 'Tạo giải mới'}</Button>
          {tournamentId && <Button variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa giải “${t?.name || tournamentId}”?`, message: 'Toàn bộ trận, bài nộp và kết quả của giải sẽ bị xóa vĩnh viễn.', danger: true, confirmLabel: 'Xóa giải' })) void run(async () => { await arenaApi.deleteTournament(tournamentId); setTournamentId('') }, 'Đã xóa giải', () => { invalidate('tl'); invalidate('t:') }) }}><Trash2 className="size-4" />Xóa</Button>}
        </div>
        {creating && <div className="px-4 pb-4"><TournamentCreate onDone={() => setCreating(false)} /></div>}
        {t && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 text-xs">
            <Badge tone="accent">{t.status}</Badge>
            <Badge tone={teams >= t.num_teams ? 'success' : 'warning'}>{teams}/{t.num_teams} đội</Badge>
            <Badge tone="neutral">{Object.keys(t.matches || {}).length} trận</Badge>
            <span className="text-muted-foreground">Bước tiếp theo: {teams < t.num_teams ? 'thêm đủ đội' : !Object.values(t.matches || {}).some((m: any) => m.team_a) ? 'xếp lịch thi đấu' : 'đặt lịch và luật từng vòng'}</span>
          </div>
        )}
      </Card>
      {t ? <><Roster tournament={t} id={tournamentId} /><StageEditor tournament={t} id={tournamentId} /></> : tournamentId ? null : <EmptyState title="Chưa có giải để quản lý" hint="Bấm “Tạo giải mới” để bắt đầu." />}
    </div>
  )
}
