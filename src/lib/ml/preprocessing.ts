// ============================================================
// Synapse AI — Real ML Preprocessing
// Imputation, encoding, scaling, train/test split.
// All operations are real computations.
// ============================================================

import type { DatasetProfile, ColumnInfo } from '@/types';
import type { ParsedCSV } from '@/lib/csvEngine';

export interface CleaningReport {
  missingHandled: number;
  duplicatesRemoved: number;
  categoricalEncoded: number;
  constantColumnsRemoved: number;
  booleanConverted: number;
  actions: string[];
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;
}

export interface FeatureReport {
  originalFeatures: number;
  processedFeatures: number;
  removedFeatures: string[];
  correlatedPairs: { col1: string; col2: string; correlation: number }[];
  selectedFeatures: string[];
  varianceScores: { name: string; variance: number }[];
}

// Internal representation: numeric matrix + feature names + target vector + label map
export interface ProcessedData {
  X: number[][];
  y: number[];
  featureNames: string[];
  targetName: string;
  labelMap: Map<string, number>; // categorical target → numeric
  labelMapInverse: Map<number, string>;
  trainIndices: number[];
  testIndices: number[];
  XTrain: number[][];
  XTest: number[][];
  yTrain: number[];
  yTest: number[];
  numClasses: number;
  taskType: 'classification' | 'regression';
}

// --- Imputation ---

function imputeNumericColumn(values: (number | null)[]): { values: number[]; count: number } {
  const nonNull = values.filter((v) => v !== null && !isNaN(v)) as number[];
  if (nonNull.length === 0) return { values: values.map(() => 0), count: 0 };
  const median = computeMedian(nonNull);
  let count = 0;
  const result = values.map((v) => {
    if (v === null || v === undefined || isNaN(v)) {
      count++;
      return median;
    }
    return v;
  });
  return { values: result, count };
}

function computeMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// --- Encoding ---

function encodeCategoricalColumn(
  values: string[],
  encodingMap: Map<string, number>
): { values: number[]; uniqueCount: number } {
  // For low cardinality, use label encoding (sufficient for tree models)
  // For high cardinality, use frequency encoding
  const unique = new Set(values);
  if (unique.size <= 30) {
    let idx = encodingMap.size;
    for (const v of unique) {
      if (!encodingMap.has(v)) {
        encodingMap.set(v, idx++);
      }
    }
    return {
      values: values.map((v) => encodingMap.get(v) ?? 0),
      uniqueCount: unique.size,
    };
  } else {
    // Frequency encoding
    const counts = new Map<string, number>();
    values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    const total = values.length;
    return {
      values: values.map((v) => (counts.get(v) || 0) / total),
      uniqueCount: unique.size,
    };
  }
}

// --- Standardization ---

function standardizeColumn(column: number[]): number[] {
  const mean = column.reduce((a, b) => a + b, 0) / column.length;
  const variance = column.reduce((a, b) => a + (b - mean) ** 2, 0) / column.length;
  const std = Math.sqrt(variance) || 1;
  return column.map((v) => (v - mean) / std);
}

// --- Train/Test Split ---

function stratifiedSplit(
  y: number[],
  numClasses: number,
  testRatio: number,
  seed: number
): { trainIndices: number[]; testIndices: number[] } {
  // Group indices by class
  const classIndices: number[][] = Array.from({ length: numClasses }, () => []);
  y.forEach((label, idx) => {
    if (label >= 0 && label < numClasses) {
      classIndices[label].push(idx);
    }
  });

  // Shuffle each class group with seeded RNG
  const trainIndices: number[] = [];
  const testIndices: number[] = [];

  for (const indices of classIndices) {
    const shuffled = seededShuffle(indices, seed);
    const testSize = Math.max(1, Math.floor(shuffled.length * testRatio));
    testIndices.push(...shuffled.slice(0, testSize));
    trainIndices.push(...shuffled.slice(testSize));
  }

  // Sort for consistency
  trainIndices.sort((a, b) => a - b);
  testIndices.sort((a, b) => a - b);

  return { trainIndices, testIndices };
}

function randomSplit(
  n: number,
  testRatio: number,
  seed: number
): { trainIndices: number[]; testIndices: number[] } {
  const indices = Array.from({ length: n }, (_, i) => i);
  const shuffled = seededShuffle(indices, seed);
  const testSize = Math.max(1, Math.floor(n * testRatio));
  return {
    testIndices: shuffled.slice(0, testSize).sort((a, b) => a - b),
    trainIndices: shuffled.slice(testSize).sort((a, b) => a - b),
  };
}

