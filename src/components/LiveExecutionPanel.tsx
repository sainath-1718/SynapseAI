// ============================================================
// Synapse AI — Live Execution Panel
// Displays real Python code being executed by Pyodide, live
// terminal output, execution stage progress, and status.
// ============================================================

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Code2,
  ChevronRight,
  Download,
  Play,
  AlertTriangle,
  Cpu,
} from 'lucide-react';
import type {
  LiveExecutionState,
  ExecutionStage,
  ExecutionStageInfo,
  ExecutionOutputLine,
} from '@/types';

interface LiveExecutionPanelProps {
  executionState: LiveExecutionState;
}

const STAGE_ORDER: ExecutionStage[] = [
  'loading_pyodide',
  'loading_packages',
  'dataset_analysis',
  'data_preprocessing',
  'model_training',
  'model_evaluation',
];

const STAGE_ICONS: Record<ExecutionStage, typeof Circle> = {
  idle: Circle,
  loading_pyodide: Cpu,
  loading_packages: Loader2,
  dataset_analysis: Code2,
  data_preprocessing: Code2,
  model_training: Play,
  model_evaluation: CheckCircle2,
  completed: CheckCircle2,
  error: XCircle,
};

function statusBadge(status: LiveExecutionState['status']) {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-mono font-bold tracking-wider">
        <Loader2 size={9} className="animate-spin" />
        RUNNING
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-synapse-500/15 border border-synapse-500/30 text-synapse-400 text-[9px] font-mono font-bold tracking-wider">
        <CheckCircle2 size={9} />
        SUCCESS
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-mono font-bold tracking-wider">
        <XCircle size={9} />
        ERROR
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-700/30 border border-slate-600/30 text-slate-500 text-[9px] font-mono font-bold tracking-wider">
      <Circle size={9} />
      IDLE
    </span>
  );
}

function outputLineClass(type: ExecutionOutputLine['type']): string {
  switch (type) {
    case 'stdout':
      return 'text-slate-300';
    case 'stderr':
      return 'text-rose-400';
    case 'error':
      return 'text-rose-400 font-semibold';
    case 'result':
      return 'text-synapse-400';
    case 'info':
      return 'text-sky-400';
    default:
      return 'text-slate-300';
  }
}

function stageStatusIcon(status: ExecutionStageInfo['status'], isCurrent: boolean) {
  if (status === 'running') {
    return <Loader2 size={11} className="text-amber-400 animate-spin flex-shrink-0" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 size={11} className="text-synapse-400 flex-shrink-0" />;
  }
  if (status === 'error') {
    return <XCircle size={11} className="text-rose-400 flex-shrink-0" />;
  }
  if (isCurrent) {
    return <Circle size={11} className="text-synapse-400/50 flex-shrink-0 animate-pulse" />;
  }
  return <Circle size={11} className="text-slate-700 flex-shrink-0" />;
}

