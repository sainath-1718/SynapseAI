// ============================================================
// Synapse AI — Real ML Algorithms
// Logistic Regression, Decision Tree, Random Forest, Gradient Boosting
// All implemented from scratch in TypeScript.
// ============================================================

import { seededRandom } from '@/lib/ml/utils';

// --- Model Interface ---

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  trainTime: number;
  predictions: number[];
  probabilities: number[] | null;
  featureImportance: { name: string; importance: number }[];
}

export interface TrainingResult {
  modelName: string;
  metrics: ModelMetrics;
  trained: true;
}

// --- Logistic Regression (Multiclass via One-vs-Rest) ---

export class LogisticRegression {
  private weights: number[][] = []; // one per class
  private biases: number[] = [];
  private numClasses: number;
  private lr: number;
  private epochs: number;
  private featureNames: string[];

  constructor(numClasses: number, featureNames: string[], lr = 0.1, epochs = 300) {
    this.numClasses = numClasses;
    this.lr = lr;
    this.epochs = epochs;
    this.featureNames = featureNames;
  }

  fit(X: number[][], y: number[]): void {
    const nFeatures = X[0].length;
    const nSamples = X.length;

    if (this.numClasses === 2) {
      // Binary logistic regression
      const w = new Array(nFeatures).fill(0);
      let b = 0;

      for (let epoch = 0; epoch < this.epochs; epoch++) {
        const grads = new Array(nFeatures).fill(0);
        let gradB = 0;

        for (let i = 0; i < nSamples; i++) {
          const z = dotProduct(w, X[i]) + b;
          const pred = sigmoid(z);
          const error = pred - (y[i] === 1 ? 1 : 0);
          for (let j = 0; j < nFeatures; j++) {
            grads[j] += error * X[i][j];
          }
          gradB += error;
        }

        for (let j = 0; j < nFeatures; j++) {
          w[j] -= this.lr * grads[j] / nSamples;
        }
        b -= this.lr * gradB / nSamples;
      }

      this.weights = [w];
      this.biases = [b];
    } else {
      // One-vs-Rest multiclass
      this.weights = [];
      this.biases = [];

      for (let c = 0; c < this.numClasses; c++) {
        const w = new Array(nFeatures).fill(0);
        let b = 0;

        for (let epoch = 0; epoch < this.epochs; epoch++) {
          const grads = new Array(nFeatures).fill(0);
          let gradB = 0;

          for (let i = 0; i < nSamples; i++) {
            const z = dotProduct(w, X[i]) + b;
            const pred = sigmoid(z);
            const error = pred - (y[i] === c ? 1 : 0);
            for (let j = 0; j < nFeatures; j++) {
              grads[j] += error * X[i][j];
            }
            gradB += error;
          }

          for (let j = 0; j < nFeatures; j++) {
            w[j] -= this.lr * grads[j] / nSamples;
          }
          b -= this.lr * gradB / nSamples;
        }

        this.weights.push(w);
        this.biases.push(b);
      }
    }
  }

  predict(X: number[][]): number[] {
    return X.map((row) => this.predictOne(row));
  }

  predictProba(X: number[][]): number[][] {
    return X.map((row) => this.predictProbaOne(row));
  }

  private predictOne(x: number[]): number {
    const probs = this.predictProbaOne(x);
    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }
    return maxIdx;
  }

  private predictProbaOne(x: number[]): number[] {
    if (this.numClasses === 2) {
      const z = dotProduct(this.weights[0], x) + this.biases[0];
      const p1 = sigmoid(z);
      return [1 - p1, p1];
    }
    const scores = this.weights.map((w, c) => sigmoid(dotProduct(w, x) + this.biases[c]));
    const sum = scores.reduce((a, b) => a + b, 0);
    return scores.map((s) => s / (sum || 1));
  }

  featureImportance(): { name: string; importance: number }[] {
    const nFeatures = this.weights[0].length;
    const importance = new Array(nFeatures).fill(0);
    for (const w of this.weights) {
      for (let j = 0; j < nFeatures; j++) {
        importance[j] += Math.abs(w[j]);
      }
    }
    const total = importance.reduce((a, b) => a + b, 0) || 1;
    return this.featureNames.map((name, i) => ({
      name,
      importance: importance[i] / total,
    }));
  }
}

