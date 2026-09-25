import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Minimize2, Send, Sparkles, X } from 'lucide-react';
import type { EvaluationResults, ExperimentReport, ExplanationResults, WorkflowState } from '@/types';

interface Props {
  workflowState: WorkflowState;
  evaluation: EvaluationResults | null;
  explanation: ExplanationResults | null;
  report: ExperimentReport | null;
  onClose: () => void;
  onOpen: () => void;
  isOpen: boolean;
}
type Message={id:number;role:'user'|'assistant';text:string};

function answer(question:string, p:Props):string{
  const q=question.toLowerCase().trim();
  const ws=p.workflowState; const profile=ws.datasetProfile; const cluster=ws.clusteringResults;
  if (/^(hi|hello|hey|hii|namaste|hai)\b/.test(q)) return 'Hi! Nenu Synapse Seva. Current experiment context meeda direct ga questions adagochu — dataset, target decision, supervised/unsupervised path, agents, preprocessing, models, metrics, clusters, errors, code, or report.';
  if (q.includes('who are you')||q.includes('what are you')||q.includes('name')) return 'I am Synapse Seva — the context-aware AI assistant inside Synapse AI. Nenu current experiment state ni follow chesi answer ista.';
  if (q.includes('target')||q.includes('label')) {
    if(!profile) return 'Dataset upload ayyaka target decision cheptha.';
    return profile.targetColumn ? `Detected target: ${profile.targetColumn}. Task: ${profile.taskType}. Evidence score: ${profile.targetConfidence}%. Reason: ${profile.targetReason}` : `No reliable target detected. Reason: ${profile.targetReason} Synapse selected the unsupervised branch instead of forcing a column as target.`;
  }
  if (q.includes('unsupervised')||q.includes('supervised')||q.includes('learning')) return `Current learning paradigm: ${ws.learningParadigm.toUpperCase()}. ${ws.learningParadigm==='unsupervised' ? 'No target was reliable enough, so Synapse routes the data through feature preparation → clustering recommendation → clustering → cluster evaluation → explainability → report.' : ws.learningParadigm==='supervised' ? 'A clear target was detected, so Synapse routes through target validation → model recommendation → training → evaluation → prediction → explainability → report.' : 'Learning decision is not available yet.'}`;
  if (q.includes('id')||q.includes('identifier')||q.includes('customer_id')) return profile?.identifierColumns?.length ? `Identifier columns detected and excluded from ML features: ${profile.identifierColumns.join(', ')}. Identifier columns can uniquely identify rows but generally should not drive clustering or prediction.` : 'No identifier column is currently recorded.';
  if (q.includes('dataset')||q.includes('rows')||q.includes('columns')||q.includes('missing')||q.includes('duplicate')) return profile ? `Dataset: ${profile.fileName}. ${profile.rows.toLocaleString()} rows × ${profile.columns} columns. Missing: ${profile.missingValues.toLocaleString()} (${profile.missingPercent.toFixed(2)}%). Duplicates: ${profile.duplicates.toLocaleString()}. Quality score: ${profile.qualityScore}/100.` : 'No dataset is loaded yet.';
  if (q.includes('agent')||q.includes('doing')||q.includes('happening')||q.includes('status')) return `Workflow status: ${ws.status.toUpperCase()}. Current agent: ${ws.currentAgentId || 'none'}. ${ws.currentAgentId ? 'The active agent is processing its assigned stage and handing its structured context to the next stage.' : 'Upload a dataset to start the agent flow.'}`;
  if (q.includes('model')||q.includes('algorithm')) {
    if(ws.learningParadigm==='unsupervised') return cluster ? `${cluster.algorithm} selected with k=${cluster.k}. K-Means was compared across multiple k values using silhouette score. ${cluster.recommendation}` : 'This experiment is on the unsupervised path. Cluster Scout evaluates K-Means and DBSCAN, then K-Means k-selection is performed using silhouette score.';
    if(p.evaluation?.bestModel) return `${p.evaluation.bestModel.modelName} is the best evaluated supervised model using ${p.evaluation.selectionMetric}. ${p.evaluation.selectionReason}`;
    return 'Model recommendation is not ready yet.';
  }
  if (q.includes('accuracy')||q.includes('precision')||q.includes('recall')||q.includes('f1')||q.includes('metric')) return p.evaluation ? `${p.evaluation.bestModel.modelName}: Accuracy ${(p.evaluation.bestModel.accuracy*100).toFixed(2)}%, Precision ${(p.evaluation.bestModel.precision*100).toFixed(2)}%, Recall ${(p.evaluation.bestModel.recall*100).toFixed(2)}%, F1 ${(p.evaluation.bestModel.f1*100).toFixed(2)}%.` : cluster ? `Unsupervised metrics: Silhouette ${cluster.silhouetteScore?.toFixed(3) ?? 'n/a'}, Davies-Bouldin ${cluster.daviesBouldinScore?.toFixed(3) ?? 'n/a'}, Calinski-Harabasz ${cluster.calinskiHarabaszScore?.toFixed(2) ?? 'n/a'}.` : 'Metrics are not available yet.';
  if (q.includes('cluster')||q.includes('pattern')||q.includes('segment')) return cluster ? `${cluster.summary} The largest group is Cluster ${cluster.selectedCluster}. Cluster sizes: ${cluster.clusterSizes.map(c=>`C${c.cluster}=${c.size}`).join(', ')}. ${cluster.recommendation}` : 'Clustering results are not ready yet.';
  if (q.includes('feature')||q.includes('shap')||q.includes('explain')) return p.explanation ? `${p.explanation.globalSummary} Top reported features: ${p.explanation.topFeatures.slice(0,4).map(f=>f.name).join(', ') || 'not available'}.` : 'Explainability results are not ready yet.';
  if (q.includes('error')||q.includes('fail')||q.includes('problem')||q.includes('wrong')) return ws.errors.length ? `Current workflow issue: ${ws.errors[ws.errors.length-1]}. Recommended action: follow the WHAT → WHY → ACTION guidance shown in the workflow and choose another target or the unsupervised path when labels are unsuitable.` : 'No workflow error is currently recorded.';
  if (q.includes('code')||q.includes('python')) return 'Live Code Execution is the separate bottom code window. It shows the generated Python only, and the code viewport auto-scrolls as the active stage changes.';
  if (q.includes('report')) return p.report ? p.report.summary : 'Final report is not generated yet.';
  if (q.includes('why')) return profile ? `Synapse decision: ${ws.learningParadigm==='unsupervised' ? 'unsupervised learning' : 'supervised learning'}. ${profile.targetColumn ? `Target ${profile.targetColumn} was accepted because ${profile.targetReason}` : profile.targetReason}` : 'Upload a dataset and I will explain the decision from the live experiment context.';
  return `Nenu current Synapse experiment context use chestha. ${profile ? `Current dataset ${profile.fileName} is loaded and the workflow is ${ws.status}.` : 'No dataset is loaded yet.'} Ask about what is happening, why a decision was made, what an agent produced, what a metric means, what the clusters mean, or what to do next.`;
}

