// ============================================================
// Synapse AI — Cleaning & Feature Summary
// Displays real cleaning and feature engineering results.
// ============================================================

import { memo } from 'react';
import { Sparkles, Scissors, GitBranch, ArrowRight } from 'lucide-react';
import type { CleaningReport, FeatureReport } from '@/types';
import { formatNumber } from '@/lib/csvEngine';

interface CleaningSummaryProps {
  cleaning: CleaningReport;
  features: FeatureReport;
}

function CleaningSummaryComponent({ cleaning, features }: CleaningSummaryProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Cleaning Report */}
      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-synapse-500" />
          <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
            DATA CLEANING REPORT
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <div className="rounded-lg bg-surface-300/40 border border-synapse-500/10 p-2">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Duplicates</div>
            <div className="text-lg font-bold font-mono text-synapse-400">{formatNumber(cleaning.duplicatesRemoved)}</div>
            <div className="text-[9px] text-slate-600">removed</div>
          </div>
          <div className="rounded-lg bg-surface-300/40 border border-synapse-500/10 p-2">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Missing</div>
            <div className="text-lg font-bold font-mono text-synapse-400">{formatNumber(cleaning.missingHandled)}</div>
            <div className="text-[9px] text-slate-600">imputed</div>
          </div>
          <div className="rounded-lg bg-surface-300/40 border border-synapse-500/10 p-2">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Categorical</div>
            <div className="text-lg font-bold font-mono text-synapse-400">{cleaning.categoricalEncoded}</div>
            <div className="text-[9px] text-slate-600">encoded</div>
          </div>
          <div className="rounded-lg bg-surface-300/40 border border-synapse-500/10 p-2">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Constant</div>
            <div className="text-lg font-bold font-mono text-synapse-400">{cleaning.constantColumnsRemoved}</div>
            <div className="text-[9px] text-slate-600">removed</div>
          </div>
        </div>

        {/* Actions log */}
        <div className="space-y-1">
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Operations Performed</div>
          {cleaning.actions.map((action, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400 font-mono">
              <ArrowRight size={10} className="text-synapse-500 mt-0.5 shrink-0" />
              {action}
            </div>
          ))}
          {cleaning.actions.length === 0 && (
            <div className="text-[11px] text-slate-600 font-mono">No cleaning operations needed — dataset was clean.</div>
          )}
        </div>

        {/* Before/After */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-synapse-500/10 text-[11px] font-mono">
          <span className="text-slate-500">
            Rows: <span className="text-slate-400">{formatNumber(cleaning.rowsBefore)}</span>
            <ArrowRight size={10} className="inline mx-1 text-synapse-500" />
            <span className="text-synapse-400">{formatNumber(cleaning.rowsAfter)}</span>
          </span>
          <span className="text-slate-500">
            Columns: <span className="text-slate-400">{cleaning.columnsBefore}</span>
            <ArrowRight size={10} className="inline mx-1 text-synapse-500" />
            <span className="text-synapse-400">{cleaning.columnsAfter}</span>
          </span>
        </div>
      </div>

      {/* Feature Engineering Report */}
      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={16} className="text-synapse-500" />
          <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
            FEATURE ENGINEERING REPORT
          </h3>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="text-2xl font-bold font-mono text-synapse-400">
            {features.originalFeatures}
          </div>
          <ArrowRight size={20} className="text-synapse-500" />
          <div className="text-2xl font-bold font-mono text-synapse-400 text-glow">
            {features.processedFeatures}
          </div>
          <span className="text-[10px] font-mono text-slate-500">features</span>
        </div>

        {features.removedFeatures.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Scissors size={10} /> Removed (highly correlated)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {features.removedFeatures.map((f) => (
                <span key={f} className="px-2 py-0.5 rounded text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {features.correlatedPairs.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
              Correlated Pairs (r &gt; 0.85)
            </div>
            <div className="space-y-0.5">
              {features.correlatedPairs.slice(0, 5).map((pair, i) => (
                <div key={i} className="text-[11px] font-mono text-slate-400">
                  <span className="text-slate-300">{pair.col1}</span>
                  <span className="text-amber-400 mx-1">↔</span>
                  <span className="text-slate-300">{pair.col2}</span>
                  <span className="text-slate-600 ml-2">r={pair.correlation.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
            Selected Features ({features.selectedFeatures.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {features.selectedFeatures.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-[10px] font-mono text-synapse-400 bg-synapse-500/10 border border-synapse-500/20">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const CleaningSummary = memo(CleaningSummaryComponent);
