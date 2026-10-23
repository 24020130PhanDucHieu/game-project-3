import { HandFist, Hand, Scissors } from 'lucide-react'
import { Card, Pill } from '../primitives'

export function Scoreboard({
  blueScore,
  redScore,
  blueHp,
  redHp,
  blueUnits,
  redUnits,
}: {
  blueScore: number
  redScore: number
  blueHp: number
  redHp: number
  blueUnits: number
  redUnits: number
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/50 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="red" dot className="uppercase tracking-wide">
            Trực tiếp
          </Pill>
          <Pill tone="neutral" className="font-mono">
            Round 3/5
          </Pill>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-foreground">Tứ Kết · Đảo tương khắc:</span>
          <RuleChip icon={<HandFist className="size-3.5" />} text="Búa thắng Bao" />
          <RuleChip icon={<Hand className="size-3.5" />} text="Bao thắng Kéo" />
          <RuleChip icon={<Scissors className="size-3.5" />} text="Kéo thắng Búa" />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 sm:gap-6 sm:px-6">
        <TeamSide name="Đội Xanh" tag="ap" hp={blueHp} units={blueUnits} tone="blue" />
        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-2 font-mono text-3xl font-bold tabular-nums sm:text-4xl">
            <span className="text-team-blue">{blueScore}</span>
            <span className="text-lg text-muted-foreground">:</span>
            <span className="text-team-red">{redScore}</span>
          </div>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">VS</span>
        </div>
        <TeamSide name="Đội Đỏ" tag="NullPointer" hp={redHp} units={redUnits} tone="red" align="right" />
      </div>
    </Card>
  )
}

function RuleChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-muted-foreground">
      {icon}
      {text}
    </span>
  )
}

function TeamSide({
  name,
  tag,
  hp,
  units,
  tone,
  align = 'left',
}: {
  name: string
  tag: string
  hp: number
  units: number
  tone: 'blue' | 'red'
  align?: 'left' | 'right'
}) {
  const right = align === 'right'
  const color = tone === 'blue' ? 'bg-team-blue' : 'bg-team-red'
  return (
    <div className={right ? 'text-right' : ''}>
      <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <span className={`size-3 shrink-0 rounded-full ${color}`} aria-hidden />
        <p className="truncate text-sm font-semibold text-foreground sm:text-base">{name}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
        {tag} · {units} quân
      </p>
      <div className="mt-2.5">
        <div className={`mb-1 flex text-[11px] font-medium text-muted-foreground ${right ? 'justify-start' : 'justify-end'}`}>
          <span className="font-mono tabular-nums">HP {hp}/100</span>
        </div>
        <div
          className={`h-2 overflow-hidden rounded-full bg-secondary ${right ? 'flex justify-end' : ''}`}
          role="progressbar"
          aria-valuenow={hp}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Máu căn cứ ${name}`}
        >
          <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${hp}%` }} />
        </div>
      </div>
    </div>
  )
}
