'use client'

import { useEffect, useState } from 'react'
import type { ViewId } from '@/lib/arena-data'
import { arenaApi } from '@/lib/api-client'
import { AdminView } from './admin/admin-view'
import { MatchView } from './match/match-view'
import { QualifierView } from './qualifier-view'
import { BracketView, GuideView, OverviewView, ProfileView, RankingView } from './secondary-views'
import { Sidebar } from './sidebar'
import { TopHeader, type AuthMode } from './top-header'

// Modals
import { AuthModal, type AuthModalMode } from './modals/auth-modal'
import { PracticeModal } from './modals/practice-modal'
import {
  CreateTournamentModal,
  StageRulesModal,
  StageScheduleModal,
  TournamentListModal,
} from './modals/tournament-modals'
import { BracketSwapModal } from './modals/bracket-swap-modal'
import { TeamManagerModal } from './modals/team-manager-modal'
import { BroadcastModal } from './modals/broadcast-modal'
import { EditProfileModal } from './modals/edit-profile-modal'

const titles: Record<ViewId, string> = {
  profile: 'Hồ sơ đội',
  overview: 'Tổng quan đấu trường',
  bracket: 'Bảng đấu',
  ranking: 'Xếp hạng ELO',
  match: 'Phòng thi đấu 9×9',
  qualifier: 'Vòng loại',
  guide: 'Hướng dẫn thi đấu',
  admin: 'Bàn Quản Trị',
  login: 'Đăng nhập',
}