// --- Decision Tree ---

interface TreeNode {
  isLeaf: boolean;
  prediction?: number;
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  impurity?: number;
  nSamples?: number;
}

export class DecisionTree {
  root!: TreeNode;
  private maxDepth: number;
  private minSamplesSplit: number;
  private numClasses: number;
  private featureNames: string[];
  private nFeatures: number;
  private _featureImportance: number[];

  constructor(
    numClasses: number,
    featureNames: string[],
    maxDepth = 8,
    minSamplesSplit = 5
  ) {
    this.numClasses = numClasses;
    this.featureNames = featureNames;
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.nFeatures = featureNames.length;
    this._featureImportance = new Array(this.nFeatures).fill(0);
  }

  fit(X: number[][], y: number[]): void {
    const indices = Array.from({ length: X.length }, (_, i) => i);
    this.root = this.buildTree(X, y, indices, 0);
  }

  private buildTree(X: number[][], y: number[], indices: number[], depth: number): TreeNode {
    const labels = indices.map((i) => y[i]);
    const counts = this.countLabels(labels);

    // Pure node or max depth or too few samples
    const nonZero = Object.values(counts).filter((c) => c > 0).length;
    if (nonZero <= 1 || depth >= this.maxDepth || indices.length < this.minSamplesSplit) {
      return { isLeaf: true, prediction: this.majorityLabel(counts), nSamples: indices.length };
    }

    // Find best split
    const best = this.findBestSplit(X, y, indices);

    if (!best || best.giniReduction < 0.001) {
      return { isLeaf: true, prediction: this.majorityLabel(counts), nSamples: indices.length };
    }

    this._featureImportance[best.feature] += best.giniReduction * indices.length;

    const leftIndices: number[] = [];
    const rightIndices: number[] = [];
    for (const i of indices) {
      if (X[i][best.feature] <= best.threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }

    if (leftIndices.length === 0 || rightIndices.length === 0) {
      return { isLeaf: true, prediction: this.majorityLabel(counts), nSamples: indices.length };
    }

    return {
      isLeaf: false,
      feature: best.feature,
      threshold: best.threshold,
      left: this.buildTree(X, y, leftIndices, depth + 1),
      right: this.buildTree(X, y, rightIndices, depth + 1),
      nSamples: indices.length,
    };
  }

  private findBestSplit(
    X: number[][],
    y: number[],
    indices: number[]
  ): { feature: number; threshold: number; giniReduction: number } | null {
    let best: { feature: number; threshold: number; giniReduction: number } | null = null;
    const parentGini = this.gini(indices.map((i) => y[i]));

    // Try each feature
    for (let f = 0; f < this.nFeatures; f++) {
      // Get sorted unique values for this feature
      const values = indices.map((i) => X[i][f]).sort((a, b) => a - b);
      const thresholds = this.candidateThresholds(values);

      for (const threshold of thresholds) {
        const left: number[] = [];
        const right: number[] = [];
        for (const i of indices) {
          if (X[i][f] <= threshold) left.push(y[i]);
          else right.push(y[i]);
        }

        if (left.length === 0 || right.length === 0) continue;

        const n = indices.length;
        const childGini =
          (left.length / n) * this.gini(left) + (right.length / n) * this.gini(right);
        const reduction = parentGini - childGini;

        if (!best || reduction > best.giniReduction) {
          best = { feature: f, threshold, giniReduction: reduction };
        }
      }
    }

    return best;
  }

  private candidateThresholds(sortedValues: number[]): number[] {
    // Use midpoints between consecutive unique values (limit to avoid slow splits)
    const unique = [...new Set(sortedValues)];
    if (unique.length <= 1) return [];
    const thresholds: number[] = [];
    const maxThresholds = 20;
    const step = Math.max(1, Math.floor(unique.length / maxThresholds));
    for (let i = 0; i < unique.length - 1; i += step) {
      thresholds.push((unique[i] + unique[i + 1]) / 2);
    }
    return thresholds;
  }

  private gini(labels: number[]): number {
    if (labels.length === 0) return 0;
    const counts = this.countLabels(labels);
    let sum = 0;
    for (const c of Object.values(counts)) {
      const p = c / labels.length;
      sum += p * p;
    }
    return 1 - sum;
  }

  private countLabels(labels: number[]): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const l of labels) {
      counts[l] = (counts[l] || 0) + 1;
    }
    return counts;
  }

  private majorityLabel(counts: Record<number, number>): number {
    let best = 0;
    let bestCount = -1;
    for (const [label, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestCount = count;
        best = parseInt(label);
      }
    }
    return best;
  }

  predict(X: number[][]): number[] {
    return X.map((row) => this.predictOne(row, this.root));
  }

  predictOne(x: number[], node: TreeNode): number {
    if (node.isLeaf) return node.prediction ?? 0;
    if (x[node.feature!] <= node.threshold!) {
      return this.predictOne(x, node.left!);
    }
    return this.predictOne(x, node.right!);
  }

  featureImportance(): { name: string; importance: number }[] {
    const total = this._featureImportance.reduce((a, b) => a + b, 0) || 1;
    return this.featureNames.map((name, i) => ({
      name,
      importance: this._featureImportance[i] / total,
    }));
  }
}

