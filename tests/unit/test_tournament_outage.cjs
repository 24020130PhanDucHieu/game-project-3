const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function scenario(status, body, cleared) {
  const context = {
    API_BASE: 'http://arena', currentTournamentId: 'cup', currentTournamentData: {name:'Saved'},
    fetch: async () => ({status, ok:false, json:async()=>body}),
    resetSelectedMatch(){},
    sessionStorage:{removeItem(){}}, localStorage:{removeItem(){}},
    document:{getElementById:()=>({}),querySelector:()=>null}, setTimeout(){},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('frontend/static/js/tournaments/controller.js','utf8'),context);
  await context.refreshTournamentSnapshot('cup');
  assert.equal(context.currentTournamentId,cleared?null:'cup');
  if(!cleared) assert.equal(context.currentTournamentData.name,'Saved');
}
(async()=>{
 await scenario(503,{detail:'database unavailable'},false);
 await scenario(404,{detail:'proxy route missing'},false);
 await scenario(404,{code:'TOURNAMENT_NOT_FOUND',tournament_id:'other'},false);
 await scenario(404,{code:'TOURNAMENT_NOT_FOUND',tournament_id:'cup'},true);
 console.log('PASS outage: preserve state on service failure; clear only confirmed deletion');
})().catch(error=>{console.error(error);process.exitCode=1;});
