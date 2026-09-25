// ============================================================
// Synapse AI — Live Execution Console
// Terminal-style live event stream with agent filters and controls.
// ============================================================

import { memo, useMemo, useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Trash2,
  Pause,
  Play,
  Download,
  ChevronRight,
} from 'lucide-react';
import type { ExecutionEvent, AgentId, WorkflowState } from '@/types';
import { AGENT_DEFINITIONS } from '@/lib/agents';

interface LiveConsoleProps {
  events: ExecutionEvent[];
  workflowState: WorkflowState;
  currentAgentId: AgentId | null;
  onEventClick: (event: ExecutionEvent) => void;
}

type FilterId = 'ALL' | AgentId;

const FILTER_OPTIONS: { id: FilterId; label: string }[] = [
  { id: 'ALL', label: 'ALL' },
  { id: 'orchestrator', label: 'SYNAPSE CORE' },
  { id: 'data_analyst', label: 'DATA ANALYST' },
  { id: 'clean_bot', label: 'CLEANBOT' },
  { id: 'feature_bot', label: 'FEATUREBOT' },
  { id: 'model_scout', label: 'MODEL SCOUT' },
  { id: 'trainer_bot', label: 'TRAINERBOT' },
  { id: 'judge_bot', label: 'JUDGEBOT' },
  { id: 'explain_bot', label: 'EXPLAINBOT' },
  { id: 'report_bot', label: 'REPORTBOT' },
];

const STATUS_ICONS = {
  success: <CheckCircle2 size={12} className="text-synapse-500" />,
  progress: <Circle size={12} className="text-amber-400 animate-pulse" fill="currentColor" />,
  warning: <AlertTriangle size={12} className="text-amber-400" />,
  error: <AlertTriangle size={12} className="text-rose-500" />,
  info: <Info size={12} className="text-sky-400" />,
};

const STATUS_COLORS = {
  success: 'text-synapse-400',
  progress: 'text-amber-400',
  warning: 'text-amber-400',
  error: 'text-rose-400',
  info: 'text-sky-400',
};

function formatLogDownload(events: ExecutionEvent[]): string {
  const header = `Synapse AI — Execution Log\n${'='.repeat(60)}\nGenerated: ${new Date().toISOString()}\nTotal Events: ${events.length}\n${'='.repeat(60)}\n\n`;
  const body = events
    .map((e) => {
      let line = `[${e.timestamp}] [${e.agentName.toUpperCase()}] [${e.eventType.toUpperCase()}] ${e.message}`;
      if (e.codeSnippet) {
        line += `\n  > ${e.codeSnippet}`;
      }
      if (e.outputSnippet) {
        line += `\n  OUTPUT: ${e.outputSnippet}`;
      }
      return line;
    })
    .join('\n');
  return header + body;
}

