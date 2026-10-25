'use client'

import { useState } from 'react'
import { Activity, FileSpreadsheet, Flag, LockKeyhole, Megaphone, MessageCircleQuestion, MonitorPlay, ScanSearch, ScrollText, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Card, EmptyState, SectionTitle, Tabs } from '../ui'
import { useLive } from '../context'
import { MonitorTab } from './admin/monitor'
import { TournamentTab } from './admin/tournament'
import { QualifierAdminTab } from './admin/qualifier-admin'
import { AccountsTab, LogsTab, NotifyTab } from './admin/accounts-notify-logs'
import { JudgesTab } from './admin/judges'
import { AdminClarifications } from '../clarifications'
import { AiAdminCard } from '../ai-admin'
import { ImportExportTab } from './admin/import-export'
import { AntiCheatTab } from './admin/anticheat'
import { SecurityCard } from './admin/security'
import { Button } from '../ui'

type AdminTab = 'monitor' | 'tournament' | 'qualifier' | 'accounts' | 'notify' | 'logs' | 'judges' | 'clar' | 'io' | 'cheat' | 'security'

export function AdminView() {
  const { role, session } = useLive()
  const [tab, setTab] = useState<AdminTab>('monitor')
  if (role !== 'ADMIN') {
    return <Card><EmptyState title="Chỉ dành cho ban tổ chức" hint="Đăng nhập bằng tài khoản quản trị để mở khu này." /></Card>
  }
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Ban tổ chức" title="Quản trị Admin">
        <Button variant="secondary" onClick={() => { window.location.hash = 'trinh-chieu' }}><MonitorPlay className="size-4" />Màn hình trình chiếu</Button>
      </SectionTitle>
      <Tabs<AdminTab>
        value={tab} onChange={setTab}
        tabs={[
          { id: 'monitor', label: 'Giám sát', icon: <Activity className="size-4" /> },
          { id: 'tournament', label: 'Giải & Đội', icon: <Trophy className="size-4" /> },
          { id: 'qualifier', label: 'Vòng loại', icon: <Flag className="size-4" /> },
          { id: 'accounts', label: 'Tài khoản', icon: <Users className="size-4" /> },
          { id: 'io', label: 'Nhập/Xuất', icon: <FileSpreadsheet className="size-4" /> },
          { id: 'notify', label: 'Thông báo', icon: <Megaphone className="size-4" /> },
          { id: 'clar', label: 'Hỏi đáp', icon: <MessageCircleQuestion className="size-4" /> },
          { id: 'cheat', label: 'Chống gian lận', icon: <ScanSearch className="size-4" /> },
          { id: 'logs', label: 'Nhật ký', icon: <ScrollText className="size-4" /> },
          { id: 'security', label: 'Bảo mật', icon: <LockKeyhole className="size-4" /> },
          ...(session.owner ? [{ id: 'judges' as const, label: 'Giám khảo', icon: <ShieldCheck className="size-4" /> }] : []),
        ]}
      />
      {tab === 'monitor' && <MonitorTab onGo={setTab} />}
      {tab === 'tournament' && <TournamentTab />}
      {tab === 'qualifier' && <QualifierAdminTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'notify' && <NotifyTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'judges' && <JudgesTab />}
      {tab === 'clar' && <div className="space-y-6"><AiAdminCard /><AdminClarifications /></div>}
      {tab === 'io' && <ImportExportTab />}
      {tab === 'cheat' && <AntiCheatTab />}
      {tab === 'security' && <SecurityCard />}
    </div>
  )
}
