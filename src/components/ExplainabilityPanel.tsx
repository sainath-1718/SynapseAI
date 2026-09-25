// ============================================================
// Synapse AI — Explainability Panel
// Shows permutation importance and local explanations.
// ============================================================

import { memo } from 'react';
import { Brain, ArrowUp, ArrowDown, Minus, CheckCircle, XCircle } from 'lucide-react';
import type { ExplanationResults } from '@/types';

interface ExplainabilityPanelProps {
  explanation: ExplanationResults;
}

function ExplainabilityPanelComponent({ explanation }: ExplainabilityPanelProps) {
  const { permutationImportance, localExplanations, globalSummary, modelName } = explanation;
  const significantFeatures = permutationImportance.filter((p) => p.importance > 0);
  const maxImportance = significantFeatures.length > 0 ? Math.max(...significantFeatures.map((f) => f.importance)) : 1;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Brain size={18} className="text-synapse-500" />
        <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
          MODEL EXPLANATION
        </h3>
        <span className="text-[10px] font-mono text-slate-500 ml-auto">
          {modelName} · permutation importance
        </span>
      </div>

      {/* Global Summary */}
      <div className="rounded-xl border border-synapse-500/30 bg-synapse-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-synapse-400">
            Global Summary
          </span>
        </div>
        <p className="text-[12px] text-slate-300 leading-relaxed">
          {globalSummary}
        </p>
      </div>

      {/* Permutation Importance Chart */}
      {significantFeatures.length > 0 && (
        <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-synapse-500/10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Permutation Feature Importance
            </span>
          </div>
          <div className="p-3 space-y-1.5">
            {significantFeatures.slice(0, 10).map((feat) => (
              <div key={feat.feature} className="flex items-center gap-2">
                <div className="flex items-center gap-1 w-32 shrink-0">
                  {feat.direction === 'positive' && <ArrowUp size={10} className="text-emerald-400" />}
                  {feat.direction === 'negative' && <ArrowDown size={10} className="text-rose-400" />}
                  {feat.direction === 'neutral' && <Minus size={10} className="text-slate-500" />}
                  <span className="text-[11px] font-mono text-slate-300 truncate">
                    {feat.feature}
                  </span>
                </div>
                <div className="flex-1 h-2.5 bg-surface-400 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      feat.direction === 'negative'
                        ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                        : feat.direction === 'positive'
                        ? 'bg-gradient-to-r from-synapse-600 to-synapse-400'
                        : 'bg-gradient-to-r from-slate-600 to-slate-400'
                    }`}
                    style={{ width: `${(feat.importance / maxImportance) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500 w-16 text-right">
                  {(feat.importance * 100).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Local Explanations */}
      {localExplanations.length > 0 && (
        <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-synapse-500/10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Sample Predictions Explained
            </span>
          </div>
          <div className="p-3 space-y-3">
            {localExplanations.map((local) => (
              <div
                key={local.sampleIndex}
                className={`rounded-lg border p-3 ${
                  local.correct
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-rose-500/20 bg-rose-500/5'
                }`}
              >
                {/* Prediction header */}
                <div className="flex items-center gap-2 mb-2">
                  {local.correct ? (
                    <CheckCircle size={14} className="text-emerald-400" />
                  ) : (
                    <XCircle size={14} className="text-rose-400" />
                  )}
                  <span className="text-[11px] font-mono">
                    <span className={local.correct ? 'text-emerald-400' : 'text-rose-400'}>
                      {local.correct ? 'CORRECT' : 'WRONG'}
                    </span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-slate-400">Sample #{local.sampleIndex}</span>
                  </span>
                  <span className="text-[11px] font-mono ml-auto">
                    <span className="text-slate-500">True: </span>
                    <span className="text-synapse-400">{local.trueLabel}</span>
                    <span className="text-slate-600 mx-1">→</span>
                    <span className="text-slate-500">Pred: </span>
                    <span className={local.correct ? 'text-emerald-400' : 'text-rose-400'}>
                      {local.predictedLabel}
                    </span>
                  </span>
                </div>

                {/* Top reasons */}
                <div className="space-y-1">
                  {local.topReasons.map((reason, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                      <span className="text-synapse-500 mt-0.5">→</span>
                      {reason}
                    </div>
                  ))}
                </div>

                {/* Feature contributions bar */}
                <div className="mt-2 pt-2 border-t border-synapse-500/10 space-y-1">
                  {local.contributions.slice(0, 5).map((c) => (
                    <div key={c.feature} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-slate-400 w-20 truncate">{c.feature}</span>
                      <div className="flex-1 flex items-center relative h-1.5">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-400/60" />
                        {c.contribution > 0 && (
                          <div
                            className="absolute left-1/2 h-full bg-synapse-500/70 rounded-r"
                            style={{ width: `${Math.min(50, Math.abs(c.contribution) * 200)}%` }}
                          />
                        )}
                        {c.contribution < 0 && (
                          <div
                            className="absolute right-1/2 h-full bg-rose-500/70 rounded-l"
                            style={{ width: `${Math.min(50, Math.abs(c.contribution) * 200)}%` }}
                          />
                        )}
                      </div>
                      <span className={`w-12 text-right ${c.contribution > 0 ? 'text-synapse-400' : c.contribution < 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                        {c.contribution > 0 ? '+' : ''}{c.contribution.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ExplainabilityPanel = memo(ExplainabilityPanelComponent);
