// ============================================================
// Synapse AI — Real Explainability Engine
// Permutation importance + local feature contribution analysis.
// All operations are real computations on the trained model.
// ============================================================

import type {
  PermutationImportance,
  LocalExplanation,
  ExplanationResults,
  ModelResult,
  DatasetProfile,
  CleaningReport,
  FeatureReport,
} from '@/types';
import type { ProcessedData } from '@/lib/ml/preprocessing';
import { LogisticRegression, RandomForest, GradientBoosting, LinearRegression, RandomForestRegressor, GradientBoostingRegressor } from '@/lib/ml/algorithms';
import { evaluateClassification } from '@/lib/ml/evaluation';

// Retrain a model on the full training set (needed for permutation)
type PredictFn = (X: number[][]) => number[];
type PredictProbaFn = (X: number[][]) => number[][];

interface RetrainedModel {
  predict: PredictFn;
  predictProba: PredictProbaFn;
  featureImportance: () => { name: string; importance: number }[];
}

function retrainModel(
  bestModel: ModelResult,
  data: ProcessedData
): RetrainedModel {
  const largeDataset = data.XTrain.length >= 50000;
  const veryLargeDataset = data.XTrain.length >= 100000;
  const rfTrees = veryLargeDataset ? 10 : largeDataset ? 15 : 30;
  const rfDepth = veryLargeDataset ? 6 : largeDataset ? 7 : 8;
  const treeTrainLimit = veryLargeDataset ? 10000 : largeDataset ? 20000 : data.XTrain.length;
  const gbTrees = veryLargeDataset ? 20 : largeDataset ? 25 : 40;
  const gbDepth = veryLargeDataset ? 3 : 4;
  const lrEpochs = veryLargeDataset ? 120 : largeDataset ? 180 : 300;

  if (data.taskType === 'regression') {
    if (bestModel.shortName === 'LIN') {
      const model = new LinearRegression(data.featureNames); model.fit(data.XTrain,data.yTrain);
      return {predict:X=>model.predict(X),predictProba:X=>X.map(()=>[]),featureImportance:()=>model.featureImportance()};
    }
    if (bestModel.shortName === 'RFR') {
      const model = new RandomForestRegressor(data.featureNames,rfTrees,rfDepth); model.fit(data.XTrain,data.yTrain,42,treeTrainLimit);
      return {predict:X=>model.predict(X),predictProba:X=>X.map(()=>[]),featureImportance:()=>model.featureImportance()};
    }
    const model = new GradientBoostingRegressor(data.featureNames,gbTrees,gbDepth,0.08); model.fit(data.XTrain,data.yTrain,42,treeTrainLimit);
    return {predict:X=>model.predict(X),predictProba:X=>X.map(()=>[]),featureImportance:()=>model.featureImportance()};
  }

  if (bestModel.shortName === 'LR') {
    const model = new LogisticRegression(data.numClasses || 2, data.featureNames, 0.1, lrEpochs);
    model.fit(data.XTrain, data.yTrain);
    return {
      predict: (X) => model.predict(X),
      predictProba: (X) => model.predictProba(X),
      featureImportance: () => model.featureImportance(),
    };
  } else if (bestModel.shortName === 'RF') {
    const model = new RandomForest(data.numClasses || 2, data.featureNames, rfTrees, rfDepth);
    model.fit(data.XTrain, data.yTrain, 42, treeTrainLimit);
    return {
      predict: (X) => model.predict(X),
      predictProba: (X) => X.map(() => {
        const preds = model.predict(X);
        return [0.5, 0.5]; // RF doesn't expose proba
      }),
      featureImportance: () => model.featureImportance(),
    };
  } else {
    const model = new GradientBoosting(data.numClasses || 2, data.featureNames, gbTrees, gbDepth, 0.3);
    model.fit(data.XTrain, data.yTrain, 42, treeTrainLimit);
    return {
      predict: (X) => model.predict(X),
      predictProba: (X) => model.predictProba(X),
      featureImportance: () => model.featureImportance(),
    };
  }
}

// --- Permutation Feature Importance ---
// Shuffles each feature column and measures the drop in accuracy.
// This is model-agnostic and runs entirely in the browser.

