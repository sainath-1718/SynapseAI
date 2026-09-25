// ============================================================
// Synapse AI — Dataset Summary Component
// Displays the real dataset profile results after analysis.
// ============================================================

import { memo } from 'react';
import {
  Database,
  Columns,
  Rows3,
  AlertTriangle,
  Copy,
  Type,
  Hash,
  ToggleLeft,
  Target,
  Gauge,
  TrendingUp,
} from 'lucide-react';
import type { DatasetProfile } from '@/types';
import { formatBytes, formatNumber } from '@/lib/csvEngine';

interface DatasetSummaryProps {
  profile: DatasetProfile;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  accent = 'synapse',
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: 'synapse' | 'amber' | 'rose' | 'sky';
}) {
  const colorMap = {
    synapse: 'text-synapse-400 border-synapse-500/30 bg-synapse-500/5',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
    sky: 'text-sky-400 border-sky-500/30 bg-sky-500/5',
  };

  return (
    <div className={`rounded-xl border p-3 ${colorMap[accent]} transition-all hover:scale-[1.02]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="opacity-70" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold font-mono">
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function DatasetSummaryComponent({ profile }: DatasetSummaryProps) {
  const qualityColor =
    profile.qualityScore >= 80
      ? 'text-synapse-400'
      : profile.qualityScore >= 50
        ? 'text-amber-400'
        : 'text-rose-400';

  const taskTypeLabel =
    profile.taskType === 'classification'
      ? 'Classification'
      : profile.taskType === 'regression'
        ? 'Regression'
        : profile.taskType === 'clustering'
          ? 'Clustering'
          : 'Unknown';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Database size={18} className="text-synapse-500" />
        <h3 className="text-sm font-semibold text-synapse-400 tracking-wide">
          DATASET PROFILE
        </h3>
        <span className="text-[10px] font-mono text-slate-500 ml-auto">
          {profile.fileName} · {formatBytes(profile.fileSizeBytes)}
        </span>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard icon={Rows3} label="Rows" value={formatNumber(profile.rows)} />
        <MetricCard icon={Columns} label="Columns" value={profile.columns} />
        <MetricCard
          icon={AlertTriangle}
          label="Missing"
          value={formatNumber(profile.missingValues)}
          sublabel={`${profile.missingPercent.toFixed(1)}%`}
          accent={profile.missingValues > 0 ? 'amber' : 'synapse'}
        />
        <MetricCard
          icon={Copy}
          label="Duplicates"
          value={formatNumber(profile.duplicates)}
          sublabel={`${profile.duplicatePercent.toFixed(1)}%`}
          accent={profile.duplicates > 0 ? 'amber' : 'synapse'}
        />
      </div>

      {/* Column Types */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard icon={Hash} label="Numerical" value={profile.numericalColumns} accent="sky" />
        <MetricCard icon={Type} label="Categorical" value={profile.categoricalColumns} accent="sky" />
        <MetricCard icon={ToggleLeft} label="Boolean" value={profile.booleanColumns} accent="sky" />
      </div>

      {/* Target Detection */}
      <div className="rounded-xl border border-synapse-500/20 bg-synapse-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-synapse-500" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Target Detection
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-mono text-slate-500 mb-1">Target Column</div>
            {profile.targetColumn ? (
              <div className="text-sm font-mono font-semibold text-synapse-400">
                {profile.targetColumn}
              </div>
            ) : (
              <div className="text-sm font-mono text-amber-400">
                Not detected — unsupervised path
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-500 mb-1">Task Type</div>
            <div className="text-sm font-mono font-semibold text-synapse-400">
              {taskTypeLabel}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-500 mb-1">Evidence Score</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-surface-400 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-synapse-600 to-synapse-400 transition-all duration-700"
                  style={{ width: `${profile.targetConfidence}%` }}
                />
              </div>
              <span className="text-xs font-mono text-synapse-400 font-semibold">
                {profile.targetConfidence}%
              </span>
            </div>
          </div>
          {profile.imbalanceDetected && (
            <div>
              <div className="text-[10px] font-mono text-slate-500 mb-1">Imbalance</div>
              <div className="text-sm font-mono font-semibold text-amber-400">
                {profile.imbalanceRatio}
              </div>
            </div>
          )}
          <div className="col-span-2 rounded-lg border border-slate-800 bg-surface-100/50 p-3">
            <div className="text-[10px] font-mono text-slate-500 mb-1">Decision Reason</div>
            <p className="text-[11px] leading-relaxed text-slate-400">{profile.targetReason}</p>
          </div>
          {profile.identifierColumns.length > 0 && (
            <div className="col-span-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3">
              <div className="text-[10px] font-mono text-amber-500 mb-1">Identifier Columns Excluded</div>
              <div className="text-[11px] font-mono text-slate-400">{profile.identifierColumns.join(', ')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Quality Score */}
      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Gauge size={14} className="text-synapse-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Quality Score
            </span>
          </div>
          <span className={`text-2xl font-bold font-mono ${qualityColor}`}>
            {profile.qualityScore}
            <span className="text-sm text-slate-600">/100</span>
          </span>
        </div>
        <div className="h-2 bg-surface-400 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full transition-all duration-700 ${
              profile.qualityScore >= 80
                ? 'bg-gradient-to-r from-synapse-600 to-synapse-400'
                : profile.qualityScore >= 50
                  ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                  : 'bg-gradient-to-r from-rose-600 to-rose-400'
            }`}
            style={{ width: `${profile.qualityScore}%` }}
          />
        </div>
        {profile.qualityIssues.length > 0 && (
          <ul className="space-y-1">
            {profile.qualityIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400 font-mono">
                <span className="text-amber-400 mt-0.5">•</span>
                {issue}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Class Distribution (if classification) */}
      {profile.classDistribution && profile.classDistribution.length > 0 && (
        <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-synapse-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Class Distribution
            </span>
          </div>
          <div className="space-y-2">
            {profile.classDistribution.map((cls) => (
              <div key={cls.value}>
                <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span className="text-slate-300">{cls.value}</span>
                  <span className="text-slate-500">
                    {formatNumber(cls.count)} ({cls.percent.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-synapse-600 to-synapse-400 transition-all duration-700"
                    style={{ width: `${cls.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column Details Table */}
      <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-synapse-500/10">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Column Details
          </span>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-surface-200/80 backdrop-blur">
              <tr className="text-slate-500 text-left">
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Type</th>
                <th className="px-3 py-2 font-normal text-right">Unique</th>
                <th className="px-3 py-2 font-normal text-right">Missing</th>
                <th className="px-3 py-2 font-normal">Target?</th>
              </tr>
            </thead>
            <tbody>
              {profile.columnInfos.map((col) => (
                <tr
                  key={col.name}
                  className="border-t border-synapse-500/5 hover:bg-synapse-500/5 transition-colors"
                >
                  <td className="px-3 py-1.5 text-slate-300 truncate max-w-[120px]">
                    {col.name}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        col.dtype === 'integer' || col.dtype === 'float'
                          ? 'text-sky-400 bg-sky-500/10'
                          : col.dtype === 'categorical'
                            ? 'text-amber-400 bg-amber-500/10'
                            : col.dtype === 'boolean'
                              ? 'text-violet-400 bg-violet-500/10'
                              : col.dtype === 'datetime'
                                ? 'text-rose-400 bg-rose-500/10'
                                : 'text-slate-500 bg-slate-700/20'
                      }`}
                    >
                      {col.dtype}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-400">
                    {formatNumber(col.uniqueCount)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {col.missingCount > 0 ? (
                      <span className="text-amber-400">{col.missingCount}</span>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {col.isTargetCandidate ? (
                      <span className="text-synapse-400 font-semibold">candidate</span>
                    ) : col.isConstant ? (
                      <span className="text-rose-400/60 text-[9px]">constant</span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const DatasetSummary = memo(DatasetSummaryComponent);