// --- Seeded RNG (for reproducibility) ---

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// --- Main Preprocessing Function ---

export function cleanAndPreprocess(
  parsed: ParsedCSV,
  profile: DatasetProfile,
  targetColumn: string
): { data: ProcessedData; cleaningReport: CleaningReport; featureReport: FeatureReport } {
  const { headers, rows } = parsed;
  const actions: string[] = [];
  const rowsBefore = rows.length;
  const columnsBefore = headers.length;

  // Remove exact duplicate rows before any statistics are fitted.
  const seen = new Set<string>();
  const uniqueRows: string[][] = [];
  for (const row of rows) {
    const key = row.join('\x1f');
    if (!seen.has(key)) { seen.add(key); uniqueRows.push(row); }
  }
  const duplicatesRemoved = rows.length - uniqueRows.length;
  if (duplicatesRemoved) actions.push(`Removed ${duplicatesRemoved} duplicate rows`);

  const targetIdx = headers.indexOf(targetColumn);
  if (targetIdx < 0) throw new Error(`Target column "${targetColumn}" was not found in the dataset.`);

  const featureColumns: { idx: number; name: string; info: ColumnInfo }[] = [];
  let constantColumnsRemoved = 0;
  for (let i = 0; i < headers.length; i++) {
    if (i === targetIdx) continue;
    const info = profile.columnInfos[i];
    if (info.isIdentifier) { actions.push(`Excluded identifier column "${info.name}" from ML features`); continue; }
    if (info.isConstant) { constantColumnsRemoved++; actions.push(`Removed constant column "${info.name}" (no variance)`); continue; }
    featureColumns.push({ idx: i, name: headers[i], info });
  }

  // Encode the target first so the split is deterministic and stratified for classification.
  const targetInfo = profile.columnInfos[targetIdx];
  const targetRaw = uniqueRows.map(r => (r[targetIdx] ?? '').trim());
  const labelMap = new Map<string, number>();
  const labelMapInverse = new Map<number, string>();
  let y: number[];

  if (targetInfo.dtype === 'integer' || targetInfo.dtype === 'float' || targetInfo.dtype === 'boolean') {
    if (targetInfo.dtype === 'boolean') {
      y = targetRaw.map(v => ['true','yes','1'].includes(v.toLowerCase()) ? 1 : 0);
      labelMap.set('0',0); labelMap.set('1',1); labelMapInverse.set(0,'0'); labelMapInverse.set(1,'1');
    } else {
      y = targetRaw.map(v => { const n=parseFloat(v.replace(',','.')); return Number.isFinite(n) ? n : 0; });
      const uniqueTargets = new Set(y);
      if (targetInfo.dtype === 'integer' && uniqueTargets.size <= 20) {
        [...uniqueTargets].sort((a,b)=>a-b).forEach((v,i)=>{ labelMap.set(String(v),i); labelMapInverse.set(i,String(v)); });
        y = y.map(v => labelMap.get(String(v)) ?? 0);
      }
    }
  } else {
    const uniqueTargets = [...new Set(targetRaw)].sort();
    uniqueTargets.forEach((v,i)=>{ labelMap.set(v,i); labelMapInverse.set(i,v); });
    y = targetRaw.map(v => labelMap.get(v) ?? 0);
  }

  const numClasses = labelMap.size > 0 ? labelMap.size : new Set(y).size;
  const isClassification = (targetInfo.dtype === 'boolean' || targetInfo.dtype === 'categorical' ||
    (targetInfo.dtype === 'integer' && numClasses >= 2 && numClasses <= 20));

  const split = isClassification && numClasses >= 2
    ? stratifiedSplit(y, numClasses, 0.2, 42)
    : randomSplit(uniqueRows.length, 0.2, 42);
  const trainSet = new Set(split.trainIndices);

  // IMPORTANT: every learned preprocessing parameter below is fitted on TRAIN only.
  // This prevents test-set distribution leakage.
  let missingHandled = 0;
  let categoricalEncoded = 0;
  let booleanConverted = 0;
  const featureMatrix: number[][] = [];
  const featureNames: string[] = [];

  for (const { idx, name, info } of featureColumns) {
    const raw = uniqueRows.map(r => (r[idx] ?? '').trim());
    const trainRaw = split.trainIndices.map(i => raw[i]);

    if (info.dtype === 'integer' || info.dtype === 'float') {
      const trainNums = trainRaw.map(v => v === '' ? null : (Number.isFinite(parseFloat(v.replace(',','.'))) ? parseFloat(v.replace(',','.')) : null));
      const median = computeMedian(trainNums.filter((v): v is number => v !== null));
      const safeMedian = Number.isFinite(median) ? median : 0;
      let columnMissing = 0;
      const values = raw.map(v => {
        if (v === '') { missingHandled++; columnMissing++; return safeMedian; }
        const n=parseFloat(v.replace(',','.'));
        if (!Number.isFinite(n)) { missingHandled++; columnMissing++; return safeMedian; }
        return n;
      });
      const trainValues = split.trainIndices.map(i=>values[i]);
      const mean=trainValues.reduce((a,b)=>a+b,0)/Math.max(1,trainValues.length);
      const variance=trainValues.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,trainValues.length);
      const std=Math.sqrt(variance)||1;
      featureMatrix.push(values.map(v=>(v-mean)/std));
      featureNames.push(name);
      if (columnMissing) actions.push(`Imputed ${columnMissing} missing values in "${name}" using train-set median`);
    } else if (info.dtype === 'boolean') {
      const trainBool=trainRaw.filter(v=>v!=='').map(v=>['true','yes','1'].includes(v.toLowerCase())?1:0);
      const modeBool=trainBool.length && trainBool.filter(v=>v===1).length>=trainBool.length/2 ? 1 : 0;
      const values=raw.map(v=>v===''?modeBool:(['true','yes','1'].includes(v.toLowerCase())?1:0));
      const boolMissing=raw.filter(v=>v==='').length;
      missingHandled += boolMissing;
      if(boolMissing) actions.push(`Imputed ${boolMissing} missing values in "${name}" using train-set boolean mode`);
      featureMatrix.push(values);
      featureNames.push(name); booleanConverted++;
    } else {
      // One-hot encoding is used for low-cardinality categoricals so distance models
      // do not interpret arbitrary category IDs as ordered numeric values.
      const counts = new Map<string, number>();
      trainRaw.filter(v=>v!=='').forEach(v=>counts.set(v,(counts.get(v)||0)+1));
      const fallback=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? 'Missing';
      const catMissing=raw.filter(v=>v==='').length;
      const cleanRaw=raw.map(v=>{if(v===''){missingHandled++;return fallback;}return v;});
      const cleanTrain=cleanRaw.filter((_,i)=>trainSet.has(i));
      if(catMissing) actions.push(`Imputed ${catMissing} missing values in "${name}" using train-set mode`);
      cleanTrain.forEach(v=>counts.set(v,(counts.get(v)||0)+0));
      const categories=[...counts.keys()].sort();
      if (categories.length <= 30) {
        for (const category of categories) {
          featureMatrix.push(cleanRaw.map(v=>v===category?1:0));
          featureNames.push(`${name}=${category}`);
        }
        categoricalEncoded++;
        actions.push(`One-hot encoded categorical column "${name}" (${categories.length} categories; mapping fitted on train set)`);
      } else {
        const total=Math.max(1,cleanTrain.length);
        featureMatrix.push(cleanRaw.map(v=>(counts.get(v)||0)/total));
        featureNames.push(name);
        categoricalEncoded++;
        actions.push(`Frequency-encoded high-cardinality column "${name}" (${counts.size} train categories)`);
      }
    }
  }

  // Feature screening is also fitted on TRAIN only.
  const trainMatrix = split.trainIndices.map(i => featureMatrix.map(col=>col[i]));
  const correlatedPairs: { col1:string; col2:string; correlation:number }[]=[];
  const varianceScores:{name:string;variance:number}[]=[];
  for(let j=0;j<featureMatrix.length;j++){
    const col=split.trainIndices.map(i=>featureMatrix[j][i]);
    const mean=col.reduce((a,b)=>a+b,0)/Math.max(1,col.length);
    const variance=col.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,col.length);
    varianceScores.push({name:featureNames[j],variance});
  }
  // Avoid O(p^2) work on very wide datasets; use a deterministic cap and report it.
  const corrCap=200;
  const corrCols=Math.min(featureMatrix.length,corrCap);
  if(featureMatrix.length>corrCap) actions.push(`Correlation screening capped at ${corrCap} features to avoid quadratic memory/time growth`);
  for(let i=0;i<corrCols;i++) for(let j=i+1;j<corrCols;j++){
    const x=split.trainIndices.map(k=>featureMatrix[i][k]); const z=split.trainIndices.map(k=>featureMatrix[j][k]);
    const corr=pearsonCorrelation(x,z);
    if(Math.abs(corr)>0.85) correlatedPairs.push({col1:featureNames[i],col2:featureNames[j],correlation:corr});
  }
  const varianceByName=new Map(varianceScores.map(v=>[v.name,v.variance]));
  const toRemove=new Set<string>();
  for(const pair of correlatedPairs){
    const v1=varianceByName.get(pair.col1)||0, v2=varianceByName.get(pair.col2)||0;
    toRemove.add(v1>=v2?pair.col2:pair.col1);
  }
  const selectedFeatureIndices=featureNames.map((_,i)=>i).filter(i=>!toRemove.has(featureNames[i]));
  const selectedFeatures=selectedFeatureIndices.map(i=>featureNames[i]);
  const X=uniqueRows.map((_,r)=>selectedFeatureIndices.map(i=>featureMatrix[i][r]));
  const XTrain=split.trainIndices.map(i=>X[i]);
  const XTest=split.testIndices.map(i=>X[i]);

  const cleaningReport:CleaningReport={
    missingHandled, duplicatesRemoved, categoricalEncoded, constantColumnsRemoved, booleanConverted,
    actions, rowsBefore, rowsAfter:uniqueRows.length, columnsBefore, columnsAfter:featureColumns.length+1
  };
  const featureReport:FeatureReport={
    originalFeatures:featureColumns.length, processedFeatures:selectedFeatures.length,
    removedFeatures:[...toRemove], correlatedPairs, selectedFeatures,
    varianceScores:varianceScores.sort((a,b)=>b.variance-a.variance)
  };
  const data:ProcessedData={X,y,featureNames:selectedFeatures,targetName:targetColumn,labelMap,labelMapInverse,
    trainIndices:split.trainIndices,testIndices:split.testIndices,XTrain,XTest,
    yTrain:split.trainIndices.map(i=>y[i]),yTest:split.testIndices.map(i=>y[i]),
    numClasses:isClassification?numClasses:0,taskType:isClassification?'classification':'regression'};
  return {data,cleaningReport,featureReport};
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}


