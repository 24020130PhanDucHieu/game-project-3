const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let time=0,tick,index=-1,starts=0;
const steps=Array.from({length:66},(_,i)=>({red_pieces:[i],blue_pieces:[],log:String(i)}));
const c={currentTournamentId:'t',currentActiveMatchId:'m',currentAppRole:'TEAM',Date:{now:()=>time},
  document:{getElementById:()=>null},clearInterval(){},setInterval(fn){tick=fn;return 1},
  renderChessboard:red=>{index=red[0]},renderLiveAction(){},renderCategorizedLogs(){},setBattleCommentary(){},
  inlinePlaybackCurrentIdx:0,realtimePlaybackTimer:null,startRealtimeAutoPlay(){starts++}};
vm.createContext(c);vm.runInContext(fs.readFileSync('frontend-cu/static/js/core/persistence.js','utf8'),c);
const m={rounds_history:[{round_number:1,board_steps:steps}],round_status:'WAITING_BOTS'};
c.syncLiveRoundBoard(m);assert.equal(index,0);
time=500;tick();assert.equal(index,2,'250 ms per move even after server finished');
m.round_status='ROUND_FINISHED';c.syncLiveRoundBoard(m);assert.equal(index,2,'status polling does not restart or skip playback');
time=16250;tick();assert.equal(index,65);
c.currentAppRole='ADMIN';c.syncLiveRoundBoard(m);assert.equal(starts,1);
c.syncLiveRoundBoard(m);assert.equal(starts,1,'polling must not restart admin playback');
m.rounds_history.push({round_number:2,board_steps:steps});c.syncLiveRoundBoard(m);assert.equal(starts,2);
console.log('PASS: independent 250ms playback, polling stability, admin starts once per new round');