// --- Random Forest ---

export class RandomForest {
  private trees: DecisionTree[] = [];
  private nEstimators: number;
  private maxDepth: number;
  private numClasses: number;
  private featureNames: string[];
  private _featureImportance: number[];

  constructor(
    numClasses: number,
    featureNames: string[],
    nEstimators = 30,
    maxDepth = 8
  ) {
    this.numClasses = numClasses;
    this.featureNames = featureNames;
    this.nEstimators = nEstimators;
    this.maxDepth = maxDepth;
    this._featureImportance = new Array(featureNames.length).fill(0);
  }

  fit(X: number[][], y: number[], seed = 42, maxTrainingSamples = X.length): void {
    this.trees = [];
    const nSamples = X.length;
    const rng = seededRandom(seed);
    const effectiveSamples = Math.min(nSamples, Math.max(1, maxTrainingSamples));

    // For very large datasets, use a deterministic class-aware subset before
    // bootstrap sampling. Prediction/evaluation still uses the complete test set.
    let baseIndices: number[];
    if (effectiveSamples < nSamples) {
      const byClass = new Map<number, number[]>();
      for (let i = 0; i < nSamples; i++) {
        const bucket = byClass.get(y[i]) ?? [];
        bucket.push(i);
        byClass.set(y[i], bucket);
      }
      baseIndices = [];
      const classes = [...byClass.keys()];
      const perClass = Math.max(1, Math.floor(effectiveSamples / Math.max(1, classes.length)));
      for (const c of classes) {
        const bucket = byClass.get(c)!;
        for (let j = 0; j < Math.min(perClass, bucket.length); j++) {
          const pick = Math.floor((j / Math.max(1, Math.min(perClass, bucket.length))) * bucket.length);
          baseIndices.push(bucket[pick]);
        }
      }
      for (let i = baseIndices.length; i < effectiveSamples; i++) {
        baseIndices.push(Math.floor(rng() * nSamples));
      }
    } else {
      baseIndices = Array.from({ length: nSamples }, (_, i) => i);
    }

    for (let t = 0; t < this.nEstimators; t++) {
      // Bootstrap sampling from the scalable training subset.
      const sampleIndices: number[] = [];
      for (let i = 0; i < effectiveSamples; i++) {
        sampleIndices.push(baseIndices[Math.floor(rng() * baseIndices.length)]);
      }

      const XSample = sampleIndices.map((i) => X[i]);
      const ySample = sampleIndices.map((i) => y[i]);

      const tree = new DecisionTree(
        this.numClasses,
        this.featureNames,
        this.maxDepth,
        2
      );
      tree.fit(XSample, ySample);
      this.trees.push(tree);

      // Accumulate feature importance
      const fi = tree.featureImportance();
      for (let j = 0; j < fi.length; j++) {
        this._featureImportance[j] += fi[j].importance;
      }
    }
  }