export interface UnsupervisedData {
  X: number[][];
  featureNames: string[];
  rowCount: number;
}

export function cleanAndPreprocessUnsupervised(
  parsed: ParsedCSV,
  profile: DatasetProfile
): { data: UnsupervisedData; cleaningReport: CleaningReport; featureReport: FeatureReport } {
  const { headers, rows } = parsed;
  const actions: string[] = [];
  const rowsBefore = rows.length;
  const columnsBefore = headers.length;
  const seen = new Set<string>();
  const uniqueRows: string[][] = [];
  for (const row of rows) {
    const key = row.join('\x1f');
    if (!seen.has(key)) { seen.add(key); uniqueRows.push(row); }
  }
  const duplicatesRemoved = rows.length - uniqueRows.length;
  if (duplicatesRemoved) actions.push(`Removed ${duplicatesRemoved} duplicate rows`);

  const removedFeatures: string[] = [];
  const featureCols: { idx: number; name: string; info: ColumnInfo }[] = [];
  profile.columnInfos.forEach((info, idx) => {
    if (info.isIdentifier) {
      removedFeatures.push(info.name);
      actions.push(`Excluded identifier column "${info.name}" from unsupervised features`);
    } else if (info.isConstant) {
      removedFeatures.push(info.name);
      actions.push(`Removed constant column "${info.name}"`);
    } else if (info.dtype === 'integer' || info.dtype === 'float' || info.dtype === 'boolean' || info.dtype === 'categorical') {
      featureCols.push({ idx, name: info.name, info });
    }
  });

  let missingHandled = 0;
  let categoricalEncoded = 0;
  let booleanConverted = 0;
  const featureMatrix: number[][] = [];
  const featureNames: string[] = [];

  for (const { idx, name, info } of featureCols) {
    const raw = uniqueRows.map((r) => (r[idx] ?? '').trim());
    let values: number[];
    if (info.dtype === 'integer' || info.dtype === 'float') {
      const nums: (number|null)[] = raw.map(v => v === '' ? null : (isNaN(parseFloat(v.replace(',', '.'))) ? null : parseFloat(v.replace(',', '.'))));
      const out = imputeNumericColumn(nums);
      values = out.values;
      missingHandled += out.count;
    } else if (info.dtype === 'boolean') {
      const valid=raw.filter(v=>v!=='').map(v=>['true','yes','1'].includes(v.toLowerCase())?1:0);
      const mode=valid.length && valid.filter(v=>v===1).length>=valid.length/2 ? 1 : 0;
      values = raw.map(v => v==='' ? mode : (['true','yes','1'].includes(v.toLowerCase()) ? 1 : 0));
      missingHandled += raw.filter(v=>v==='').length; booleanConverted++;
    } else {
      // Never use arbitrary label IDs for clustering: category IDs create fake distances.
      const counts = new Map<string, number>();
      raw.filter(v=>v!=='').forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
      const fallback=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? 'Missing';
      const cleanRaw=raw.map(v=>{if(v===''){missingHandled++;return fallback;}return v;});
      const categories = [...counts.keys()].sort();
      if (categories.length <= 30) {
        for (const category of categories) {
          featureMatrix.push(cleanRaw.map(v => v === category ? 1 : 0));
          featureNames.push(`${name}=${category}`);
        }
      } else {
        const total = Math.max(1, raw.length);
        featureMatrix.push(cleanRaw.map(v => (counts.get(v) || 0) / total));
        featureNames.push(name);
      }
      categoricalEncoded++;
      actions.push(`Encoded categorical column "${name}" for clustering using ${categories.length <= 30 ? 'one-hot' : 'frequency'} encoding`);
      continue;
    }
    featureMatrix.push(values);
    featureNames.push(name);
  }

  if (featureMatrix.length === 0 || uniqueRows.length === 0) {
    throw new Error('No usable non-identifier features remain for unsupervised learning.');
  }
  const usable: number[][] = Array.from({ length: uniqueRows.length }, () => []);
  featureMatrix.forEach((col) => col.forEach((v, r) => usable[r].push(v)));

  // Standardize every feature so distance-based clustering is not dominated by scale.
  for (let j = 0; j < featureNames.length; j++) {
    const column = usable.map(r => r[j]);
    const scaled = standardizeColumn(column);
    for (let i = 0; i < usable.length; i++) usable[i][j] = scaled[i];
  }

  const varianceScores = featureNames.map((name, j) => {
    const col = usable.map(r => r[j]);
    const mean = col.reduce((a,b) => a+b, 0) / (col.length || 1);
    const variance = col.reduce((a,b) => a + (b-mean)**2, 0) / (col.length || 1);
    return { name, variance };
  }).sort((a,b) => b.variance-a.variance);

  const correlatedPairs: { col1: string; col2: string; correlation: number }[] = [];
  const corrCap = 200;
  const corrCols = Math.min(featureNames.length, corrCap);
  if (featureNames.length > corrCap) actions.push(`Correlation screening capped at ${corrCap} features for wide unsupervised datasets`);
  for (let i = 0; i < corrCols; i++) {
    for (let j = i + 1; j < corrCols; j++) {
      const a = usable.map(r => r[i]); const b = usable.map(r => r[j]);
      const ma = a.reduce((x,y)=>x+y,0)/(a.length||1); const mb = b.reduce((x,y)=>x+y,0)/(b.length||1);
      let num=0, da=0, db=0;
      for (let k=0;k<a.length;k++){ const xa=a[k]-ma, xb=b[k]-mb; num+=xa*xb; da+=xa*xa; db+=xb*xb; }
      const corr = da && db ? num/Math.sqrt(da*db) : 0;
      if (Math.abs(corr) > 0.85) correlatedPairs.push({ col1: featureNames[i], col2: featureNames[j], correlation: corr });
    }
  }

  const report: CleaningReport = {
    missingHandled,
    duplicatesRemoved,
    categoricalEncoded,
    constantColumnsRemoved: removedFeatures.filter(n => profile.columnInfos.find(c=>c.name===n)?.isConstant).length,
    booleanConverted,
    actions,
    rowsBefore,
    rowsAfter: uniqueRows.length,
    columnsBefore,
    columnsAfter: featureNames.length,
  };
  const featureReport: FeatureReport = {
    originalFeatures: headers.length,
    processedFeatures: featureNames.length,
    removedFeatures,
    correlatedPairs,
    selectedFeatures: featureNames,
    varianceScores,
  };
  return { data: { X: usable, featureNames, rowCount: uniqueRows.length }, cleaningReport: report, featureReport };
}
