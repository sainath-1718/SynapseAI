import { memo } from 'react';
import { BarChart3, Layers3, Sparkles, Target } from 'lucide-react';
import type { ClusteringResults } from '@/types';

interface Props { results: ClusteringResults; }

function ClusterPlot({ results }: Props) {
  const points = results.pcaPoints;
  if (!points.length) return null;
  const minX = Math.min(...points.map(p=>p.x)), maxX = Math.max(...points.map(p=>p.x));
  const minY = Math.min(...points.map(p=>p.y)), maxY = Math.max(...points.map(p=>p.y));
  const sx=(x:number)=>30+((x-minX)/Math.max(1e-9,maxX-minX))*440;
  const sy=(y:number)=>250-((y-minY)/Math.max(1e-9,maxY-minY))*210;
  return <svg viewBox="0 0 500 280" className="w-full h-full" role="img" aria-label="PCA cluster scatter plot">
    <rect x="0" y="0" width="500" height="280" rx="16" fill="rgba(3,10,8,.55)" />
    <line x1="30" y1="250" x2="470" y2="250" stroke="rgba(100,116,139,.35)" />
    <line x1="30" y1="40" x2="30" y2="250" stroke="rgba(100,116,139,.35)" />
    {points.map((p,i)=><g key={i}><circle cx={sx(p.x)} cy={sy(p.y)} r="4.2" fill="none" stroke="currentColor" className="text-synapse-400" strokeWidth="2" opacity={.9}/><circle cx={sx(p.x)} cy={sy(p.y)} r="1.8" fill="currentColor" className="text-synapse-400"/><title>{`Row ${p.rowIndex+1} · Cluster ${p.cluster}`}</title></g>)}
    <text x="250" y="272" textAnchor="middle" className="fill-slate-600 text-[9px] font-mono">PCA COMPONENT 1</text>
    <text x="10" y="150" textAnchor="middle" transform="rotate(-90 10 150)" className="fill-slate-600 text-[9px] font-mono">PCA COMPONENT 2</text>
  </svg>;
}

function ClusteringResultsPanelComponent({ results }: Props) {
  return <div className="glass-panel rounded-2xl p-5 space-y-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-synapse-400 font-mono text-xs tracking-wider font-semibold"><Layers3 size={15}/> UNSUPERVISED RESULTS</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-100">{results.summary}</h2>
        <p className="mt-1 text-xs text-slate-500">{results.recommendation}</p>
      </div>
      <div className="px-3 py-2 rounded-xl border border-synapse-500/30 bg-synapse-500/10 text-center shrink-0"><div className="text-lg font-bold text-synapse-400">{results.k}</div><div className="text-[9px] font-mono text-slate-600">CLUSTERS</div></div>
    </div>

    <div className="rounded-xl border border-synapse-500/20 bg-surface-200/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-synapse-500/10 flex items-center gap-2"><Layers3 size={13} className="text-synapse-500"/><span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">CLUSTER MODEL SELECTION & TRAINING</span></div>
      <div className="divide-y divide-synapse-500/5">{results.candidates.map(c=><div key={c.algorithm} className="p-3">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-mono text-slate-300">{c.algorithm}</span><span className={`text-[9px] font-mono ${c.status==='evaluated'?'text-synapse-400':'text-slate-600'}`}>{c.status.toUpperCase()}</span></div>
        <div className="mt-1 text-[10px] text-slate-400">{c.reason}</div>
        <div className="mt-1 text-[10px] font-mono text-slate-500 break-words">{c.trainingMethod}</div>
        {c.status==='evaluated' && <div className="mt-1 text-[10px] text-slate-400">Silhouette {c.silhouetteScore?.toFixed(3) ?? '—'} · Davies-Bouldin {c.daviesBouldinScore?.toFixed(3) ?? '—'} · Calinski-H {c.calinskiHarabaszScore?.toFixed(1) ?? '—'}</div>}
      </div>)}</div>
    </div>
    <div className="rounded-xl border border-synapse-500/40 bg-synapse-500/10 p-4"><div className="text-[10px] font-mono uppercase tracking-wider text-synapse-400">FINAL CLUSTERING METHOD</div><div className="mt-1 text-lg font-bold text-synapse-400">{results.algorithm} · k={results.k}</div><p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{results.selectionReason}</p></div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {[
        ['Silhouette', results.silhouetteScore],
        ['Davies-Bouldin', results.daviesBouldinScore],
        ['Calinski-H', results.calinskiHarabaszScore],
        ['Features', results.featureNames.length],
      ].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-800 bg-surface-100/50 p-3"><div className="text-[9px] font-mono text-slate-600 tracking-wider">{label}</div><div className="text-lg font-semibold text-slate-200 mt-1">{typeof value==='number' ? (label==='Calinski-H' ? value.toFixed(1) : label==='Features' ? String(value) : value.toFixed(3)) : '—'}</div></div>)}
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
      <div className="rounded-2xl border border-slate-800 bg-surface-100/40 p-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 mb-2"><BarChart3 size={13}/> PCA PATTERN MAP</div>
        <ClusterPlot results={results}/>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-surface-100/40 p-4">
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 mb-3"><Target size={13}/> CLUSTER PROFILE</div>
        <div className="space-y-2">
          {results.clusterProfiles.map(c=><div key={c.cluster} className={`rounded-xl border p-3 ${c.cluster===results.selectedCluster?'border-synapse-500/35 bg-synapse-500/5':'border-slate-800 bg-surface-0/30'}`}>
            <div className="flex items-center justify-between"><span className="font-mono text-xs text-slate-300">Cluster {c.cluster}</span><span className="font-mono text-[10px] text-synapse-400">{c.size} ({c.percentage.toFixed(1)}%)</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(c.centroid).slice(0,4).map(([name,val])=><span key={name} className="rounded-md px-2 py-1 bg-surface-200/70 text-[9px] font-mono text-slate-500">{name}: {Number(val).toFixed(2)}</span>)}</div>
          </div>)}
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-synapse-500/15 bg-synapse-500/5 p-4 flex items-start gap-3"><Sparkles size={16} className="text-synapse-400 mt-0.5 shrink-0"/><div><div className="text-[10px] font-mono font-semibold text-synapse-400 tracking-wider">DISCOVERED PATTERN</div><p className="text-sm text-slate-300 mt-1">{results.summary} The largest group is Cluster {results.selectedCluster}; inspect its profile before assigning a business meaning.</p></div></div>
  </div>;
}
export const ClusteringResultsPanel = memo(ClusteringResultsPanelComponent);
