// ============================================================
// Synapse AI — Experiment Report Panel
// Displays the final generated report with download capability.
// ============================================================

import { memo, useCallback } from 'react';
import {
  FileText,
  Database,
  Sparkles,
  GitBranch,
  TrendingUp,
  Brain,
  Lightbulb,
  Download,
  CheckCircle,
} from 'lucide-react';
import type { ExperimentReport } from '@/types';

interface ReportPanelProps {
  report: ExperimentReport;
}

const ICON_MAP: Record<string, typeof Database> = {
  Database,
  Sparkles,
  GitBranch,
  TrendingUp,
  Brain,
};

function ReportPanelComponent({ report }: ReportPanelProps) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([report.fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synapse_report_${report.generatedAt.replace(/[: ]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header with download */}
      <div className="flex items-center gap-2 mb-3">
        <FileText size={18} className="text-synapse-500" />
        <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
          EXPERIMENT REPORT
        </h3>
        <button
          onClick={handleDownload}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-synapse-500/30 bg-synapse-500/10 text-synapse-400 text-[11px] font-mono font-semibold hover:bg-synapse-500/20 hover:border-synapse-500/50 transition-all"
        >
          <Download size={12} />
          DOWNLOAD
        </button>
      </div>

      {/* Summary banner */}
      <div className="rounded-xl border border-synapse-500/40 bg-synapse-500/10 p-4 shadow-glow-sm">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle size={14} className="text-synapse-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-synapse-400">
            Experiment Complete
          </span>
          <span className="text-[10px] font-mono text-slate-500 ml-auto">
            {report.generatedAt}
          </span>
        </div>
        <p className="text-[12px] text-slate-300 leading-relaxed">
          {report.summary}
        </p>
      </div>

      {/* Report Sections */}
      <div className="space-y-3">
        {report.sections.map((section, idx) => {
          const Icon = ICON_MAP[section.icon] || FileText;
          return (
            <div
              key={idx}
              className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden"
            >
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-synapse-500/10 bg-surface-300/20">
                <Icon size={14} className="text-synapse-500" />
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-synapse-400">
                  {section.title}
                </span>
              </div>
              {/* Section content */}
              <div className="p-3">
                <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed m-0">
                  {section.content}
                </pre>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/10">
          <Lightbulb size={14} className="text-amber-400" />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-400">
            Recommendations
          </span>
        </div>
        <div className="p-3 space-y-2">
          {report.recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-amber-400 text-[11px] font-mono font-bold mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span className="text-[12px] text-slate-300 leading-relaxed">
                {rec}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow completion badge */}
      <div className="flex items-center justify-center gap-2 py-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-synapse-500/30 bg-synapse-500/10">
          <CheckCircle size={14} className="text-synapse-400" />
          <span className="text-[11px] font-mono text-synapse-400 tracking-wider">
            ALL 9 AGENTS COMPLETED SUCCESSFULLY
          </span>
        </div>
      </div>
    </div>
  );
}

export const ReportPanel = memo(ReportPanelComponent);
