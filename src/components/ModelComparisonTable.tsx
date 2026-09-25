// ============================================================
// Synapse AI — Model Comparison Table
// Shows real evaluation metrics for all trained models.
// ============================================================

import { memo } from 'react';
import { Trophy, TrendingUp, Clock, CheckCircle2, FlaskConical } from 'lucide-react';
import type { CandidateModel, EvaluationResults } from '@/types';

interface ModelComparisonTableProps {
  results: EvaluationResults;
  candidates?: CandidateModel[] | null;
}

function ModelComparisonTableComponent({ results, candidates }: ModelComparisonTableProps) {
  const { models, bestModel, selectionMetric } = results;

  const isRegression = selectionMetric.includes('RMSE');
  const sortedModels = [...models].sort((a, b) => isRegression ? (a.rmse ?? Infinity) - (b.rmse ?? Infinity) : (selectionMetric.includes('F1') ? b.f1 - a.f1 : b.accuracy - a.accuracy));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={18} className="text-synapse-500" />
        <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
          MODEL COMPARISON
        </h3>
        <span className="text-[10px] font-mono text-slate-500 ml-auto">
          Selection metric: {selectionMetric}
        </span>
      </div>

      {/* Best Model Highlight */}
      <div className="rounded-xl border border-synapse-500/40 bg-synapse-500/10 p-4 shadow-glow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={16} className="text-synapse-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-synapse-400">
            Recommended Model
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold text-synapse-400 text-glow">
            {bestModel.modelName}
          </span>
          <span className="text-2xl font-bold font-mono text-synapse-400">
            {isRegression ? `RMSE ${(bestModel.rmse ?? 0).toFixed(4)}` : `${((selectionMetric.includes('F1') ? bestModel.f1 : bestModel.accuracy) * 100).toFixed(1)}%`}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          {results.selectionReason}
        </p>
      </div>


      {candidates && candidates.length > 0 && <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-synapse-500/10"><span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">MODEL SELECTION AGENT — CANDIDATE REASONING</span></div>
        <div className="divide-y divide-synapse-500/5">{candidates.map(c=><div key={c.shortName} className="p-3"><div className="text-xs font-mono text-slate-300">{c.name}</div><div className="mt-1 text-[10px] text-slate-400 leading-relaxed">{c.reason}</div></div>)}</div>
      </div>}

      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-synapse-500/10 flex items-center gap-2">
          <FlaskConical size={13} className="text-synapse-500" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">MODEL TRAINING TRACE</span>
        </div>
        <div className="divide-y divide-synapse-500/5">
          {sortedModels.map(model => <div key={`train-${model.shortName}`} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-slate-300">{model.modelName}</span>
              <span className="text-[9px] font-mono text-synapse-400">{model.trainingStatus.toUpperCase()} · {model.trainTime.toFixed(2)}s</span>
            </div>
            <div className="mt-1 text-[10px] font-mono text-slate-500 break-words">{model.trainingMethod}</div>
            <div className="mt-1 text-[10px] text-slate-400">Test-set score: {isRegression ? `RMSE ${(model.rmse ?? 0).toFixed(4)} · MAE ${(model.mae ?? 0).toFixed(4)} · R² ${(model.r2 ?? 0).toFixed(4)}` : `Accuracy ${(model.accuracy*100).toFixed(1)}% · Precision ${(model.precision*100).toFixed(1)}% · Recall ${(model.recall*100).toFixed(1)}% · F1 ${(model.f1*100).toFixed(1)}%`}</div>
          </div>)}
        </div>
      </div>

      <div className="rounded-xl border border-synapse-500/40 bg-synapse-500/10 p-4 shadow-glow-sm">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-synapse-400"><CheckCircle2 size={14}/> FINAL TEST MODEL</div>
        <div className="mt-2 flex items-baseline justify-between gap-3"><span className="text-lg font-bold text-synapse-400">{bestModel.modelName}</span><span className="text-[10px] font-mono text-slate-500">{selectionMetric}</span></div>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{results.finalModelUseReason}</p>
      </div>

      {/* Comparison Table */}
      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-mono">
            <thead>
              <tr className="text-slate-500 text-left border-b border-synapse-500/15">
                <th className="px-4 py-2.5 font-normal">Model</th>
                {isRegression ? <>
                  <th className="px-3 py-2.5 font-normal text-right">RMSE</th>
                  <th className="px-3 py-2.5 font-normal text-right">MAE</th>
                  <th className="px-3 py-2.5 font-normal text-right">R²</th>
                </> : <>
                  <th className="px-3 py-2.5 font-normal text-right">Accuracy</th>
                  <th className="px-3 py-2.5 font-normal text-right">Precision</th>
                  <th className="px-3 py-2.5 font-normal text-right">Recall</th>
                  <th className="px-3 py-2.5 font-normal text-right">F1 Score</th>
                  <th className="px-3 py-2.5 font-normal text-right">ROC-AUC</th>
                </> }
                <th className="px-3 py-2.5 font-normal text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model) => (
                <tr
                  key={model.shortName}
                  className={`border-t border-synapse-500/5 transition-colors ${
                    model.isBest
                      ? 'bg-synapse-500/10 hover:bg-synapse-500/15'
                      : 'hover:bg-synapse-500/5'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {model.isBest && (
                        <Trophy size={12} className="text-synapse-400" />
                      )}
                      <span className={model.isBest ? 'text-synapse-400 font-semibold' : 'text-slate-300'}>{model.modelName}</span>
                    </div>
                  </td>
                  {isRegression ? <>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.rmse ?? 0).toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.mae ?? 0).toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.r2 ?? 0).toFixed(4)}</td>
                  </> : <>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.accuracy * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.precision * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{(model.recall * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right"><span className={model.isBest ? 'text-synapse-400 font-semibold' : 'text-slate-400'}>{(model.f1 * 100).toFixed(1)}%</span></td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{model.rocAuc !== null ? model.rocAuc.toFixed(3) : '—'}</td>
                  </>}
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {model.trainTime.toFixed(2)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-class metrics for best model */}
      {!isRegression && results.perClass.length > 0 && results.perClass.length <= 10 && (
        <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-synapse-500/10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Per-Class Performance ({bestModel.modelName})
            </span>
          </div>
          <div className="p-3 space-y-2">
            {results.perClass.map((cls) => (
              <div key={cls.class} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-300 w-24 truncate">
                  {cls.label}
                </span>
                <div className="flex-1 flex gap-1">
                  <div className="flex-1">
                    <div className="text-[9px] text-slate-600 mb-0.5">P</div>
                    <div className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
                      <div className="h-full bg-synapse-500/70" style={{ width: `${cls.precision * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[9px] text-slate-600 mb-0.5">R</div>
                    <div className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
                      <div className="h-full bg-synapse-500/70" style={{ width: `${cls.recall * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[9px] text-slate-600 mb-0.5">F1</div>
                    <div className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
                      <div className="h-full bg-synapse-500" style={{ width: `${cls.f1 * 100}%` }} />
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 w-12 text-right">
                  {cls.support}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Importance (from best model) */}
      {bestModel.featureImportance.length > 0 && (
        <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-synapse-500/10 flex items-center gap-2">
            <TrendingUp size={12} className="text-synapse-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Feature Importance ({bestModel.modelName})
            </span>
          </div>
          <div className="p-3 space-y-1.5">
            {[...bestModel.featureImportance]
              .sort((a, b) => b.importance - a.importance)
              .slice(0, 10)
              .map((feat) => (
                <div key={feat.name} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-300 w-28 truncate">
                    {feat.name}
                  </span>
                  <div className="flex-1 h-2 bg-surface-400 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-synapse-600 to-synapse-400 transition-all duration-700"
                      style={{ width: `${feat.importance * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
                    {(feat.importance * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ModelComparisonTable = memo(ModelComparisonTableComponent);