function LiveExecutionPanelComponent({ executionState }: LiveExecutionPanelProps) {
  const [selectedStage, setSelectedStage] = useState<ExecutionStage | null>(null);
  const [showCode, setShowCode] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Auto-select the current running stage
  useEffect(() => {
    if (executionState.currentStage !== 'idle' && executionState.currentStage !== 'completed' && executionState.currentStage !== 'error') {
      setSelectedStage(executionState.currentStage);
    } else if (executionState.currentStage === 'completed' && !selectedStage) {
      setSelectedStage('model_evaluation');
    } else if (executionState.currentStage === 'error' && !selectedStage) {
      // Find the error stage
      for (const s of STAGE_ORDER) {
        if (executionState.stages[s]?.status === 'error') {
          setSelectedStage(s);
          break;
        }
      }
    }
  }, [executionState.currentStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [selectedStage, executionState.totalOutputLines]);

  const activeStageInfo = selectedStage ? executionState.stages[selectedStage] : null;
  const isLoading = executionState.pyodideLoading;
  const allOutput: ExecutionOutputLine[] = activeStageInfo ? activeStageInfo.output : [];

  const handleDownloadLog = useCallback(() => {
    let log = `Synapse AI — Live Python Execution Log\n${'='.repeat(60)}\nGenerated: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
    for (const stage of STAGE_ORDER) {
      const info = executionState.stages[stage];
      if (!info) continue;
      log += `\n[${STAGE_LABELS_EXPORT[stage]}] — ${info.status.toUpperCase()}\n`;
      log += `${'─'.repeat(60)}\n`;
      if (info.code) {
        log += `CODE:\n${info.code}\n\n`;
      }
      if (info.output.length > 0) {
        log += `OUTPUT:\n`;
        for (const line of info.output) {
          log += `${line.text}\n`;
        }
      }
      if (info.error) {
        log += `ERROR: ${info.error}\n`;
      }
      log += '\n';
    }
    const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synapse_execution_log.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [executionState]);

  const hasAnyContent = STAGE_ORDER.some((s) => {
    const info = executionState.stages[s];
    return info && (info.code || info.output.length > 0);
  });

  return (
    <div className="h-full flex flex-col bg-surface-200/40 backdrop-blur-xl border border-synapse-500/15 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-synapse-500/15 bg-surface-300/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-synapse-400" />
          <span className="text-[10px] font-mono font-semibold tracking-wider text-synapse-400">
            LIVE PYTHON EXECUTION
          </span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(executionState.status)}
          {hasAnyContent && (
            <button
              onClick={handleDownloadLog}
              className="p-1 rounded text-slate-500 hover:text-synapse-400 transition-colors"
              title="Download execution log"
            >
              <Download size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Loading banner */}
      {isLoading && (
        <div className="px-3 py-2 bg-sky-500/5 border-b border-sky-500/15 flex items-center gap-2 flex-shrink-0">
          <Loader2 size={12} className="text-sky-400 animate-spin flex-shrink-0" />
          <span className="text-[10px] font-mono text-sky-400 truncate">
            {executionState.loadingMessage || 'Loading...'}
          </span>
        </div>
      )}

      {/* Stage selector — horizontal scrollable list */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-synapse-500/10 overflow-x-auto flex-shrink-0 scrollbar-thin">
        {STAGE_ORDER.map((stage) => {
          const info = executionState.stages[stage];
          if (!info) return null;
          const isActive = selectedStage === stage;
          return (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-synapse-500/15 border border-synapse-500/30 text-synapse-400'
                  : 'bg-surface-300/20 border border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {stageStatusIcon(info.status, executionState.currentStage === stage)}
              {STAGE_LABELS_EXPORT[stage].toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Main content — code + output */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!activeStageInfo ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <Terminal size={32} className="text-slate-700 mx-auto mb-2" />
              <p className="text-[10px] font-mono text-slate-600 tracking-wider">
                {executionState.status === 'idle'
                  ? 'Upload a CSV to begin real Python execution'
                  : 'Waiting for execution to start...'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Code section */}
            {showCode && activeStageInfo.code && (
              <div className="flex flex-col min-h-0 border-b border-synapse-500/10" style={{ flex: '0 0 45%' }}>
                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-300/20 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Code2 size={11} className="text-synapse-400/70" />
                    <span className="text-[9px] font-mono font-semibold tracking-wider text-slate-500">
                      CODE · {activeStageInfo.label.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCode(false)}
                    className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    HIDE
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-2 bg-surface-900/40">
                  <pre className="text-[10px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap break-all">
                    {activeStageInfo.code}
                  </pre>
                </div>
              </div>
            )}

            {!showCode && (
              <button
                onClick={() => setShowCode(true)}
                className="px-3 py-1.5 bg-surface-300/20 border-b border-synapse-500/10 text-[9px] font-mono font-semibold tracking-wider text-slate-500 hover:text-synapse-400 transition-colors text-left flex-shrink-0"
              >
                <ChevronRight size={10} className="inline mr-1" />
                SHOW CODE
              </button>
            )}

            {/* Output / terminal section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-3 py-1.5 bg-surface-300/20 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <Terminal size={11} className="text-synapse-400/70" />
                  <span className="text-[9px] font-mono font-semibold tracking-wider text-slate-500">
                    TERMINAL OUTPUT
                  </span>
                </div>
                {activeStageInfo.status === 'running' && (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-amber-400">
                    <Loader2 size={9} className="animate-spin" />
                    EXECUTING...
                  </span>
                )}
              </div>
              <div
                ref={outputRef}
                className="flex-1 overflow-auto p-2 bg-surface-900/60 font-mono"
              >
                {allOutput.length === 0 ? (
                  <div className="text-[10px] text-slate-700 italic p-2">
                    No output yet. Code will execute when this stage runs.
                  </div>
                ) : (
                  allOutput.map((line) => (
                    <div
                      key={line.id}
                      className={`text-[10px] leading-relaxed ${outputLineClass(line.type)}`}
                    >
                      <span className="text-slate-700 mr-2 select-none">{line.timestamp}</span>
                      {line.text}
                    </div>
                  ))
                )}
                <div ref={outputEndRef} />
              </div>
            </div>

            {/* Error banner */}
            {activeStageInfo.error && (
              <div className="px-3 py-2 bg-rose-500/10 border-t border-rose-500/20 flex items-start gap-2 flex-shrink-0">
                <AlertTriangle size={12} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-mono font-bold text-rose-400 tracking-wider mb-0.5">
                    EXECUTION ERROR
                  </div>
                  <div className="text-[10px] font-mono text-rose-300/80 break-all">
                    {activeStageInfo.error}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STAGE_LABELS_EXPORT: Record<ExecutionStage, string> = {
  idle: 'Idle',
  loading_pyodide: 'Load Runtime',
  loading_packages: 'Install ML',
  dataset_analysis: 'Analysis',
  data_preprocessing: 'Preprocessing',
  model_training: 'Training',
  model_evaluation: 'Evaluation',
  completed: 'Completed',
  error: 'Error',
};

export const LiveExecutionPanel = memo(LiveExecutionPanelComponent);