export function ArenaApp() {
  const [view, setView] = useState<ViewId>('overview')
  const [auth, setAuth] = useState<AuthMode>('guest')
  const [menuOpen, setMenuOpen] = useState(false)

  // Team Identity state
  const [teamName, setTeamName] = useState('ap (Cú Đêm K69)')
  const [teamSid, setTeamSid] = useState('24020277')
  const [activeTournId, setActiveTournId] = useState('tourn_0186d1')
  const [activeMatchId, setActiveMatchId] = useState('m_lvl1_1')
  const [activeTournName, setActiveTournName] = useState('Giải Đấu BOT K69 Mùa 2')

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login')
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [createTournOpen, setCreateTournOpen] = useState(false)
  const [tournListOpen, setTournListOpen] = useState(false)
  const [stageScheduleOpen, setStageScheduleOpen] = useState(false)
  const [stageRulesOpen, setStageRulesOpen] = useState(false)
  const [bracketSwapOpen, setBracketSwapOpen] = useState(false)
  const [teamManagerOpen, setTeamManagerOpen] = useState(false)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)

  useEffect(() => {
    arenaApi.getSession().then((sess) => {
      if (sess && sess.role === 'ADMIN') {
        setAuth('admin')
        setTeamName('Ban Tổ Chức (Admin)')
      } else if (sess && sess.role === 'TEAM') {
        setAuth('team')
        if (sess.team_name) setTeamName(sess.team_name)
        if (sess.student_id) setTeamSid(sess.student_id)
      }
    }).catch(() => {})

    arenaApi.getTournamentList().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        const running = list.find((t: any) => t.status === 'RUNNING') || list[0]
        setActiveTournId(running.id)
        if (running.name) setActiveTournName(running.name)
      }
    }).catch(() => {})
  }, [])

  function openAuth(mode: AuthModalMode) {
    setAuthModalMode(mode)
    setAuthModalOpen(true)
  }

  function handleLoginSuccess(role: 'team' | 'admin', name: string, sid: string) {
    setAuth(role)
    setTeamName(name)
    setTeamSid(sid)
    setView('overview')
  }

  function navigate(nextView: ViewId) {
    if (nextView === 'admin' && auth !== 'admin') return
    if (nextView === 'profile' && auth !== 'team') return
    setView(nextView)
  }

  async function handleLogout() {
    try {
      await arenaApi.logout()
    } catch {
      // Local session is cleared by the API client even if the server is unreachable.
    } finally {
      setAuth('guest')
      setView('overview')
      setTeamName('')
      setTeamSid('')
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        view={view}
        onNavigate={(v) => {
          navigate(v)
          setMenuOpen(false)
        }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        auth={auth}
        teamName={teamName}
        teamSid={teamSid}
        onOpenLogin={() => openAuth('login')}
        onOpenRegister={() => openAuth('register')}
        onOpenNotifications={() => setBroadcastOpen(true)}
        onOpenPractice={() => setPracticeOpen(true)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          title={titles[view]}
          auth={auth}
          teamName={teamName}
          teamSid={teamSid}
          activeTournamentName={activeTournName}
          onLogout={handleLogout}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenTournList={() => setTournListOpen(true)}
          onOpenLogin={() => openAuth('login')}
          onOpenRegister={() => openAuth('register')}
          onOpenNotifications={() => setBroadcastOpen(true)}
          onOpenProfile={() => setEditProfileOpen(true)}
        />

        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {view === 'match' && (
            <MatchView
              canSubmit={auth === 'team'}
              isAdmin={auth === 'admin'}
              tournamentId={activeTournId}
              matchId={activeMatchId}
              onBackToBracket={() => setView('bracket')}
            />
          )}

          {view === 'qualifier' && <QualifierView />}

          {view === 'admin' && auth === 'admin' && <AdminView />}

          {view === 'ranking' && <RankingView />}

          {view === 'bracket' && (
            <BracketView
              isAdmin={auth === 'admin'}
              onOpenCreateTourn={() => setCreateTournOpen(true)}
              onOpenStageSchedule={() => setStageScheduleOpen(true)}
              onOpenStageRules={() => setStageRulesOpen(true)}
              onOpenBracketSwap={() => setBracketSwapOpen(true)}
              onOpenTournList={() => setTournListOpen(true)}
              onOpenTeamManager={() => setTeamManagerOpen(true)}
              onSelectMatch={(mId) => {
                if (mId) setActiveMatchId(mId)
                setView('match')
              }}
            />
          )}

          {view === 'overview' && (
            <OverviewView
              onEnterMatch={() => setView('match')}
              onViewBracket={() => setView('bracket')}
              onViewFullRanking={() => setView('ranking')}
            />
          )}

          {view === 'profile' && auth === 'team' && (
            <ProfileView
              onEditProfile={() => setEditProfileOpen(true)}
              onGoToBracket={() => setView('bracket')}
            />
          )}

          {view === 'guide' && <GuideView />}
        </main>
      </div>

      {/* ===================================================================== */}
      {/* CÁC MODAL HỆ THỐNG MỞ RỘNG                                           */}
      {/* ===================================================================== */}

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onLoginSuccess={handleLoginSuccess}
      />

      <PracticeModal
        open={practiceOpen}
        onClose={() => setPracticeOpen(false)}
      />

      <CreateTournamentModal
        open={createTournOpen}
        onClose={() => setCreateTournOpen(false)}
        onCreate={(tourn: any) => {
          if (tourn?.id) setActiveTournId(tourn.id)
          if (tourn?.name) setActiveTournName(tourn.name)
        }}
      />

      <TournamentListModal
        open={tournListOpen}
        onClose={() => setTournListOpen(false)}
        onSelect={(id) => {
          setActiveTournId(id)
          arenaApi.getTournament(id).then((t: any) => {
            if (t?.name) setActiveTournName(t.name)
          }).catch(() => {})
        }}
      />

      <StageScheduleModal
        open={stageScheduleOpen}
        onClose={() => setStageScheduleOpen(false)}
        tournamentName={activeTournName}
        onSave={async (schedule) => {
          try {
            await arenaApi.setStageSchedule(activeTournId, schedule)
            alert('Đã cập nhật lịch thi đấu thành công!')
          } catch (err: any) {
            alert(`Lỗi lưu lịch: ${err.message}`)
          }
        }}
      />

      <StageRulesModal
        open={stageRulesOpen}
        onClose={() => setStageRulesOpen(false)}
        tournamentName={activeTournName}
        onSave={async (rules) => {
          try {
            await arenaApi.setStageRules(activeTournId, rules)
            alert('Đã cập nhật luật thi đấu thành công!')
          } catch (err: any) {
            alert(`Lỗi lưu luật: ${err.message}`)
          }
        }}
      />

      <BracketSwapModal
        open={bracketSwapOpen}
        onClose={() => setBracketSwapOpen(false)}
        onSwap={async (team1, team2) => {
          try {
            await arenaApi.swapBracket(activeTournId, { teamA: team1, teamB: team2 })
            alert('Đã hoán đổi vị trí hai đội trên sơ đồ nhánh!')
          } catch (err: any) {
            alert(`Lỗi hoán đổi: ${err.message}`)
          }
        }}
        onDisqualify={async (teamId, reason) => {
          try {
            await arenaApi.disqualifyTeam(activeTournId, { student_id: teamId, reason })
            alert('Đã ghi nhận xử loại đội thi!')
          } catch (err: any) {
            alert(`Lỗi xử loại: ${err.message}`)
          }
        }}
      />

      <TeamManagerModal
        open={teamManagerOpen}
        onClose={() => setTeamManagerOpen(false)}
        tournamentId={activeTournId}
      />

      <BroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        isAdmin={auth === 'admin'}
        onNavigate={(targetView) => setView(targetView)}
      />

      <EditProfileModal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        onSave={async (data) => {
          try {
            await arenaApi.updateProfile({
              team_name: data.name,
              captain: data.captain,
              university: data.uni,
              preferred_language: data.lang,
              bio: data.bio,
            })
            setTeamName(data.name)
          } catch (err: any) {
            alert(`Lỗi lưu hồ sơ: ${err.message}`)
          }
        }}
      />
    </div>
  )
}