export function computePermutationImportance(
  bestModel: ModelResult,
  data: ProcessedData
): PermutationImportance[] {
  const model = retrainModel(bestModel, data);

  const baselinePreds = model.predict(data.XTest);
  const regressionR2 = (actual:number[], predicted:number[]) => {
    const mean=actual.reduce((a,b)=>a+b,0)/Math.max(1,actual.length);
    const ssTot=actual.reduce((s,v)=>s+(v-mean)**2,0);
    const ssRes=actual.reduce((s,v,i)=>s+(v-predicted[i])**2,0);
    return ssTot>0 ? 1-ssRes/ssTot : 0;
  };
  const baselineAccuracy = data.taskType === 'regression' ? regressionR2(data.yTest,baselinePreds) : evaluateClassification(data.yTest,baselinePreds,null,data.labelMapInverse).accuracy;

  const results: PermutationImportance[] = [];

  for (let f = 0; f < data.featureNames.length; f++) {
    // Create permuted test set
    const permutedIndices = Array.from({ length: data.XTest.length }, (_, i) => i);
    // Seeded shuffle for reproducibility
    let s = 42 + f;
    for (let i = permutedIndices.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = Math.floor((s / 0x7fffffff) * (i + 1));
      [permutedIndices[i], permutedIndices[j]] = [permutedIndices[j], permutedIndices[i]];
    }

    const permutedX = data.XTest.map((row, i) => {
      const newRow = [...row];
      newRow[f] = data.XTest[permutedIndices[i]][f];
      return newRow;
    });

    const permutedPreds = model.predict(permutedX);
    const permutedAccuracy = data.taskType === 'regression' ? regressionR2(data.yTest,permutedPreds) : evaluateClassification(data.yTest,permutedPreds,null,data.labelMapInverse).accuracy;
    const accuracyDrop = baselineAccuracy - permutedAccuracy;

    // Determine direction by checking correlation with target on training set
    const featureValues = data.XTrain.map((row) => row[f]);
    const targetValues = data.yTrain;
    const correlation = pearsonCorrelation(featureValues, targetValues);

    const direction: 'positive' | 'negative' | 'neutral' =
      correlation > 0.1 ? 'positive' : correlation < -0.1 ? 'negative' : 'neutral';

    results.push({
      feature: data.featureNames[f],
      importance: Math.max(0, accuracyDrop),
      accuracyDrop,
      direction,
    });
  }

  // Sort by importance descending
  results.sort((a, b) => b.importance - a.importance);

  return results;
}

// --- Local Explanations ---
// For a few sample predictions, show which features contributed most.
// Uses a simple but real approach: compare each feature's value to the
// feature's mean, weighted by the feature's permutation importance.

export function computeLocalExplanations(
  bestModel: ModelResult,
  data: ProcessedData,
  permutationImportance: PermutationImportance[]
): LocalExplanation[] {
  const model = retrainModel(bestModel, data);

  // Compute feature means and stds from training data
  const nFeatures = data.featureNames.length;
  const featureMeans = new Array(nFeatures).fill(0);
  const featureStds = new Array(nFeatures).fill(0);

  for (let f = 0; f < nFeatures; f++) {
    const values = data.XTrain.map((row) => row[f]);
    featureMeans[f] = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - featureMeans[f]) ** 2, 0) / values.length;
    featureStds[f] = Math.sqrt(variance) || 1;
  }

  // Build importance lookup
  const importanceMap = new Map<string, number>();
  for (const pi of permutationImportance) {
    importanceMap.set(pi.feature, pi.importance);
  }

  // Select samples: 3 correct + 2 incorrect (if available)
  const preds = model.predict(data.XTest);
  const correctIndices: number[] = [];
  const incorrectIndices: number[] = [];

  for (let i = 0; i < data.yTest.length; i++) {
    const isCorrect = data.taskType === 'regression'
      ? Math.abs(preds[i]-data.yTest[i]) <= Math.max(1e-9, Math.abs(data.yTest[i])*0.10)
      : preds[i] === data.yTest[i];
    if (isCorrect) {
      correctIndices.push(i);
    } else {
      incorrectIndices.push(i);
    }
  }

  const sampleIndices: number[] = [];
  // Pick evenly spaced correct predictions
  for (let i = 0; i < Math.min(3, correctIndices.length); i++) {
    const idx = Math.floor((i / 3) * correctIndices.length);
    sampleIndices.push(correctIndices[idx]);
  }
  // Pick evenly spaced incorrect predictions
  for (let i = 0; i < Math.min(2, incorrectIndices.length); i++) {
    const idx = Math.floor((i / 2) * incorrectIndices.length);
    sampleIndices.push(incorrectIndices[idx]);
  }

  // If no incorrect, fill with more correct
  while (sampleIndices.length < 5 && correctIndices.length > sampleIndices.length) {
    const next = correctIndices[sampleIndices.length % correctIndices.length];
    if (!sampleIndices.includes(next)) {
      sampleIndices.push(next);
    } else {
      break;
    }
  }

  const explanations: LocalExplanation[] = [];

  for (const testIdx of sampleIndices) {
    const x = data.XTest[testIdx];
    const trueLabel = data.labelMapInverse.get(data.yTest[testIdx]) ?? String(data.yTest[testIdx]);
    const predLabel = data.labelMapInverse.get(preds[testIdx]) ?? String(preds[testIdx]);
    const correct = data.taskType === 'regression'
      ? Math.abs(preds[testIdx]-data.yTest[testIdx]) <= Math.max(1e-9, Math.abs(data.yTest[testIdx])*0.10)
      : preds[testIdx] === data.yTest[testIdx];

    // Compute contributions: how far each feature deviates from the mean,
    // weighted by its importance
    const contributions: LocalExplanation['contributions'] = [];

    for (let f = 0; f < nFeatures; f++) {
      const deviation = (x[f] - featureMeans[f]) / featureStds[f];
      const importance = importanceMap.get(data.featureNames[f]) ?? 0;
      const contribution = deviation * importance;

      const direction: 'pushed_up' | 'pushed_down' | 'neutral' =
        contribution > 0.001 ? 'pushed_up' : contribution < -0.001 ? 'pushed_down' : 'neutral';

      contributions.push({
        feature: data.featureNames[f],
        value: x[f],
        contribution,
        direction,
      });
    }

    // Sort by absolute contribution
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Build human-readable reasons
    const topReasons: string[] = [];
    for (const c of contributions.slice(0, 3)) {
      const deviation = c.value - featureMeans[data.featureNames.indexOf(c.feature)];
      const directionText = c.direction === 'pushed_up' ? 'higher than average' : c.direction === 'pushed_down' ? 'lower than average' : 'near average';
      const effectText = c.direction === 'pushed_up' ? 'increased' : c.direction === 'pushed_down' ? 'decreased' : 'had minimal effect on';
      topReasons.push(
        `"${c.feature}" was ${directionText} (${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}), which ${effectText} the prediction`
      );
    }

    explanations.push({
      sampleIndex: testIdx,
      trueLabel,
      predictedLabel: predLabel,
      correct,
      contributions: contributions.slice(0, 8),
      topReasons,
    });
  }

  return explanations;
}

