import { memo, useEffect, useRef, useState } from 'react';
import { ArrowDown, GitBranch, Hand, Play, Sparkles } from 'lucide-react';
import { RobotAgent } from '@/components/RobotAgent';
import { AGENT_DEFINITIONS } from '@/lib/agents';
import type { AgentId, AgentState, LearningParadigm } from '@/types';

interface Props {
  agentStates: Record<AgentId, AgentState>;
  currentAgentId: AgentId | null;
  learningParadigm: LearningParadigm;
  workflowCompleted: boolean;
  onAgentClick: (agentId: AgentId) => void;
  onGoDashboard: () => void;
}

function Handover({ active=false, done=false }: { active?: boolean; done?: boolean }) {
  return <div className="relative h-12 flex items-center justify-center">
    <div className={`w-px h-full ${done?'bg-synapse-500/50':active?'bg-synapse-500/70':'bg-slate-800'}`} />
    {(active || done) && <div className="absolute inset-0 flex items-center justify-center">
      <div className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${active?'border-synapse-400/60 bg-synapse-500/10 shadow-glow-sm':'border-synapse-500/25 bg-synapse-500/5'}`}>
        <Hand size={11} className="text-synapse-300"/>
        <span className="w-2.5 h-2.5 rounded-full bg-synapse-400 shadow-glow animate-pulse" />
        <Hand size={11} className="text-synapse-300 rotate-180"/>
      </div>
    </div>}
    <ArrowDown size={12} className={`absolute bottom-0 ${active||done?'text-synapse-400':'text-slate-700'}`}/>
  </div>;
}

function AgentCard({ id, state, active, label, role, onClick }: { id: AgentId; state: AgentState; active:boolean; label?:string; role?:string; onClick:()=>void }) {
  const base=AGENT_DEFINITIONS[id];
  return <div className={`${active?'':'opacity-35 grayscale-[.25]'}`}>
    <RobotAgent definition={{...base,name:label??base.name,role:role??base.role}} state={state} isCurrent={active && state.status!=='idle'} onClick={onClick}/>
  </div>;
}

function WorkflowCanvasComponent({ agentStates,currentAgentId,learningParadigm,workflowCompleted,onAgentClick,onGoDashboard}:Props){
  const running = (id:AgentId)=>currentAgentId===id && agentStates[id].status!=='idle';
  const done = (id:AgentId)=>agentStates[id].endTime !== null && agentStates[id].status !== 'error';
  const sup = learningParadigm==='supervised';
  const unsup = learningParadigm==='unsupervised';
  const flowVideoRef = useRef<HTMLVideoElement>(null);
  const flowVideoBgRef = useRef<HTMLVideoElement>(null);
  const [showFlowVideo, setShowFlowVideo] = useState(false);

  useEffect(() => {
    const shouldShow = currentAgentId === 'data_analyst' && agentStates.data_analyst.status !== 'idle';
    setShowFlowVideo(shouldShow);
    if (shouldShow && flowVideoRef.current) {
      flowVideoRef.current.currentTime = 0;
      if (flowVideoBgRef.current) flowVideoBgRef.current.currentTime = 0;
      void flowVideoRef.current.play().catch(() => {});
      void flowVideoBgRef.current?.play().catch(() => {});
    }
  }, [currentAgentId, agentStates.data_analyst.status]);

  const handleFlowVideoEnded = () => setShowFlowVideo(false);
  return <div className="w-full">
    <div className="flex items-center justify-center gap-2 mb-3 text-[9px] font-mono tracking-[0.22em] text-slate-600"><Sparkles size={11}/><span>LIVE AGENT ORCHESTRATION · DATA HANDOVER</span><GitBranch size={11}/></div>

    <div className="grid grid-cols-1 lg:grid-cols-[minmax(190px,0.46fr)_minmax(0,1.54fr)] gap-4 items-start">
      <div className={`lg:sticky lg:top-24 self-start min-h-[720px] h-[calc(100vh-150px)] rounded-2xl border border-synapse-500/15 bg-black overflow-hidden transition-all duration-500 ${showFlowVideo ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`} aria-hidden={!showFlowVideo}>
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={flowVideoBgRef}
            src="/"
            muted
            playsInline
            preload="auto"
            className="w-full h-full object-cover scale-110 blur-2xl opacity-35"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,136,.14),transparent_48%),linear-gradient(180deg,rgba(0,5,4,.25),rgba(0,5,4,.78))]" />
        </div>
        <div className="relative z-10 h-full flex flex-col">
          <div className="px-3 py-2 border-b border-synapse-500/10 flex items-center justify-between bg-surface-100/25 backdrop-blur-sm shrink-0">
            <span className="text-[8px] font-mono tracking-[0.18em] text-synapse-400">AGENT ACTIVITY</span>
            <span className="w-1.5 h-1.5 rounded-full bg-synapse-400 animate-pulse shadow-glow-sm" />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3">
            <div className="h-full max-h-full aspect-[9/16] rounded-xl overflow-hidden border border-synapse-500/15 shadow-glow-sm bg-black/40">
              <video
                ref={flowVideoRef}
                src="/"
                muted
                playsInline
                preload="auto"
                onEnded={handleFlowVideoEnded}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[560px] w-full mx-auto">
      <AgentCard id="orchestrator" state={agentStates.orchestrator} active={currentAgentId==='orchestrator'} onClick={()=>onAgentClick('orchestrator')} />
      <Handover active={running('orchestrator')} done={done('orchestrator')}/>
      <AgentCard id="data_analyst" state={agentStates.data_analyst} active={currentAgentId==='data_analyst'} onClick={()=>onAgentClick('data_analyst')} />
      <Handover active={running('data_analyst')} done={done('data_analyst')}/>
      <AgentCard id="clean_bot" state={agentStates.clean_bot} active={currentAgentId==='clean_bot'} label="CleanBot" role="Common Preprocessing" onClick={()=>onAgentClick('clean_bot')} />
      <Handover active={running('clean_bot')} done={done('clean_bot')}/>

      <div className={`rounded-2xl border p-4 text-center ${learningParadigm==='unknown'?'border-slate-800 bg-surface-100/40':'border-synapse-500/35 bg-synapse-500/5 shadow-glow-sm'}`}>
        <div className="flex items-center justify-center gap-2 text-synapse-400 font-mono text-xs tracking-wider"><GitBranch size={15}/> LEARNING PARADIGM DECISION</div>
        <div className="mt-2 text-[10px] text-slate-500">{learningParadigm==='unknown'?'Waiting for dataset analysis…':learningParadigm==='supervised'?'Clear target detected → supervised path':'No reliable target → unsupervised path'}</div>
        {learningParadigm!=='unknown' && <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 border border-synapse-500/25 bg-surface-0/40 text-[9px] font-mono text-synapse-300"><Play size={10} fill="currentColor"/> {learningParadigm.toUpperCase()} BRANCH ACTIVE</div>}
      </div>

      <div className="h-8 relative">
        <div className="absolute left-1/2 -translate-x-1/2 h-full w-px bg-slate-800"/>
        <div className="absolute left-[25%] right-[25%] top-1/2 border-t border-slate-800"/>
        <div className={`absolute left-[25%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${sup?'bg-synapse-400 shadow-glow':'bg-slate-700'}`}/>
        <div className={`absolute right-[25%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${unsup?'bg-synapse-400 shadow-glow':'bg-slate-700'}`}/>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-2xl border p-3 ${sup?'border-synapse-500/35 bg-synapse-500/5':'border-slate-800/80 bg-surface-100/20'}`}>
          <div className="text-center mb-3"><div className={`inline-flex rounded-full px-3 py-1 text-[9px] font-mono tracking-wider ${sup?'bg-synapse-500/15 text-synapse-300 border border-synapse-500/25':'bg-slate-900/50 text-slate-600 border border-slate-800'}`}>SUPERVISED PATH</div><div className="text-[8px] font-mono text-slate-700 mt-1">TARGET → MODEL → TRAIN → EVALUATE</div></div>
          <AgentCard id="feature_bot" state={agentStates.feature_bot} active={sup && currentAgentId==='feature_bot'} label="FeatureBot" role="Feature Preparation" onClick={()=>onAgentClick('feature_bot')}/>
          <Handover active={sup && running('feature_bot')} done={sup && done('feature_bot')}/>
          <AgentCard id="model_scout" state={agentStates.model_scout} active={sup && currentAgentId==='model_scout'} label="Model Scout" role="Model Recommendation" onClick={()=>onAgentClick('model_scout')}/>
          <Handover active={sup && running('model_scout')} done={sup && done('model_scout')}/>
          <AgentCard id="trainer_bot" state={agentStates.trainer_bot} active={sup && currentAgentId==='trainer_bot'} label="TrainerBot" role="Model Training" onClick={()=>onAgentClick('trainer_bot')}/>
          <Handover active={sup && running('trainer_bot')} done={sup && done('trainer_bot')}/>
          <AgentCard id="judge_bot" state={agentStates.judge_bot} active={sup && currentAgentId==='judge_bot'} label="JudgeBot" role="Evaluation" onClick={()=>onAgentClick('judge_bot')}/>
          <div className="mt-2 text-center text-[8px] font-mono text-slate-700">PREDICTION RESULT</div>
        </div>

        <div className={`rounded-2xl border p-3 ${unsup?'border-synapse-500/35 bg-synapse-500/5':'border-slate-800/80 bg-surface-100/20'}`}>
          <div className="text-center mb-3"><div className={`inline-flex rounded-full px-3 py-1 text-[9px] font-mono tracking-wider ${unsup?'bg-synapse-500/15 text-synapse-300 border border-synapse-500/25':'bg-slate-900/50 text-slate-600 border border-slate-800'}`}>UNSUPERVISED PATH</div><div className="text-[8px] font-mono text-slate-700 mt-1">FEATURES → CLUSTER → EVALUATE</div></div>
          <AgentCard id="feature_bot" state={agentStates.feature_bot} active={unsup && currentAgentId==='feature_bot'} label="FeatureBot" role="Unlabeled Feature Preparation" onClick={()=>onAgentClick('feature_bot')}/>
          <Handover active={unsup && running('feature_bot')} done={unsup && done('feature_bot')}/>
          <AgentCard id="model_scout" state={agentStates.model_scout} active={unsup && currentAgentId==='model_scout'} label="Cluster Scout" role="Clustering Recommendation" onClick={()=>onAgentClick('model_scout')}/>
          <Handover active={unsup && running('model_scout')} done={unsup && done('model_scout')}/>
          <AgentCard id="trainer_bot" state={agentStates.trainer_bot} active={unsup && currentAgentId==='trainer_bot'} label="Clusterer" role="K-Means / DBSCAN" onClick={()=>onAgentClick('trainer_bot')}/>
          <Handover active={unsup && running('trainer_bot')} done={unsup && done('trainer_bot')}/>
          <AgentCard id="judge_bot" state={agentStates.judge_bot} active={unsup && currentAgentId==='judge_bot'} label="Cluster Judge" role="Cluster Evaluation" onClick={()=>onAgentClick('judge_bot')}/>
          <div className="mt-2 text-center text-[8px] font-mono text-slate-700">PATTERN DISCOVERY</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4"><Handover active={sup && currentAgentId==='judge_bot'} done={sup && done('judge_bot')}/><Handover active={unsup && currentAgentId==='judge_bot'} done={unsup && done('judge_bot')}/></div>
      <AgentCard id="explain_bot" state={agentStates.explain_bot} active={currentAgentId==='explain_bot'} label="ExplainBot" role="Explainability & Insights" onClick={()=>onAgentClick('explain_bot')}/>
      <Handover active={running('explain_bot')} done={done('explain_bot')}/>
      <AgentCard id="report_bot" state={agentStates.report_bot} active={currentAgentId==='report_bot'} label="ReportBot" role="Experiment Documentation" onClick={()=>onAgentClick('report_bot')}/>
      </div>
    </div>

    {workflowCompleted && <div className="mt-5 flex justify-center"><button onClick={onGoDashboard} className="group inline-flex items-center gap-2 rounded-xl border border-synapse-400/50 bg-synapse-500/10 px-5 py-3 text-xs font-mono font-bold tracking-wider text-synapse-300 shadow-glow-sm hover:bg-synapse-500/20 transition-all"><ArrowDown size={14} className="rotate-[-90deg] transition-transform group-hover:translate-x-1"/> GO TO DASHBOARD</button></div>}
  </div>;
}
export const WorkflowCanvas = memo(WorkflowCanvasComponent);
