// ============================================================
// Synapse AI — Real ML Evaluation Metrics
// Accuracy, Precision, Recall, F1, ROC-AUC.
// ============================================================

export interface EvaluationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  confusionMatrix: number[][];
  perClass: {
    class: number;
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }[];
}

export function evaluateClassification(
  yTrue: number[],
  yPred: number[],
  yProba: number[] | null,
  labelMapInverse: Map<number, string>
): EvaluationMetrics {
  const n = yTrue.length;
  if (n === 0) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      rocAuc: null,
      confusionMatrix: [],
      perClass: [],
    };
  }

  // Get unique classes
  const classes = [...new Set([...yTrue, ...yPred])].sort((a, b) => a - b);
  const numClasses = classes.length;

  // Confusion matrix
  const cm: number[][] = Array.from({ length: numClasses }, () =>
    new Array(numClasses).fill(0)
  );
  const classToIdx = new Map<number, number>();
  classes.forEach((c, i) => classToIdx.set(c, i));

  for (let i = 0; i < n; i++) {
    const trueIdx = classToIdx.get(yTrue[i])!;
    const predIdx = classToIdx.get(yPred[i])!;
    cm[trueIdx][predIdx]++;
  }

  // Per-class metrics
  const perClass: EvaluationMetrics['perClass'] = [];
  let macroPrecision = 0;
  let macroRecall = 0;
  let macroF1 = 0;

  for (let c = 0; c < numClasses; c++) {
    const tp = cm[c][c];
    const fp = cm.reduce((sum, row, i) => (i !== c ? sum + row[c] : sum), 0);
    const fn = cm[c].reduce((sum, val, i) => (i !== c ? sum + val : sum), 0);
    const support = cm[c].reduce((sum, val) => sum + val, 0);

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    macroPrecision += precision;
    macroRecall += recall;
    macroF1 += f1;

    perClass.push({
      class: classes[c],
      label: labelMapInverse.get(classes[c]) ?? String(classes[c]),
      precision,
      recall,
      f1,
      support,
    });
  }

  macroPrecision /= numClasses;
  macroRecall /= numClasses;
  macroF1 /= numClasses;

  // Accuracy
  let correct = 0;
  for (let i = 0; i < n; i++) {
    if (yTrue[i] === yPred[i]) correct++;
  }
  const accuracy = correct / n;

  // ROC-AUC (binary only, using probabilities)
  let rocAuc: number | null = null;
  if (yProba && numClasses === 2) {
    rocAuc = computeRocAuc(yTrue, yProba);
  }

  return {
    accuracy,
    precision: macroPrecision,
    recall: macroRecall,
    f1: macroF1,
    rocAuc,
    confusionMatrix: cm,
    perClass,
  };
}

function computeRocAuc(yTrue: number[], yScores: number[]): number {
  // Sort by score descending
  const sorted = yTrue
    .map((label, i) => ({ label, score: yScores[i] }))
    .sort((a, b) => b.score - a.score);

  const posCount = sorted.filter((s) => s.label === 1).length;
  const negCount = sorted.filter((s) => s.label === 0).length;

  if (posCount === 0 || negCount === 0) return 0.5;

  // Compute AUC using the rank-based formula
  let auc = 0;
  let cumPos = 0;
  let cumNeg = 0;

  for (const { label } of sorted) {
    if (label === 1) {
      cumPos++;
    } else {
      cumNeg++;
      auc += cumPos; // number of positives ranked above this negative
    }
  }

  return auc / (posCount * negCount);
}

// --- Cross-Validation (simplified 3-fold for speed) ---

export function crossValidate(
  X: number[][],
  y: number[],
  trainFn: (XTrain: number[][], yTrain: number[]) => { predict: (X: number[][]) => number[] },
  k = 3,
  seed = 42
): { meanAccuracy: number; stdAccuracy: number; foldAccuracies: number[] } {
  const n = X.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  // Shuffle
  const rng = (() => {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  })();

  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const foldSize = Math.floor(n / k);
  const foldAccuracies: number[] = [];

  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = start + foldSize;
    const testIdx = indices.slice(start, end);
    const trainIdx = [...indices.slice(0, start), ...indices.slice(end)];

    const XTrain = trainIdx.map((i) => X[i]);
    const yTrain = trainIdx.map((i) => y[i]);
    const XTest = testIdx.map((i) => X[i]);
    const yTest = testIdx.map((i) => y[i]);

    const model = trainFn(XTrain, yTrain);
    const preds = model.predict(XTest);

    let correct = 0;
    for (let i = 0; i < yTest.length; i++) {
      if (yTest[i] === preds[i]) correct++;
    }
    foldAccuracies.push(correct / yTest.length);
  }

  const meanAcc = foldAccuracies.reduce((a, b) => a + b, 0) / k;
  const stdAcc = Math.sqrt(
    foldAccuracies.reduce((a, b) => a + (b - meanAcc) ** 2, 0) / k
  );

  return { meanAccuracy: meanAcc, stdAccuracy: stdAcc, foldAccuracies };
}