  predict(X: number[][]): number[] {
    return X.map((row) => {
      const votes: Record<number, number> = {};
      for (const tree of this.trees) {
        const pred = tree.predictOne(row, tree.root);
        votes[pred] = (votes[pred] || 0) + 1;
      }
      let best = 0;
      let bestCount = -1;
      for (const [label, count] of Object.entries(votes)) {
        if (count > bestCount) {
          bestCount = count;
          best = parseInt(label);
        }
      }
      return best;
    });
  }

  featureImportance(): { name: string; importance: number }[] {
    const total = this._featureImportance.reduce((a, b) => a + b, 0) || 1;
    return this.featureNames.map((name, i) => ({
      name,
      importance: this._featureImportance[i] / total,
    }));
  }
}

// --- Gradient Boosting (lightweight browser implementation) ---

export class GradientBoosting {
  private trees: { tree: DecisionTree; learningRate: number }[] = [];
  private nEstimators: number;
  private maxDepth: number;
  private learningRate: number;
  private numClasses: number;
  private featureNames: string[];
  private _featureImportance: number[];
  private initPrediction: number;

  constructor(
    numClasses: number,
    featureNames: string[],
    nEstimators = 40,
    maxDepth = 4,
    learningRate = 0.3
  ) {
    this.numClasses = numClasses;
    this.featureNames = featureNames;
    this.nEstimators = nEstimators;
    this.maxDepth = maxDepth;
    this.learningRate = learningRate;
    this._featureImportance = new Array(featureNames.length).fill(0);
    this.initPrediction = 0;
  }

  fit(X: number[][], y: number[], seed = 42, maxTrainingSamples = X.length): void {
    this.trees = [];
    const rng = seededRandom(seed);
    const effectiveSamples = Math.min(X.length, Math.max(1, maxTrainingSamples));
    let trainIndices = Array.from({ length: X.length }, (_, i) => i);
    if (effectiveSamples < X.length) {
      trainIndices = [];
      for (let i = 0; i < effectiveSamples; i++) trainIndices.push(Math.floor((i / effectiveSamples) * X.length));
    }
    const trainX = trainIndices.map(i => X[i]);
    const trainY = trainIndices.map(i => y[i]);
    const nSamples = trainX.length;

    // For binary classification, we use logistic loss
    // Initial prediction: log(odds) of positive class
    const posCount = trainY.filter((v) => v === 1).length;
    const negCount = trainY.filter((v) => v === 0).length;
    this.initPrediction = Math.log(posCount / (negCount || 1));

    // Current predictions (log-odds)
    const currentPreds = new Array(nSamples).fill(this.initPrediction);

    for (let iter = 0; iter < this.nEstimators; iter++) {
      // Compute gradients (for logistic loss: gradient = pred - label)
      const gradients = currentPreds.map((p, i) => sigmoid(p) - (trainY[i] === 1 ? 1 : 0));

      // Subsample for speed
      const subsampleRatio = 0.7;
      const subsampleSize = Math.floor(nSamples * subsampleRatio);
      const sampleIndices: number[] = [];
      for (let i = 0; i < subsampleSize; i++) {
        sampleIndices.push(Math.floor(rng() * nSamples));
      }

      const XSample = sampleIndices.map((i) => trainX[i]);
      const yGradient = sampleIndices.map((i) => gradients[i]);

      // Fit tree to negative gradients
      const tree = new DecisionTree(
        this.numClasses,
        this.featureNames,
        this.maxDepth,
        2
      );
      // For regression on gradients, we treat each unique gradient value as a "class"
      // But better: use the tree to predict the gradient directly
      tree.fit(XSample, yGradient.map((g) => this.discretize(g)));

      // Update predictions
      for (let i = 0; i < nSamples; i++) {
        const treePred = tree.predictOne(trainX[i], tree.root);
        currentPreds[i] += this.learningRate * this.undiscretize(treePred, gradients);
      }

      this.trees.push({ tree, learningRate: this.learningRate });

      // Accumulate feature importance
      const fi = tree.featureImportance();
      for (let j = 0; j < fi.length; j++) {
        this._featureImportance[j] += fi[j].importance;
      }
    }
  }