function LiveConsoleComponent({
  events,
  workflowState,
  currentAgentId,
  onEventClick,
}: LiveConsoleProps) {
  const [filter, setFilter] = useState<FilterId>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [visibleEvents, setVisibleEvents] = useState<ExecutionEvent[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track visible events (not cleared)
  useEffect(() => {
    if (!paused) {
      setVisibleEvents(events);
    }
  }, [events, paused]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [visibleEvents, autoScroll]);

  const filteredEvents = useMemo(() => {
    if (filter === 'ALL') return visibleEvents;
    return visibleEvents.filter((e) => e.agentId === filter);
  }, [visibleEvents, filter]);

  const progressPercent = useMemo(() => {
    if (workflowState.totalAgents === 0) return 0;
    return Math.round((workflowState.completedAgents / workflowState.totalAgents) * 100);
  }, [workflowState.completedAgents, workflowState.totalAgents]);

  const headerStatus = useMemo(() => {
    if (workflowState.status === 'running')
      return { icon: <Circle size={8} className="text-synapse-500 animate-pulse" fill="currentColor" />, label: 'SYSTEM ACTIVE', color: 'text-synapse-400' };
    if (workflowState.status === 'completed')
      return { icon: <CheckCircle2 size={10} className="text-synapse-500" />, label: 'WORKFLOW COMPLETED', color: 'text-synapse-400' };
    if (workflowState.status === 'error')
      return { icon: <AlertTriangle size={10} className="text-rose-500" />, label: 'WORKFLOW PAUSED', color: 'text-rose-400' };
    return { icon: <Circle size={8} className="text-slate-600" />, label: 'SYSTEM IDLE', color: 'text-slate-500' };
  }, [workflowState.status]);

  const handleClearView = () => {
    setVisibleEvents([]);
  };

  const handleDownload = () => {
    const log = formatLogDownload(events);
    const blob = new Blob([log], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synapse_execution_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentAgentName = currentAgentId ? AGENT_DEFINITIONS[currentAgentId].name : null;
  const currentAgentAction = currentAgentId
    ? events.filter((e) => e.agentId === currentAgentId).pop()?.message
    : null;

  return (
    <div className="flex flex-col h-full glass-panel-strong rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-synapse-500/20 bg-surface-200/60">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-synapse-500" />
          <span className="font-mono text-sm font-semibold text-synapse-400 tracking-wider">
            LIVE EXECUTION
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-wider ${headerStatus.color}`}>
          {headerStatus.icon}
          {headerStatus.label}
        </div>
      </div>

      {/* Current Agent Indicator */}
      <div className="px-4 py-2.5 border-b border-synapse-500/10 bg-surface-100/40">
        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
          Current Agent
        </div>
        {currentAgentName ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-synapse-500 animate-pulse shadow-glow-sm" />
            <span className="font-mono text-sm font-semibold text-synapse-400">
              {currentAgentName}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-700" />
            <span className="font-mono text-sm text-slate-600">
              {workflowState.status === 'idle' ? 'Awaiting dataset upload' : '—'}
            </span>
          </div>
        )}
        {currentAgentAction && (
          <p className="text-[11px] text-slate-500 font-mono mt-1 truncate">
            {currentAgentAction}
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2.5 border-b border-synapse-500/10 bg-surface-100/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
            Workflow Progress
          </span>
          <span className="text-[10px] font-mono text-synapse-400 font-semibold">
            {progressPercent}%
          </span>
        </div>
        <div className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-synapse-600 to-synapse-400 transition-all duration-500 ease-out shadow-glow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Agent Filter */}
      <div className="px-3 py-2 border-b border-synapse-500/10 bg-surface-100/30">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wider transition-all ${
                filter === opt.id
                  ? 'bg-synapse-500/20 text-synapse-400 border border-synapse-500/40'
                  : 'text-slate-600 hover:text-slate-400 border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Log */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-2 terminal-text text-[11px] leading-relaxed bg-surface-0/60"
        style={{ minHeight: '120px' }}
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-2">
            <Terminal size={24} className="opacity-30" />
            <p className="text-[11px] font-mono">
              {workflowState.status === 'idle'
                ? 'Upload a dataset to start.'
                : 'No events for this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                className="group w-full text-left flex items-start gap-2 px-2 py-1.5 rounded hover:bg-synapse-500/5 transition-colors animate-fade-in"
              >
                <span className="text-slate-600 font-mono shrink-0">
                  [{event.timestamp}]
                </span>
                <span className="shrink-0 mt-0.5">{STATUS_ICONS[event.status]}</span>
                <div className="flex-1 min-w-0">
                  <span className={`font-mono font-semibold ${STATUS_COLORS[event.status]}`}>
                    {event.agentName.toUpperCase()}
                  </span>
                  <span className="text-slate-400 font-mono ml-1.5 break-words">
                    {event.message}
                  </span>
                  {event.outputSnippet && (
                    <pre className="mt-1 text-[10px] text-synapse-300/70 bg-surface-0/50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap">
                      {event.outputSnippet}
                    </pre>
                  )}
                </div>
                <ChevronRight
                  size={12}
                  className="text-slate-700 group-hover:text-synapse-500 shrink-0 mt-1 transition-colors"
                />
              </button>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-synapse-500/20 bg-surface-200/60">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider transition-all ${
              autoScroll
                ? 'text-synapse-400 bg-synapse-500/10'
                : 'text-slate-600 hover:text-slate-400'
            }`}
            title="Auto-scroll toggle"
          >
            {autoScroll ? <Play size={10} /> : <Pause size={10} />}
            AUTO
          </button>
          <button
            onClick={() => setPaused(!paused)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider transition-all ${
              paused
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-slate-600 hover:text-slate-400'
            }`}
            title="Pause stream"
          >
            {paused ? <Play size={10} /> : <Pause size={10} />}
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearView}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider text-slate-600 hover:text-rose-400 transition-colors"
            title="Clear visual history"
          >
            <Trash2 size={10} />
            CLEAR
          </button>
          <button
            onClick={handleDownload}
            disabled={events.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider text-slate-600 hover:text-synapse-400 disabled:opacity-30 transition-colors"
            title="Download execution log"
          >
            <Download size={10} />
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}

export const LiveConsole = memo(LiveConsoleComponent);