// --- Global Summary ---

export function buildGlobalSummary(
  bestModel: ModelResult,
  permutationImportance: PermutationImportance[],
  data: ProcessedData,
  profile: DatasetProfile
): string {
  const top3 = permutationImportance.slice(0, 3).filter((p) => p.importance > 0);
  const topFeatureNames = top3.map((p) => `"${p.feature}"`).join(', ');

  if (data.taskType === 'regression') {
    const rmse=(bestModel.rmse ?? 0).toFixed(4), mae=(bestModel.mae ?? 0).toFixed(4), r2=(bestModel.r2 ?? 0).toFixed(4);
    return `The ${bestModel.modelName} model achieved RMSE ${rmse}, MAE ${mae}, and R² ${r2} on the test set. Permutation feature importance identifies which prepared features most affect predictive performance.`;
  }
  const accuracyPct = (bestModel.accuracy * 100).toFixed(1);
  const f1Pct = (bestModel.f1 * 100).toFixed(1);

  let summary = `The ${bestModel.modelName} model achieved ${accuracyPct}% accuracy and ${f1Pct}% F1 score on the test set. `;

  if (top3.length > 0) {
    summary += `The most influential features were ${topFeatureNames}. `;
    const positiveFeatures = top3.filter((p) => p.direction === 'positive').map((p) => p.feature);
    const negativeFeatures = top3.filter((p) => p.direction === 'negative').map((p) => p.feature);

    if (positiveFeatures.length > 0) {
      summary += `${positiveFeatures.map((f) => `"${f}"`).join(' and ')} ${positiveFeatures.length > 1 ? 'were' : 'was'} positively correlated with the target. `;
    }
    if (negativeFeatures.length > 0) {
      summary += `${negativeFeatures.map((f) => `"${f}"`).join(' and ')} ${negativeFeatures.length > 1 ? 'were' : 'was'} negatively correlated. `;
    }
  } else {
    summary += `No single feature dominated predictions — the model relies on a distributed pattern across features. `;
  }

  if (profile.imbalanceDetected) {
    summary += `Class imbalance was detected (${profile.imbalanceRatio}); F1 score is more reliable than accuracy here. `;
  }

  summary += `The model uses ${data.featureNames.length} features to predict ${data.numClasses} class(es).`;

  return summary;
}

// --- Main Explanation Function ---

export function generateExplanation(
  bestModel: ModelResult,
  data: ProcessedData,
  profile: DatasetProfile,
  cleaning: CleaningReport,
  features: FeatureReport
): ExplanationResults {
  const permutationImportance = computePermutationImportance(bestModel, data);
  const localExplanations = computeLocalExplanations(bestModel, data, permutationImportance);
  const globalSummary = buildGlobalSummary(bestModel, permutationImportance, data, profile);

  const topFeatures = permutationImportance
    .filter((p) => p.importance > 0)
    .slice(0, 10)
    .map((p) => ({
      name: p.feature,
      importance: p.importance,
      direction: p.direction,
    }));

  return {
    modelName: bestModel.modelName,
    permutationImportance,
    localExplanations,
    globalSummary,
    topFeatures,
  };
}

// --- Utility ---

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