  private discretize(g: number): number {
    // Discretize gradient into bins for decision tree
    if (g < -0.5) return 0;
    if (g < -0.2) return 1;
    if (g < 0) return 2;
    if (g < 0.2) return 3;
    if (g < 0.5) return 4;
    return 5;
  }

  private undiscretize(label: number, allGradients: number[]): number {
    // Convert back to approximate gradient value using the mean of that bin
    const binRanges: number[] = [-0.75, -0.35, -0.1, 0.1, 0.35, 0.75];
    return binRanges[label] ?? 0;
  }

  predict(X: number[][]): number[] {
    return X.map((row) => {
      let logit = this.initPrediction;
      for (const { tree, learningRate } of this.trees) {
        const treePred = tree.predictOne(row, tree.root);
        logit += learningRate * this.undiscretize(treePred, []);
      }
      return sigmoid(logit) > 0.5 ? 1 : 0;
    });
  }

  predictProba(X: number[][]): number[][] {
    return X.map((row) => {
      let logit = this.initPrediction;
      for (const { tree, learningRate } of this.trees) {
        const treePred = tree.predictOne(row, tree.root);
        logit += learningRate * this.undiscretize(treePred, []);
      }
      const p1 = sigmoid(logit);
      return [1 - p1, p1];
    });
  }

  featureImportance(): { name: string; importance: number }[] {
    const total = this._featureImportance.reduce((a, b) => a + b, 0) || 1;
    return this.featureNames.map((name, i) => ({
      name,
      importance: this._featureImportance[i] / total,
    }));
  }
}

// --- Utilities ---

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function sigmoid(x: number): number {
  if (x < -500) return 0;
  if (x > 500) return 1;
  return 1 / (1 + Math.exp(-x));
}

// --- Regression models ---

interface RegressionNode {
  feature: number;
  threshold: number;
  left: RegressionNode | null;
  right: RegressionNode | null;
  value: number;
  isLeaf: boolean;
}

class RegressionTree {
  root: RegressionNode | null = null;
  private maxDepth: number;
  private minSamples: number;
  private featureNames: string[];
  private _importance: number[];

  constructor(featureNames: string[], maxDepth = 6, minSamples = 2) {
    this.featureNames = featureNames;
    this.maxDepth = maxDepth;
    this.minSamples = minSamples;
    this._importance = new Array(featureNames.length).fill(0);
  }

  fit(X: number[][], y: number[]): void {
    this.root = this.build(X, y, 0);
  }

