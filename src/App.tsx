import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Cpu, Github, LayoutDashboard, MessageCircle, TerminalSquare } from 'lucide-react';
import type { AgentId, AgentState, CodeBlock, DatasetProfile, EvaluationResults, CleaningReport, FeatureReport, ExplanationResults, ExperimentReport, ExecutionEvent, WorkflowState, LiveExecutionState } from '@/types';
import { WorkflowEngine } from '@/lib/workflowEngine';
import { AGENT_DEFINITIONS, createInitialAgentStates } from '@/lib/agents';
import { WorkflowCanvas } from '@/components/WorkflowCanvas';
import { LiveConsole } from '@/components/LiveConsole';
import { LiveCodePanel } from '@/components/LiveCodePanel';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { DatasetSummary } from '@/components/DatasetSummary';
import { CleaningSummary } from '@/components/CleaningSummary';
import { ModelComparisonTable } from '@/components/ModelComparisonTable';
import { ExplainabilityPanel } from '@/components/ExplainabilityPanel';
import { ReportPanel } from '@/components/ReportPanel';
import { UploadPanel } from '@/components/UploadPanel';
import { SynapseSeva } from '@/components/SynapseSeva';
import { ClusteringResultsPanel } from '@/components/ClusteringResultsPanel';

function App() {
  const [showIntro, setShowIntro] = useState(true);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<WorkflowEngine | null>(null);
  if (!engineRef.current) engineRef.current = new WorkflowEngine();

  const [workflowState, setWorkflowState] = useState<WorkflowState>(engineRef.current.getState());
  const [agentStates, setAgentStates] = useState<Record<AgentId, AgentState>>(createInitialAgentStates());
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [codeBlock, setCodeBlock] = useState<CodeBlock | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResults | null>(null);
  const [cleaning, setCleaning] = useState<CleaningReport | null>(null);
  const [features, setFeatures] = useState<FeatureReport | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResults | null>(null);
  const [report, setReport] = useState<ExperimentReport | null>(null);
  const [clustering, setClustering] = useState(engineRef.current.getState().clusteringResults);
  const [detailAgentId, setDetailAgentId] = useState<AgentId | null>(null);
  const [view, setView] = useState<'workspace' | 'dashboard'>('workspace');
  const [executionState, setExecutionState] = useState<LiveExecutionState>(engineRef.current.getExecutionState());
  const [sevaOpen, setSevaOpen] = useState(true);

  useEffect(() => {
    const engine = engineRef.current!;
    const unsubState = engine.onStateChange((state) => {
      setWorkflowState(state);
      if (state.datasetProfile) setProfile(state.datasetProfile);
      if (state.cleaningReport) setCleaning(state.cleaningReport);
      if (state.featureReport) setFeatures(state.featureReport);
      if (state.evaluationResults) setEvaluation(state.evaluationResults);
      if (state.explanationResults) setExplanation(state.explanationResults);
      if (state.experimentReport) setReport(state.experimentReport);
      setClustering(state.clusteringResults);
      // Intentionally do NOT open dashboard automatically. User explicitly controls it.
    });
    const unsubAgent = engine.onAgentStateChange((id, state) => setAgentStates(prev => ({ ...prev, [id]: state })));
    const unsubEvent = engine.onEvent(event => setEvents(prev => [...prev, event]));
    const unsubCode = engine.onCode(code => setCodeBlock(code));
    const unsubExec = engine.onExecutionStateChange(state => setExecutionState(state));
    return () => { unsubState(); unsubAgent(); unsubEvent(); unsubCode(); unsubExec(); };
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setView('workspace'); setEvents([]); setProfile(null); setEvaluation(null); setCleaning(null); setFeatures(null); setExplanation(null); setReport(null); setClustering(null); setCodeBlock(null); setExecutionState(engineRef.current!.getExecutionState());
    await engineRef.current!.run(file);
  }, []);

  const handleReset = useCallback(() => {
    engineRef.current!.reset();
    setView('workspace'); setEvents([]); setProfile(null); setEvaluation(null); setCleaning(null); setFeatures(null); setExplanation(null); setReport(null); setClustering(null); setCodeBlock(null); setExecutionState(engineRef.current!.getExecutionState()); setAgentStates(createInitialAgentStates()); setWorkflowState(engineRef.current!.getState());
  }, []);

  const handleAgentClick = useCallback((id: AgentId) => setDetailAgentId(id), []);
  const handleEventClick = useCallback((event: ExecutionEvent) => setDetailAgentId(event.agentId), []);
  const detailDefinition = detailAgentId ? AGENT_DEFINITIONS[detailAgentId] : null;
  const detailState = detailAgentId ? agentStates[detailAgentId] : null;

  const completed = workflowState.status === 'completed';

  const skipIntro = () => {
    introVideoRef.current?.pause();
    setShowIntro(false);
  };

  if (showIntro) {
    return (
      <div className="synapse-intro">
        <video
          ref={introVideoRef}
          src="/synapse-intro.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setShowIntro(false)}
        />
        <button className="synapse-intro__skip" onClick={skipIntro}>SKIP INTRO</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 grid-bg relative text-slate-200">
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-synapse-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-synapse-500/3 rounded-full blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-40 border-b border-synapse-500/15 bg-surface-100/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex items-center justify-center"><div className="absolute inset-0 border-2 border-synapse-500/40 rounded-xl rotate-45"/><Cpu size={20} className="text-synapse-500"/><div className="absolute inset-0 rounded-xl shadow-glow-sm"/></div>
            <div><h1 className="text-base font-bold text-synapse-400 text-glow tracking-wide leading-none">SYNAPSE AI</h1><p className="text-[10px] text-slate-500 font-mono mt-0.5 tracking-wider">AUTONOMOUS MULTI-AGENT ML FRAMEWORK</p></div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'dashboard' ? <button onClick={()=>setView('workspace')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-synapse-500/25 bg-synapse-500/5 text-[10px] font-mono text-synapse-400 hover:bg-synapse-500/10"><ArrowLeft size={13}/> BACK TO FLOW</button> : completed && <button onClick={()=>setView('dashboard')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-synapse-400/45 bg-synapse-500/10 text-[10px] font-mono font-semibold text-synapse-300 shadow-glow-sm hover:bg-synapse-500/20"><LayoutDashboard size={13}/> GO TO DASHBOARD</button>}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-synapse-500/20 bg-surface-200/40"><span className={`w-2 h-2 rounded-full ${workflowState.status==='running'?'bg-synapse-500 animate-pulse shadow-glow-sm':workflowState.status==='completed'?'bg-synapse-500':workflowState.status==='error'?'bg-rose-500':'bg-slate-700'}`}/><span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{workflowState.status}</span></div>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-slate-500 hover:text-synapse-400 hover:bg-synapse-500/10" title="GitHub"><Github size={17}/></a>
          </div>
        </div>
      </header>

      {view === 'workspace' ? (
        <main className="relative z-10 p-3 md:p-5 pb-10">
          <div className="max-w-[1500px] mx-auto">
            <UploadPanel workflowState={workflowState} onUpload={handleUpload} onReset={handleReset}/>

            <section className="mt-4 glass-panel-strong rounded-2xl overflow-hidden border border-synapse-500/15">
              <div className="px-4 py-3 border-b border-synapse-500/15 flex items-center justify-between">
                <div className="flex items-center gap-2"><TerminalSquare size={15} className="text-synapse-400"/><h2 className="text-sm font-mono font-semibold text-synapse-400 tracking-wider">SYNAPSE WORKSPACE</h2><span className="text-[9px] font-mono text-slate-600">VS CODE STYLE ORCHESTRATION VIEW</span></div>
                <div className="text-[9px] font-mono text-slate-600">CENTER = WORKFLOW · RIGHT = SEVA · BOTTOM = TERMINAL + CODE</div>
              </div>

              <div className="p-4">
                <WorkflowCanvas agentStates={agentStates} currentAgentId={workflowState.currentAgentId} learningParadigm={workflowState.learningParadigm} workflowCompleted={completed} onAgentClick={handleAgentClick} onGoDashboard={()=>setView('dashboard')}/>
              </div>
            </section>

            <section className="mt-4 grid grid-cols-1 xl:grid-cols-[1fr_1.6fr] gap-4">
              <div className="h-[300px]"><LiveConsole events={events} workflowState={workflowState} currentAgentId={workflowState.currentAgentId} onEventClick={handleEventClick}/></div>
              <div className="h-[300px] glass-panel-strong rounded-2xl p-4 flex flex-col justify-between"><div><div className="flex items-center gap-2 text-synapse-400 font-mono text-xs"><MessageCircle size={14}/> SYNAPSE SEVA CONTEXT</div><p className="text-xs text-slate-500 mt-2 leading-relaxed">The assistant is connected to the current experiment. Ask about the target decision, why a branch was selected, current agent, metrics, cluster patterns, errors, or the generated code.</p></div><div className="grid grid-cols-2 gap-2 text-[9px] font-mono"><div className="rounded-lg border border-slate-800 bg-surface-100/50 p-2"><span className="text-slate-600">PARADIGM</span><div className="text-synapse-400 mt-1">{workflowState.learningParadigm.toUpperCase()}</div></div><div className="rounded-lg border border-slate-800 bg-surface-100/50 p-2"><span className="text-slate-600">CURRENT AGENT</span><div className="text-synapse-400 mt-1">{workflowState.currentAgentId ? AGENT_DEFINITIONS[workflowState.currentAgentId].name : '—'}</div></div></div></div>
            </section>

            <section className="mt-4">
              <div className="h-[430px]"><LiveCodePanel codeBlock={codeBlock} workflowState={workflowState} pythonScript={workflowState.pythonScript}/></div>
            </section>

            {executionState.status !== 'idle' && <div className="mt-3 text-[9px] font-mono text-slate-700 text-right">Python runtime: {executionState.currentStage} · {executionState.totalOutputLines} output lines</div>}
          </div>
        </main>
      ) : (
        <main className="relative z-10 p-4 md:p-6 pb-12">
          <div className="max-w-[1500px] mx-auto space-y-4">
            <div className="glass-panel-strong rounded-2xl p-5 border border-synapse-500/15"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2 text-synapse-400 font-mono text-xs tracking-wider"><LayoutDashboard size={15}/> EXPERIMENT DASHBOARD</div><h2 className="text-xl text-slate-100 mt-1">{profile?.fileName || 'Synapse Experiment'}</h2><p className="text-xs text-slate-500 mt-1">Final results generated by the completed multi-agent workflow.</p></div><button onClick={()=>setView('workspace')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-surface-100/50 text-[10px] font-mono text-slate-500 hover:text-synapse-400"><ArrowLeft size={13}/> FLOW</button></div></div>
            {profile && <div className="glass-panel rounded-2xl p-4 md:p-6"><DatasetSummary profile={profile}/></div>}
            {cleaning && features && <div className="glass-panel rounded-2xl p-4 md:p-6"><CleaningSummary cleaning={cleaning} features={features}/></div>}
            {workflowState.learningParadigm === 'unsupervised' && clustering && <ClusteringResultsPanel results={clustering}/>} 
            {workflowState.learningParadigm === 'supervised' && evaluation && <div className="glass-panel rounded-2xl p-4 md:p-6"><ModelComparisonTable results={evaluation} candidates={workflowState.candidateModels}/></div>}
            {explanation && <div className="glass-panel rounded-2xl p-4 md:p-6"><ExplainabilityPanel explanation={explanation}/></div>}
            {report && <div className="glass-panel rounded-2xl p-4 md:p-6"><ReportPanel report={report}/></div>}
          </div>
        </main>
      )}

      <SynapseSeva workflowState={workflowState} evaluation={evaluation} explanation={explanation} report={report} isOpen={sevaOpen} onOpen={()=>setSevaOpen(true)} onClose={()=>setSevaOpen(false)}/>
      <AgentDetailPanel definition={detailDefinition} state={detailState} onClose={()=>setDetailAgentId(null)}/>
    </div>
  );
}

export default App;
