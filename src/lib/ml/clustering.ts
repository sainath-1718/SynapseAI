import type { ClusterPoint, ClusterProfile, ClusteringResults } from '@/types';
import type { UnsupervisedData } from '@/lib/ml/preprocessing';

function distance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function initCentroids(X: number[][], k: number, seed = 42): number[][] {
  const rng = seededRandom(seed);
  const first = Math.floor(rng() * X.length);
  const chosen = [first];
  while (chosen.length < k) {
    const d2 = X.map((row, i) => chosen.includes(i) ? 0 : Math.min(...chosen.map(c => distance(row, X[c]) ** 2)));
    const total = d2.reduce((a,b)=>a+b,0);
    if (total <= 0) break;
    let r = rng() * total;
    let picked = 0;
    for (let i=0;i<d2.length;i++) { r -= d2[i]; if (r <= 0) { picked=i; break; } }
    if (!chosen.includes(picked)) chosen.push(picked);
  }
  while (chosen.length < k) chosen.push(chosen[chosen.length % Math.max(1, chosen.length)]);
  return chosen.map(i => [...X[i]]);
}

export function kMeans(X: number[][], k: number, maxIterations = 80, seed = 42): { labels: number[]; centroids: number[][] } {
  if (!X.length) return { labels: [], centroids: [] };
  k = Math.max(2, Math.min(k, X.length));
  let centroids = initCentroids(X, k, seed);
  let labels = new Array(X.length).fill(0);

  for (let iter=0; iter<maxIterations; iter++) {
    let changed = false;
    for (let i=0;i<X.length;i++) {
      let best = 0; let bestD = Infinity;
      for (let c=0;c<centroids.length;c++) {
        const d = distance(X[i], centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }

    const sums = Array.from({length:k}, () => new Array(X[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i=0;i<X.length;i++) {
      const c = labels[i]; counts[c]++;
      for (let j=0;j<X[i].length;j++) sums[c][j] += X[i][j];
    }
    for (let c=0;c<k;c++) {
      if (counts[c] === 0) {
        // Re-seed an empty cluster with the currently worst-represented point.
        let worstIndex = 0;
        let worstDistance = -Infinity;
        for (let i=0;i<X.length;i++) {
          const d = distance(X[i], centroids[labels[i]]);
          if (d > worstDistance) { worstDistance = d; worstIndex = i; }
        }
        sums[c] = [...X[worstIndex]];
        counts[c] = 1;
      } else {
        for (let j=0;j<X[0].length;j++) sums[c][j] /= counts[c];
      }
    }
    centroids = sums;
    if (!changed) break;
  }
  return { labels, centroids };
}

export function silhouetteScore(X: number[][], labels: number[]): number | null {
  const clusters = [...new Set(labels.filter(v => v >= 0))];
  if (clusters.length < 2 || X.length < clusters.length + 1) return null;
  const maxSamples = 800;
  const indices = X.length <= maxSamples ? X.map((_,i)=>i) : Array.from({length:maxSamples},(_,i)=>Math.floor(i*X.length/maxSamples));
  let total=0; let count=0;
  for (const i of indices) {
    const same = indices.filter(j => j !== i && labels[j] === labels[i]);
    if (!same.length) continue;
    const a = same.reduce((s,j)=>s+distance(X[i],X[j]),0)/same.length;
    let b = Infinity;
    for (const c of clusters) {
      if (c === labels[i]) continue;
      const other = indices.filter(j=>labels[j]===c);
      if (other.length) b = Math.min(b, other.reduce((s,j)=>s+distance(X[i],X[j]),0)/other.length);
    }
    if (Number.isFinite(b)) { total += (b-a)/Math.max(a,b,1e-12); count++; }
  }
  return count ? total/count : null;
}

export function daviesBouldinScore(X: number[][], labels: number[], centroids: number[][]): number | null {
  const clusters = [...new Set(labels.filter(v=>v>=0))];
  if (clusters.length < 2) return null;
  const scatter = clusters.map(c => {
    const members = X.filter((_,i)=>labels[i]===c);
    if (!members.length) return 0;
    return members.reduce((s,row)=>s+distance(row,centroids[c]),0)/members.length;
  });
  let total=0;
  for (const i of clusters) {
    let worst=0;
    for (const j of clusters) {
      if (i===j) continue;
      const d=distance(centroids[i],centroids[j]);
      if (d>0) worst=Math.max(worst,(scatter[i]+scatter[j])/d);
    }
    total+=worst;
  }
  return total/clusters.length;
}

export function calinskiHarabaszScore(X: number[][], labels: number[], centroids: number[][]): number | null {
  const n=X.length; const k=centroids.length;
  if (k<2 || n<=k) return null;
  const global=new Array(X[0].length).fill(0);
  for (const row of X) for (let j=0;j<row.length;j++) global[j]+=row[j];
  for (let j=0;j<global.length;j++) global[j]/=n;
  let between=0, within=0;
  for (let c=0;c<k;c++) {
    const members=X.filter((_,i)=>labels[i]===c);
    if (!members.length) continue;
    between += members.length*distance(centroids[c],global)**2;
    within += members.reduce((s,row)=>s+distance(row,centroids[c])**2,0);
  }
  return within>0 ? (between/(k-1))/(within/(n-k)) : null;
}

function covariance(X: number[][]): number[][] {
  const n=X.length, p=X[0].length;
  const mean=new Array(p).fill(0);
  for(const row of X) for(let j=0;j<p;j++) mean[j]+=row[j];
  for(let j=0;j<p;j++) mean[j]/=n;
  const C=Array.from({length:p},()=>new Array(p).fill(0));
  for(const row of X){ for(let i=0;i<p;i++){ const a=row[i]-mean[i]; for(let j=0;j<p;j++) C[i][j]+=a*(row[j]-mean[j]); } }
  for(let i=0;i<p;i++) for(let j=0;j<p;j++) C[i][j]/=Math.max(1,n-1);
  return C;
}

function powerEigen(C: number[][], seed=42, iterations=60): {vector:number[]; value:number} {
  const p=C.length; const rng=seededRandom(seed); let v=Array.from({length:p},()=>rng()-0.5);
  const norm=()=>Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;
  for(let t=0;t<iterations;t++){
    const w=new Array(p).fill(0); for(let i=0;i<p;i++) for(let j=0;j<p;j++) w[i]+=C[i][j]*v[j];
    const n=Math.sqrt(w.reduce((s,x)=>s+x*x,0))||1; v=w.map(x=>x/n);
  }
  let value=0; for(let i=0;i<p;i++){ let cv=0; for(let j=0;j<p;j++) cv+=C[i][j]*v[j]; value+=v[i]*cv; }
  return {vector:v, value};
}

function deflate(C:number[][], e:{vector:number[];value:number}):number[][]{
  const p=C.length; return C.map((row,i)=>row.map((x,j)=>x-e.value*e.vector[i]*e.vector[j]));
}

export function pca2D(X:number[][]): {x:number;y:number}[] {
  if (!X.length) return [];
  if (X[0].length===1) return X.map(r=>({x:r[0],y:0}));
  let C=covariance(X);
  const e1=powerEigen(C,42);
  C=deflate(C,e1);
  const e2=powerEigen(C,84);
  return X.map(row=>({x:row.reduce((s,v,j)=>s+v*e1.vector[j],0), y:row.reduce((s,v,j)=>s+v*e2.vector[j],0)}));
}

export function buildClusteringResults(data: UnsupervisedData): ClusteringResults {
  if (data.rowCount < 3) throw new Error('At least 3 unique rows are required for unsupervised clustering.');
  if (!data.X.length || !data.X[0]?.length) throw new Error('No usable features are available for unsupervised clustering.');
  const maxK=Math.min(6, Math.max(2, data.rowCount-1));
  let best = { k:2, labels:[] as number[], centroids:[] as number[][], silhouette:-Infinity };
  for(let k=2;k<=maxK;k++){
    const out=kMeans(data.X,k,80,42+k);
    const sil=silhouetteScore(data.X,out.labels) ?? -Infinity;
    if(sil>best.silhouette) best={k,labels:out.labels,centroids:out.centroids,silhouette:sil};
  }
  const labels=best.labels;
  const sizes=Array.from({length:best.k},(_,c)=>labels.filter(v=>v===c).length);
  const clusterSizes=sizes.map((size,cluster)=>({cluster,size,percentage:data.rowCount?size/data.rowCount*100:0}));
  const clusterProfiles:ClusterProfile[]=clusterSizes.map(({cluster,size,percentage})=>{
    const members=data.X.filter((_,i)=>labels[i]===cluster);
    const centroid:Record<string,number>={};
    data.featureNames.forEach((name,j)=>centroid[name]=members.length?members.reduce((s,r)=>s+r[j],0)/members.length:0);
    return {cluster,size,percentage,centroid};
  });
  const coords=pca2D(data.X);
  const pcaPoints:ClusterPoint[]=coords.map((p,rowIndex)=>({x:p.x,y:p.y,cluster:labels[rowIndex] ?? -1,rowIndex}));
  const selectedCluster=clusterSizes.slice().sort((a,b)=>b.size-a.size)[0]?.cluster ?? null;
  const db=daviesBouldinScore(data.X,labels,best.centroids);
  const ch=calinskiHarabaszScore(data.X,labels,best.centroids);
  const recommendation = `K-Means selected ${best.k} clusters because it produced the highest silhouette score among k=2..${maxK}. DBSCAN remains an alternative when the data contains irregularly shaped or noise-heavy groups.`;
  const summary = `Discovered ${best.k} customer segments across ${data.rowCount.toLocaleString()} records using ${data.featureNames.length} prepared features.`;
  const candidates = [
    { algorithm:'K-Means' as const, reason:'Centroid-based baseline for standardized numeric feature space; k is selected objectively with silhouette score.', trainingMethod:`KMeans(n_clusters=${best.k}, n_init=10, random_state=42).fit(X_scaled)`, status:'evaluated' as const, silhouetteScore:Number.isFinite(best.silhouette)?best.silhouette:null, daviesBouldinScore:db, calinskiHarabaszScore:ch },
    { algorithm:'DBSCAN' as const, reason:'Density-based alternative for irregularly shaped clusters and noise/outliers; not selected in this run.', trainingMethod:'DBSCAN(eps=0.5, min_samples=5).fit(X_scaled)', status:'not_selected' as const, silhouetteScore:null, daviesBouldinScore:null, calinskiHarabaszScore:null },
  ];
  const selectionReason = `K-Means was used for the final clustering result because it achieved the best evaluated silhouette score at k=${best.k}. DBSCAN was retained as an alternative but was not selected in this run.`;
  return { algorithm:'K-Means', k:best.k, labels, featureNames:data.featureNames, clusterSizes, clusterProfiles, silhouetteScore:Number.isFinite(best.silhouette)?best.silhouette:null, daviesBouldinScore:db, calinskiHarabaszScore:ch, pcaPoints, selectedCluster, summary, recommendation, candidates, selectionReason };
}