  private build(X: number[][], y: number[], depth: number): RegressionNode {
    const mean = y.reduce((a,b)=>a+b,0)/Math.max(1,y.length);
    if (depth >= this.maxDepth || y.length < this.minSamples * 2 || this.variance(y) < 1e-12) {
      return {feature:-1,threshold:0,left:null,right:null,value:mean,isLeaf:true};
    }
    const split = this.bestSplit(X,y);
    if (!split) return {feature:-1,threshold:0,left:null,right:null,value:mean,isLeaf:true};
    const leftX:number[][]=[], rightX:number[][]=[], leftY:number[]=[], rightY:number[]=[];
    for(let i=0;i<X.length;i++) {
      if(X[i][split.feature] <= split.threshold){leftX.push(X[i]);leftY.push(y[i]);}
      else {rightX.push(X[i]);rightY.push(y[i]);}
    }
    if(!leftY.length || !rightY.length) return {feature:-1,threshold:0,left:null,right:null,value:mean,isLeaf:true};
    this._importance[split.feature] += split.gain * y.length;
    return {feature:split.feature,threshold:split.threshold,left:this.build(leftX,leftY,depth+1),right:this.build(rightX,rightY,depth+1),value:mean,isLeaf:false};
  }

  private variance(y:number[]):number {
    if(!y.length) return 0;
    const m=y.reduce((a,b)=>a+b,0)/y.length;
    return y.reduce((s,v)=>s+(v-m)**2,0)/y.length;
  }

  private bestSplit(X:number[][], y:number[]):{feature:number;threshold:number;gain:number}|null {
    const parent=this.variance(y)*y.length;
    let best:{feature:number;threshold:number;gain:number}|null=null;
    for(let f=0;f<this.featureNames.length;f++){
      const values=[...new Set(X.map(r=>r[f]))].sort((a,b)=>a-b);
      if(values.length<2 || values.length>64) continue;
      for(let i=1;i<values.length;i++){
        const t=(values[i-1]+values[i])/2;
        const ly:number[]=[], ry:number[]=[];
        for(let r=0;r<X.length;r++) (X[r][f]<=t?ly:ry).push(y[r]);
        if(ly.length<this.minSamples || ry.length<this.minSamples) continue;
        const gain=parent-this.variance(ly)*ly.length-this.variance(ry)*ry.length;
        if(!best || gain>best.gain) best={feature:f,threshold:t,gain};
      }
    }
    return best && best.gain>1e-12 ? best : null;
  }

  predict(X:number[][]):number[]{ return X.map(r=>this.predictOne(r)); }
  predictOne(row:number[]):number {
    let n=this.root;
    while(n && !n.isLeaf) n=row[n.feature] <= n.threshold ? n.left : n.right;
    return n?.value ?? 0;
  }
  featureImportance():{name:string;importance:number}[]{
    const total=this._importance.reduce((a,b)=>a+b,0)||1;
    return this.featureNames.map((name,i)=>({name,importance:this._importance[i]/total}));
  }
}

export class LinearRegression {
  private weights:number[]=[];
  private bias=0;
  private featureNames:string[];
  constructor(featureNames:string[]){this.featureNames=featureNames;}
  fit(X:number[][],y:number[]):void{
    const p=this.featureNames.length; this.weights=new Array(p).fill(0); this.bias=y.reduce((a,b)=>a+b,0)/Math.max(1,y.length);
    const lr=0.03, epochs=Math.min(1200,Math.max(250,Math.floor(200000/Math.max(1,y.length))));
    for(let e=0;e<epochs;e++){
      const grad=new Array(p).fill(0); let gb=0;
      for(let i=0;i<X.length;i++){let pred=this.bias;for(let j=0;j<p;j++)pred+=this.weights[j]*X[i][j];const err=pred-y[i];gb+=err;for(let j=0;j<p;j++)grad[j]+=err*X[i][j];}
      const scale=2/Math.max(1,X.length); this.bias-=lr*gb*scale; for(let j=0;j<p;j++)this.weights[j]-=lr*grad[j]*scale;
    }
  }
  predict(X:number[][]):number[]{return X.map(r=>this.bias+this.weights.reduce((s,w,j)=>s+w*r[j],0));}
  featureImportance(){const a=this.weights.map(Math.abs);const total=a.reduce((x,y)=>x+y,0)||1;return this.featureNames.map((name,i)=>({name,importance:a[i]/total}));}
}

