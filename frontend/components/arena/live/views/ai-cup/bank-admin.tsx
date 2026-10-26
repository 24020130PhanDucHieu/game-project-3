'use client'

import { useRef, useState } from 'react'
import { BookOpen, Copy, FlaskConical, Library, Pencil, Plus, Trash2, X } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, updateCache, useResource } from '@/lib/cache'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Select, SkeletonRows, TextArea } from '../../ui'
import { useLive } from '../../context'
import { fmt } from './common'
import { ProblemExplanation } from './problem-explanation'
import { useModalLayer } from '@/lib/scroll-lock'
import { createPortal } from 'react-dom'

function EntryPreview({ entry, onClose }: { entry: any; onClose: () => void }) {
  useModalLayer(onClose)
  return createPortal(<div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label={`Đề bài: ${entry.name}`} className="surface max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border p-5 sm:p-7" data-testid="bank-preview">
      <header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Xem đề trong kho</p><h3 className="mt-1 text-xl font-extrabold">{entry.name}</h3><p className="mt-1 text-xs text-muted-foreground">Mẫu đề · chưa phải bộ dữ liệu được bốc cho một giải cụ thể</p></div><Button size="sm" variant="ghost" onClick={onClose} aria-label="Đóng đề bài"><X className="size-4" /></Button></header>
      <ProblemExplanation task={{ ...entry, rule_id: entry.params?.rule_id, n_train: entry.params?.n_train, time_s: entry.params?.time_s }} />
      {entry.statement && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-primary/5 p-4 text-sm">Ghi chú của ban tổ chức: {entry.statement}</p>}
    </section>
  </div>, document.body)
}

const RULES: [string, string][] = [
  ['STAGE_1_STANDARD', 'Luật chuẩn'], ['COMBO_4', 'Sương mù'], ['COMBO_16', 'Vật cản ngẫu nhiên'], ['COMBO_2', 'Đảo tương khắc'],
  ['COMBO_6', 'Đảo tương khắc + sương mù'], ['COMBO_20', 'Sương mù + vật cản'], ['COMBO_7', 'Trộn quân + đảo + sương mù'],
]
const POLICY_LABEL: Record<string, string> = { random: 'Ngẫu nhiên', aggressive: 'Hiếu chiến theo lượt', counter: 'Phản đòn', majority: 'Ra lá nhiều nhất', hunter: 'Săn quân đông nhất' }
const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

type Draft = { id: string; name: string; template: string; difficulty: string; tags: string; statement: string; rule_id: string; mix: string[]; target: string; noise: string; n_train: string; n_public: string; n_private: string; time_s: string; horizon: string; cap: string }

const blank = (): Draft => ({ id: '', name: '', template: 'winner', difficulty: '2', tags: '', statement: '', rule_id: 'STAGE_1_STANDARD', mix: ['random', 'counter', 'majority', 'hunter', 'aggressive'], target: 'counter', noise: '0.1', n_train: '400', n_public: '200', n_private: '600', time_s: '8', horizon: '6', cap: '60' })

function fromEntry(e: any, clone: boolean): Draft {
  const p = e.params || {}
  return { id: clone ? `${e.id}-ban-sao` : e.id, name: clone ? `${e.name} (bản sao)` : e.name, template: e.template, difficulty: String(e.difficulty), tags: (e.tags || []).join(', '), statement: e.statement || '', rule_id: p.rule_id, mix: p.mix, target: p.target, noise: String(p.noise), n_train: String(p.n_train), n_public: String(p.n_public), n_private: String(p.n_private), time_s: String(p.time_s), horizon: String(p.horizon), cap: String(p.cap) }
}

const toPayload = (d: Draft) => ({
  id: d.id.trim(), name: d.name.trim(), template: d.template, difficulty: Number(d.difficulty), statement: d.statement.trim(),
  tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
  params: { rule_id: d.rule_id.trim(), mix: d.mix, target: d.target, noise: Number(d.noise), n_train: Number(d.n_train), n_public: Number(d.n_public), n_private: Number(d.n_private), time_s: Number(d.time_s), horizon: Number(d.horizon), cap: Number(d.cap) },
})

function ProbeResult({ r }: { r: any }) {
  if (!r) return null
  if (!r.ok) return <ErrorNote message={(r.errors || []).join(' ') || 'Đề chưa hợp lệ.'} />
  return (
    <div data-testid="bank-probe" className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Thời gian sinh</p><p className="font-semibold tabular-nums">{r.gen_ms} ms</p></div>
        <div><p className="text-xs text-muted-foreground">Kích thước dữ liệu</p><p className="font-semibold tabular-nums">{r.size_kb} KB</p></div>
        <div><p className="text-xs text-muted-foreground">Mức ngây thơ</p><p className="font-semibold tabular-nums">{fmt(r.naive)}</p></div>
        <div><p className="text-xs text-muted-foreground">Mô hình tham chiếu (công khai / riêng tư)</p><p className="font-semibold tabular-nums">{r.reference ? `${fmt(r.reference.public)} / ${fmt(r.reference.private)}` : '—'}</p></div>
      </div>
      <p className="text-xs text-muted-foreground">Mẫu: {r.samples?.train} huấn luyện · {r.samples?.public} công khai · {r.samples?.private} riêng tư · nhãn {JSON.stringify(r.label_stats)}</p>
      {(r.warnings || []).map((w: string) => <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">⚠ {w}</p>)}
      {!r.warnings?.length && <p className="text-xs text-emerald-700 dark:text-emerald-300">Đề giải được và đủ nhanh.</p>}
    </div>
  )
}

function EntryForm({ initial, editing, templates, onClose }: { initial: Draft; editing: boolean; templates: any[]; onClose: () => void }) {
  const { run, busy } = useLive()
  const [d, setD] = useState<Draft>(initial)
  const [probe, setProbe] = useState<any>(null)
  const [probing, setProbing] = useState(false)
  const set = (patch: Partial<Draft>) => { setD((v) => ({ ...v, ...patch })); setProbe(null) }
  const togglePolicy = (name: string) => set({ mix: d.mix.includes(name) ? d.mix.filter((m) => m !== name) : [...d.mix, name] })
  const test = async () => {
    setProbing(true)
    try { setProbe(await arenaApi.probeAiBankEntry(toPayload(d))) } catch (e) { setProbe({ ok: false, errors: [e instanceof Error ? e.message : 'Không thử được đề.'] }) } finally { setProbing(false) }
  }
  const save = () => run(() => (editing ? arenaApi.updateAiBankEntry(d.id.trim(), toPayload(d)) : arenaApi.createAiBankEntry(toPayload(d))), editing ? 'Đã cập nhật đề' : 'Đã thêm đề vào kho', () => { invalidate('ai:bank'); onClose() })
  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="bank-form">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{editing ? 'Sửa đề' : 'Thêm đề vào kho'}</h4><Button size="sm" variant="ghost" onClick={onClose} aria-label="Đóng"><X className="size-4" /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Mã đề (a-z, 0-9, gạch ngang)" value={d.id} disabled={editing} onChange={(e) => set({ id: e.target.value })} data-testid="bank-id" />
        <Field label="Tên đề" value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} data-testid="bank-name" />
        <Select label="Mẫu đề" value={d.template} onChange={(e) => set({ template: e.target.value })}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}</Select>
        <Select label="Luật bàn cờ" value={RULES.some(([v]) => v === d.rule_id) ? d.rule_id : '__custom'} onChange={(e) => set({ rule_id: e.target.value === '__custom' ? 'COMBO_0' : e.target.value })}>
          {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="__custom">Luật khác (nhập mã)…</option>
        </Select>
        {!RULES.some(([v]) => v === d.rule_id) && <Field label="Mã luật (STAGE_…, RULE_… hoặc COMBO_0–31)" value={d.rule_id} onChange={(e) => set({ rule_id: e.target.value.toUpperCase() })} />}
        <Select label="Độ khó" value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{DIFFICULTY[n]}</option>)}</Select>
        <Field label="Thẻ (cách nhau dấu phẩy)" value={d.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="thế cờ, sương mù" />
        <Field label="Số mẫu huấn luyện (50–800)" type="number" value={d.n_train} onChange={(e) => set({ n_train: e.target.value })} />
        <Field label="Mẫu kiểm tra công khai (50–400)" type="number" value={d.n_public} onChange={(e) => set({ n_public: e.target.value })} />
        <Field label="Mẫu kiểm tra riêng tư (100–1100)" type="number" value={d.n_private} onChange={(e) => set({ n_private: e.target.value })} />
        <Field label="Thời gian mỗi đề (2–10 giây)" type="number" value={d.time_s} onChange={(e) => set({ time_s: e.target.value })} />
        <Field label="Độ nhiễu chính sách (0–0,4)" type="number" step="0.05" value={d.noise} onChange={(e) => set({ noise: e.target.value })} />
        {d.template === 'material' && <Field label="Chân trời: số nước nhìn trước (1–20)" type="number" value={d.horizon} onChange={(e) => set({ horizon: e.target.value })} />}
        {d.template === 'plies_left' && <Field label="Trần số nước (10–120)" type="number" value={d.cap} onChange={(e) => set({ cap: e.target.value })} />}
        {d.template === 'nextcard' && <Select label="Chính sách của bên cần đoán" value={d.target} onChange={(e) => set({ target: e.target.value })}>{Object.entries(POLICY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
      </div>
      {d.template !== 'nextcard' && (
        <fieldset className="space-y-2"><legend className="text-xs font-semibold text-muted-foreground">Hỗn hợp chính sách của hai bên khi sinh ván</legend>
          <div className="flex flex-wrap gap-3">{Object.entries(POLICY_LABEL).map(([v, l]) => <label key={v} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-primary" checked={d.mix.includes(v)} onChange={() => togglePolicy(v)} />{l}</label>)}</div>
        </fieldset>
      )}
      <TextArea label="Mô tả thêm cho đội (tùy chọn, ≤ 600 ký tự)" rows={2} maxLength={600} value={d.statement} onChange={(e) => set({ statement: e.target.value })} />
      <ProbeResult r={probe} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={probing} onClick={() => void test()} data-testid="bank-probe-btn"><FlaskConical className="size-4" />Thử đề (đo tốc độ và độ khó)</Button>
        <Button disabled={busy || !d.id.trim() || !d.name.trim() || !d.mix.length} onClick={() => void save()} data-testid="bank-save"><Plus className="size-4" />{editing ? 'Lưu thay đổi' : 'Lưu vào kho'}</Button>
      </div>
    </div>
  )
}

export function AdminAiBank() {
  const { run, confirm, toast } = useLive()
  const bank = useResource<any>('ai:bank', () => arenaApi.getAiBank(), { ttl: 10_000, refreshMs: 30_000 })
  const [form, setForm] = useState<{ draft: Draft; editing: boolean } | null>(null)
  const [probe, setProbe] = useState<{ id: string; result: any } | null>(null)
  const [probing, setProbing] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({})
  const locks = useRef(new Set<string>())
  const entries: any[] = (bank.data?.entries || []).map((e: any) => e.id in pendingEnabled ? { ...e, enabled: pendingEnabled[e.id] } : e)
  const templates = bank.data?.templates || []
  const nameOf = (id: string) => templates.find((t: any) => t.id === id)?.name || id
  const toggle = async (entry: any, enabled: boolean) => {
    if (locks.current.has(entry.id)) return
    locks.current.add(entry.id)
    setPendingEnabled((old) => ({ ...old, [entry.id]: enabled }))
    setSaving(new Set(locks.current))
    const patch = (value: boolean) => updateCache<any>('ai:bank', (data) => data ? { ...data, entries: data.entries.map((e: any) => e.id === entry.id ? { ...e, enabled: value } : e) } : data)
    patch(enabled)
    try {
      await arenaApi.updateAiBankEntry(entry.id, { enabled })
      toast('success', enabled ? 'Đã bật đề' : 'Đã tắt đề')
    } catch (error) {
      patch(entry.enabled)
      invalidate('ai:bank') // chỉ tải lại khi lưu lỗi; lưu được thì bộ đệm đã đúng, tải lại chỉ làm bảng nháy
      toast('error', error instanceof Error ? error.message : 'Chưa lưu được trạng thái đề.')
    } finally {
      locks.current.delete(entry.id)
      setPendingEnabled((old) => { const next = { ...old }; delete next[entry.id]; return next })
      setSaving(new Set(locks.current))
    }
  }
  const test = async (e: any) => {
    setProbing(e.id)
    try { setProbe({ id: e.id, result: await arenaApi.probeAiBankEntry(e) }) } catch (err) { setProbe({ id: e.id, result: { ok: false, errors: [err instanceof Error ? err.message : 'Không thử được đề.'] } }) } finally { setProbing('') }
  }
  return (
    <Card icon={<Library />} title="Kho đề Giải AI" subtitle="Đề học từ thế cờ do máy sinh từ engine bàn cờ. Admin bốc ngẫu nhiên từ kho khi ra đề; có thể thêm đề mới và bật/tắt đề.">
      <div className="space-y-4">
        {preview && <EntryPreview entry={preview} onClose={() => setPreview(null)} />}
        {!form && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
            <Button onClick={() => setForm({ draft: blank(), editing: false })} data-testid="bank-add-body"><Plus className="size-4" />Thêm đề mới vào kho</Button>
            <p className="text-xs text-muted-foreground">Chọn mẫu đề, chỉnh luật bàn cờ và tham số, bấm “Thử đề” để đo rồi lưu. Cũng có thể bấm biểu tượng nhân bản ở một đề có sẵn để sửa từ đó.</p>
          </div>
        )}
        {form && <EntryForm key={form.draft.id + String(form.editing)} initial={form.draft} editing={form.editing} templates={templates} onClose={() => setForm(null)} />}
        {bank.loading && !bank.data ? <SkeletonRows rows={5} /> : bank.error && !bank.data ? <ErrorNote message={bank.error.message} onRetry={() => void bank.reload()} /> : !entries.length ? <EmptyState title="Kho đề trống" /> : (
          <DataTable head={['Đề', 'Mẫu', 'Luật', 'Độ khó', 'Thẻ', 'Nguồn', 'Trạng thái', '']}>
            {entries.map((e) => [
              <tr key={e.id} data-testid="bank-row" className={e.enabled ? 'transition-opacity duration-200' : 'opacity-60 transition-opacity duration-200'}>
                <td className="px-3 py-2.5 font-medium">{e.name}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{e.id}</span></td>
                <td className="px-3 py-2.5 text-xs">{nameOf(e.template)}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{e.params.rule_id}</td>
                <td className="px-3 py-2.5"><Badge tone={e.difficulty === 1 ? 'success' : e.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[e.difficulty]}</Badge></td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{(e.tags || []).join(', ')}</td>
                <td className="px-3 py-2.5">{e.builtin ? <Badge>Dựng sẵn</Badge> : <Badge tone="accent">Admin thêm</Badge>}</td>
                <td className="px-3 py-2.5"><label className="flex min-w-24 items-center gap-1.5 text-xs"><input type="checkbox" className="accent-primary" checked={e.enabled} onChange={(event) => void toggle(e, event.target.checked)} aria-label={`Bật đề ${e.name}`} />{e.enabled ? 'Bật' : 'Tắt'}</label></td>
                <td className="px-3 py-2.5"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setPreview(e)} data-testid="bank-row-view"><BookOpen className="size-3.5" />Xem đề</Button>
                  <Button size="sm" variant="secondary" loading={probing === e.id} onClick={() => void test(e)} data-testid="bank-row-probe"><FlaskConical className="size-3.5" />Thử</Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ draft: fromEntry(e, true), editing: false })} aria-label="Nhân bản"><Copy className="size-3.5" /></Button>
                  {!e.builtin && <Button size="sm" variant="ghost" onClick={() => setForm({ draft: fromEntry(e, false), editing: true })} aria-label="Sửa"><Pencil className="size-3.5" /></Button>}
                  {!e.builtin && <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label="Xóa" onClick={async () => { if (await confirm({ title: `Xóa đề “${e.name}”?`, message: 'Bộ đề đã bốc trước đó vẫn giữ bản sao thông số của đề này.', danger: true, confirmLabel: 'Xóa' })) void run(() => arenaApi.deleteAiBankEntry(e.id), 'Đã xóa đề', () => invalidate('ai:bank')) }}><Trash2 className="size-3.5" /></Button>}
                </div></td>
              </tr>,
              probe && probe.id === e.id && <tr key={`${e.id}-probe`}><td colSpan={8} className="p-3"><ProbeResult r={probe.result} /></td></tr>,
            ])}
          </DataTable>
        )}
      </div>
    </Card>
  )
}
