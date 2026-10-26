'use client'
import { AdminAiBank } from '@/components/arena/live/views/ai-cup/bank-admin'
import { TaskCard } from '@/components/arena/live/views/ai-cup/task-card'
import { CheckVisual } from '@/components/arena/live/views/ai-cup/check-visual'
import { LiveProvider } from '@/components/arena/live/context'
import { arenaApi } from '@/lib/api-client'
const board = 'rps......' + '.rp......' + '.........'.repeat(4) + '......RP.' + '......RPS' + '.........'
const entry = { id:'capture-test', name:'Có ăn quân không? (đảo tương khắc)', template:'capture_next', enabled:true, builtin:true, difficulty:2, tags:['luật'], params:{rule_id:'COMBO_2',n_train:400,time_s:8}, statement:'' }
let enabled = true
arenaApi.getAiBank = async () => ({entries:[{...entry,enabled}],templates:[{id:'capture_next',name:'Có ăn quân không?',kind:'class'}],policies:[]})
arenaApi.updateAiBankEntry = async (id, body: any) => { await new Promise(r=>setTimeout(r,700)); enabled=body.enabled; return {status:'SUCCESS'} }
arenaApi.getAiCupTaskData = async () => ({kind:'class',meta:{},train:{X:[{b:board,s:0},{b:board,s:1}],y:[1,0]}})
const base = { score:70,elapsed_ms:1250,n_train:320,n_val:3,y_true:[1,0,1],preds:[1,1,0],val_idx:[0,1,2] }
const samples = [{b:board,s:0,t:5},{b:board,s:1,t:8},{b:board,s:0,t:11}]
export default function Review() {return <LiveProvider><main className="mx-auto max-w-6xl space-y-8 p-3 sm:p-6"><AdminAiBank/><TaskCard eventId="preview" index={0} t={{...entry,n_train:400,time_s:8,kind:'class',rule_id:'COMBO_2',label_help:['0 = không ăn quân','1 = có ăn quân'],plain:'Dự đoán có ăn quân trong lượt hiện tại.',metric_plain:'Độ chính xác cân bằng.',chance:50}}/><CheckVisual data={{result:base as any,samples,classes:['Không ăn quân','Có ăn quân'],regression:false,chance:50}}/><CheckVisual data={{result:{...base,y_true:[2,-1,0],preds:[2.75,-1.5,0.1]} as any,samples,classes:[],regression:true,chance:0}}/></main></LiveProvider>}