export class RandomForestRegressor {
  private trees:RegressionTree[]=[]; private featureNames:string[]; private nEstimators:number; private maxDepth:number;
  constructor(featureNames:string[],nEstimators=30,maxDepth=8){this.featureNames=featureNames;this.nEstimators=nEstimators;this.maxDepth=maxDepth;}
  fit(X:number[][],y:number[],seed=42,maxTrainingSamples=X.length):void{
    this.trees=[]; const rng=seededRandom(seed);
    const n=Math.min(X.length,Math.max(1,maxTrainingSamples));
    const base= n < X.length ? Array.from({length:n},(_,i)=>Math.floor((i/n)*X.length)) : Array.from({length:X.length},(_,i)=>i);
    for(let t=0;t<this.nEstimators;t++){const sx:number[][]=[],sy:number[]=[];for(let i=0;i<n;i++){const k=base[Math.floor(rng()*base.length)];sx.push(X[k]);sy.push(y[k]);}const tree=new RegressionTree(this.featureNames,this.maxDepth,2);tree.fit(sx,sy);this.trees.push(tree);}
  }
  predict(X:number[][]):number[]{return X.map(r=>this.trees.reduce((s,t)=>s+t.predictOne(r),0)/Math.max(1,this.trees.length));}
  featureImportance(){const raw=this.featureNames.map((name,i)=>({name,importance:this.trees.reduce((s,t)=>s+t.featureImportance()[i].importance,0)/Math.max(1,this.trees.length)}));const total=raw.reduce((s,x)=>s+x.importance,0)||1;return raw.map(x=>({...x,importance:x.importance/total}));}
}

export class GradientBoostingRegressor {
  private trees:{tree:RegressionTree;rate:number}[]=[]; private base=0; private featureNames:string[]; private nEstimators:number; private maxDepth:number; private learningRate:number;
  constructor(featureNames:string[],nEstimators=40,maxDepth=3,learningRate=0.03){this.featureNames=featureNames;this.nEstimators=nEstimators;this.maxDepth=maxDepth;this.learningRate=learningRate;}
  fit(X:number[][],y:number[],seed=42,maxTrainingSamples=X.length):void{
    const n=Math.min(X.length,Math.max(1,maxTrainingSamples));
    const idx=n < X.length ? Array.from({length:n},(_,i)=>Math.floor((i/n)*X.length)) : Array.from({length:X.length},(_,i)=>i);
    X=idx.map(i=>X[i]); y=idx.map(i=>y[i]);
    this.trees=[];this.base=y.reduce((a,b)=>a+b,0)/Math.max(1,y.length);let pred=new Array(y.length).fill(this.base);
    for(let t=0;t<this.nEstimators;t++){
      const residual=y.map((v,i)=>v-pred[i]);
      const mean=residual.reduce((a,b)=>a+b,0)/Math.max(1,residual.length);
      const scale=Math.sqrt(residual.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,residual.length))||1;
      const clipped=residual.map(v=>Math.max(-3*scale,Math.min(3*scale,v)));
      const tree=new RegressionTree(this.featureNames,Math.min(this.maxDepth,3),2);
      tree.fit(X,clipped);
      for(let i=0;i<pred.length;i++){const delta=Math.max(-3*scale,Math.min(3*scale,tree.predictOne(X[i])));pred[i]+=this.learningRate*delta;}
      this.trees.push({tree,rate:this.learningRate});
    }
  }
  predict(X:number[][]):number[]{return X.map(r=>this.base+this.trees.reduce((s,t)=>s+t.rate*t.tree.predictOne(r),0));}
  featureImportance(){const raw=this.featureNames.map((name,i)=>({name,importance:this.trees.reduce((s,t)=>s+t.tree.featureImportance()[i].importance,0)/Math.max(1,this.trees.length)}));const total=raw.reduce((s,x)=>s+x.importance,0)||1;return raw.map(x=>({...x,importance:x.importance/total}));}
}
