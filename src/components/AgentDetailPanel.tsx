// ============================================================
// Synapse AI — Agent Detail Panel
// Slide-out panel showing full agent details when a robot is clicked.
// ============================================================

import { memo } from 'react';
import { X, Clock, Wrench, FileInput, FileOutput, Lightbulb, Activity, AlertCircle } from 'lucide-react';
import type { AgentDefinition, AgentState } from '@/types';

interface AgentDetailPanelProps {
  definition: AgentDefinition | null;
  state: AgentState | null;
  onClose: () => void;
}

function formatDuration(start: number | null, end: number | null): string {
  if (!start) return '—';
  const duration = (end ?? Date.now()) - start;
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}

function AgentDetailPanelComponent({ definition, state, onClose }: AgentDetailPanelProps) {
  if (!definition || !state) return null;

  const statusColors: Record<string, string> = {
    idle: 'text-slate-500 bg-slate-700/20 border-slate-700/40',
    analyzing: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    working: 'text-synapse-400 bg-synapse-500/10 border-synapse-500/30',
    communicating: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    waiting: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    success: 'text-synapse-400 bg-synapse-500/10 border-synapse-500/30',
    error: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full glass-panel-strong border-l-2 border-synapse-500/40 overflow-y-auto animate-slide-in-right shadow-glow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-synapse-500/20 bg-surface-200/80 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-semibold text-synapse-400 text-glow">
              {definition.name}
            </h2>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">
              {definition.role}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-synapse-400 hover:bg-synapse-500/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <section>
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity size={12} /> Status
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold border ${statusColors[state.status]}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {state.status.toUpperCase()}
            </span>
          </section>

          {/* Mission */}
          <section>
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">
              Mission
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {definition.responsibility}
            </p>
          </section>

          {/* Current Action */}
          {state.currentAction && (
            <section>
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity size={12} /> Current Action
              </h3>
              <p className="text-sm text-synapse-400 font-mono leading-relaxed bg-synapse-500/5 rounded-lg px-3 py-2 border border-synapse-500/20">
                {state.currentAction}
              </p>
            </section>
          )}

          {/* Input */}
          {state.input && (
            <section>
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileInput size={12} /> Input
              </h3>
              <p className="text-sm text-slate-300 font-mono bg-surface-300/40 rounded-lg px-3 py-2 border border-synapse-500/10">
                {state.input}
              </p>
            </section>
          )}

          {/* Output */}
          {state.output && (
            <section>
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileOutput size={12} /> Output Artifact
              </h3>
              <pre className="text-[11px] text-synapse-300 font-mono bg-surface-0/60 rounded-lg px-3 py-2 border border-synapse-500/20 overflow-x-auto max-h-64 overflow-y-auto">
                {state.output}
              </pre>
            </section>
          )}

          {/* Tools */}
          <section>
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Wrench size={12} /> Tools Used
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {definition.tools.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-1 rounded-md text-[10px] font-mono text-slate-400 bg-surface-300/40 border border-synapse-500/15"
                >
                  {tool}
                </span>
              ))}
            </div>
          </section>

          {/* Decision Summary */}
          {state.decisionSummary && (
            <section>
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb size={12} /> Decision Summary
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed bg-surface-300/40 rounded-lg px-3 py-2 border border-synapse-500/10">
                {state.decisionSummary}
              </p>
            </section>
          )}

          {/* Execution Time */}
          <section>
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock size={12} /> Execution Time
            </h3>
            <p className="text-sm font-mono text-synapse-400">
              {formatDuration(state.startTime, state.endTime)}
            </p>
          </section>

          {/* Error */}
          {state.error && (
            <section className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-4">
              <h3 className="text-[10px] font-mono text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertCircle size={12} /> Error
              </h3>
              <p className="text-sm text-rose-300 leading-relaxed">
                {state.error}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export const AgentDetailPanel = memo(AgentDetailPanelComponent);
