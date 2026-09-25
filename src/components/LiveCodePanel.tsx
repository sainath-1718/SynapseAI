// ============================================================
// Synapse AI — Live Code Execution Panel
// Shows the actual Python code being executed + real output.
// ============================================================

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Circle, CheckCircle2, Download, Copy, Check } from 'lucide-react';
import type { CodeBlock, WorkflowState } from '@/types';

interface LiveCodePanelProps {
  codeBlock: CodeBlock | null;
  workflowState: WorkflowState;
  pythonScript: string | null;
}

type Tab = 'code' | 'output' | 'terminal';

function LiveCodePanelComponent({ codeBlock, workflowState, pythonScript }: LiveCodePanelProps) {
  const [copied, setCopied] = useState(false);

  const isRunning = workflowState.status === 'running';
  const isCompleted = workflowState.status === 'completed';

  const headerLabel = isRunning
    ? 'RUNNING'
    : isCompleted
      ? 'EXECUTION COMPLETED'
      : 'IDLE';

  const headerColor = isRunning
    ? 'text-synapse-400'
    : isCompleted
      ? 'text-synapse-400'
      : 'text-slate-600';

  const headerIcon = isRunning ? (
    <Circle size={8} className="text-synapse-500 animate-pulse" fill="currentColor" />
  ) : isCompleted ? (
    <CheckCircle2 size={10} className="text-synapse-500" />
  ) : (
    <Circle size={8} className="text-slate-700" />
  );

  // Simple syntax highlighting via regex
  const highlightCode = (code: string): { text: string; type: string }[][] => {
    return code.split('\n').map((line) => {
      const tokens: { text: string; type: string }[] = [];
      // Comments
      if (line.trim().startsWith('#')) {
        tokens.push({ text: line, type: 'comment' });
        return tokens;
      }
      // Keywords
      const keywords = ['import', 'from', 'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'assert', 'print', 'as', 'in', 'not', 'and', 'or', 'None', 'True', 'False'];
      let remaining = line;
      let inString = false;
      let stringChar = '';

      while (remaining.length > 0) {
        // String detection
        if (!inString && (remaining[0] === '"' || remaining[0] === "'")) {
          inString = true;
          stringChar = remaining[0];
          tokens.push({ text: remaining[0], type: 'string' });
          remaining = remaining.slice(1);
          continue;
        }
        if (inString) {
          if (remaining[0] === stringChar) {
            tokens.push({ text: remaining[0], type: 'string' });
            remaining = remaining.slice(1);
            inString = false;
            continue;
          }
          // Accumulate string content
          const nextEnd = remaining.indexOf(stringChar);
          const content = remaining.slice(0, nextEnd >= 0 ? nextEnd : remaining.length);
          tokens.push({ text: content, type: 'string' });
          remaining = remaining.slice(content.length);
          continue;
        }

        // Whitespace
        if (/\s/.test(remaining[0])) {
          let ws = '';
          while (remaining.length > 0 && /\s/.test(remaining[0])) {
            ws += remaining[0];
            remaining = remaining.slice(1);
          }
          tokens.push({ text: ws, type: 'whitespace' });
          continue;
        }

        // Numbers
        if (/[\d]/.test(remaining[0])) {
          let num = '';
          while (remaining.length > 0 && /[\d.]/.test(remaining[0])) {
            num += remaining[0];
            remaining = remaining.slice(1);
          }
          tokens.push({ text: num, type: 'number' });
          continue;
        }

        // Identifiers/keywords
        if (/[a-zA-Z_]/.test(remaining[0])) {
          let word = '';
          while (remaining.length > 0 && /[a-zA-Z0-9_]/.test(remaining[0])) {
            word += remaining[0];
            remaining = remaining.slice(1);
          }
          if (keywords.includes(word)) {
            tokens.push({ text: word, type: 'keyword' });
          } else if (remaining[0] === '(') {
            tokens.push({ text: word, type: 'function' });
          } else {
            tokens.push({ text: word, type: 'identifier' });
          }
          continue;
        }

        // Operators and other characters
        tokens.push({ text: remaining[0], type: 'operator' });
        remaining = remaining.slice(1);
      }

      return tokens;
    });
  };

  const tokenColors: Record<string, string> = {
    comment: 'text-slate-600 italic',
    keyword: 'text-synapse-400 font-semibold',
    string: 'text-amber-400',
    number: 'text-sky-400',
    function: 'text-synapse-300',
    identifier: 'text-slate-300',
    operator: 'text-slate-500',
    whitespace: '',
  };

  const handleDownloadScript = useCallback(() => {
    if (!pythonScript) return;
    const blob = new Blob([pythonScript], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synapse_experiment.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pythonScript]);

  const handleCopyCode = useCallback(() => {
    if (!codeBlock?.code) return;
    navigator.clipboard.writeText(codeBlock.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codeBlock]);

  const lines = codeBlock ? highlightCode(codeBlock.code) : [];
  const codeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeEndRef.current) {
      codeEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [codeBlock?.code, codeBlock?.activeLine]);

  return (
    <div className="flex flex-col h-full glass-panel-strong rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-synapse-500/20 bg-surface-200/60">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-synapse-500" />
          <span className="font-mono text-sm font-semibold text-synapse-400 tracking-wider">
            LIVE CODE EXECUTION
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-wider ${headerColor}`}>
          {headerIcon}
          {headerLabel}
        </div>
        <div className="flex items-center gap-1 ml-2">
          {codeBlock && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider text-slate-600 hover:text-synapse-400 transition-colors"
              title="Copy code to clipboard"
            >
              {copied ? <Check size={10} className="text-synapse-400" /> : <Copy size={10} />}
              {copied ? 'COPIED' : 'COPY'}
            </button>
          )}
          {pythonScript && isCompleted && (
            <button
              onClick={handleDownloadScript}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider text-synapse-400 hover:text-synapse-300 bg-synapse-500/10 border border-synapse-500/30 transition-all"
              title="Download complete Python script"
            >
              <Download size={10} />
              .PY
            </button>
          )}
        </div>
      </div>

      {/* File / execution info */}
      <div className="px-4 py-2.5 border-b border-synapse-500/10 bg-surface-100/40">
        {codeBlock ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">File <b className="text-synapse-400 normal-case ml-1">{codeBlock.title}</b></span>
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Language <b className="text-slate-400 normal-case ml-1">{codeBlock.language}</b></span>
            <span className="text-[9px] font-mono text-slate-600 ml-auto">LIVE EXECUTION · CODE ONLY</span>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-600 text-center">No code executing. Upload a dataset to begin.</div>
        )}
      </div>

      {/* Code-only viewport. This is the only auto-scrolling region. */}
      <div className="flex-1 min-h-[280px] overflow-auto bg-surface-0/60 terminal-text text-[12px] leading-relaxed">
        {codeBlock ? (
          <div className="px-3 py-3">
            {lines.map((tokens, lineIdx) => (
              <div key={lineIdx} className={`flex hover:bg-synapse-500/5 ${codeBlock.activeLine === lineIdx + 1 ? 'bg-synapse-500/10 border-l-2 border-synapse-500' : ''}`}>
                <span className="text-slate-700 select-none w-10 text-right pr-3 shrink-0">{lineIdx + 1}</span>
                <span className="flex-1 whitespace-pre-wrap break-all">
                  {tokens.length === 0 ? '\u00A0' : tokens.map((token, i) => <span key={i} className={tokenColors[token.type] || ''}>{token.text}</span>)}
                </span>
              </div>
            ))}
            <div ref={codeEndRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-slate-700 gap-2">
            <Code2 size={26} className="opacity-30" />
            <p className="text-[11px]">No code to display.</p>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-synapse-500/15 bg-surface-200/50 text-[9px] font-mono text-slate-600 flex items-center justify-between">
        <span>{isRunning ? 'Streaming generated execution code…' : isCompleted ? 'Execution complete' : 'Waiting for experiment'}</span>
        <span>{lines.length} lines</span>
      </div>
    </div>
  );
}

export const LiveCodePanel = memo(LiveCodePanelComponent);