function SynapseSevaComponent(p:Props){
  const [messages,setMessages]=useState<Message[]>([{id:1,role:'assistant',text:'Hi, I am Synapse Seva. Ask anything about the current Synapse experiment.'}]);
  const [input,setInput]=useState(''); const scrollRef=useRef<HTMLDivElement>(null);
  const suggestions=useMemo(()=>['What is happening now?','Why this learning path?','Explain the result'],[]);
  const send=(value=input)=>{const text=value.trim();if(!text)return;const reply=answer(text,p);setMessages(prev=>[...prev,{id:Date.now(),role:'user',text},{id:Date.now()+1,role:'assistant',text:reply}]);setInput('');};
  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[messages]);
  if(!p.isOpen) return <button onClick={p.onOpen} className="fixed right-4 top-24 z-50 inline-flex items-center gap-2 rounded-xl border border-synapse-500/40 bg-surface-100/95 px-3 py-2 text-[10px] font-mono font-bold text-synapse-300 shadow-glow backdrop-blur-xl"><Bot size={14}/> SYNAPSE SEVA</button>;
  return <aside className="fixed right-4 top-[78px] bottom-4 z-50 w-[min(370px,calc(100vw-2rem))] glass-panel-strong rounded-2xl overflow-hidden flex flex-col shadow-glow border border-synapse-500/20">
    <div className="flex items-center justify-between px-4 py-3 border-b border-synapse-500/20 bg-surface-200/70"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl border border-synapse-500/35 bg-synapse-500/10 flex items-center justify-center"><Bot size={16} className="text-synapse-400"/></div><div><div className="font-mono text-sm font-bold text-synapse-400 text-glow">Synapse Seva</div><div className="text-[8px] font-mono text-slate-600 tracking-wider">LIVE EXPERIMENT ASSISTANT</div></div></div><div className="flex items-center gap-1"><button onClick={p.onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-synapse-400" title="Minimize"><Minimize2 size={14}/></button><button onClick={p.onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400" title="Close"><X size={14}/></button></div></div>
    <div className="px-3 py-2 border-b border-synapse-500/10 flex flex-wrap gap-1.5">{suggestions.map(s=><button key={s} onClick={()=>send(s)} className="px-2 py-1 rounded-lg border border-synapse-500/15 bg-surface-100/60 text-[9px] font-mono text-slate-500 hover:text-synapse-400">{s}</button>)}</div>
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {messages.map(m=><div key={m.id} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed ${m.role==='user'?'bg-synapse-500/15 border border-synapse-500/25 text-synapse-100':'bg-surface-100/70 border border-slate-800 text-slate-300'}`}>{m.role==='assistant'&&<div className="flex items-center gap-1 mb-1 text-[9px] font-mono text-synapse-400"><Sparkles size={9}/> SEVA</div>}{m.text}</div></div>)}
    </div>
    <form onSubmit={e=>{e.preventDefault();send();}} className="p-3 border-t border-synapse-500/20 bg-surface-200/60"><div className="flex items-end gap-2 rounded-xl border border-synapse-500/20 bg-surface-0/70 p-2 focus-within:border-synapse-500/50"><textarea value={input} onChange={e=>setInput(e.target.value)} rows={2} placeholder="Ask Synapse Seva anything..." className="flex-1 resize-none bg-transparent outline-none text-[11px] font-mono text-slate-200 placeholder:text-slate-700"/><button type="submit" className="p-2 rounded-lg bg-synapse-500/15 border border-synapse-500/30 text-synapse-400"><Send size={14}/></button></div><div className="mt-1 text-[8px] font-mono text-slate-700">Grounded in current dataset · workflow · results · errors</div></form>
  </aside>;
}
export const SynapseSeva=memo(SynapseSevaComponent);
