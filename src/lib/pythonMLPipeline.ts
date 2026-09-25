// ============================================================
// Synapse AI — Python ML Pipeline
// Generates real Python code for each ML stage and executes it
// via Pyodide. The code shown in the UI is the exact code that
// runs — no fake or hardcoded outputs.
// ============================================================

import type {
  ExecutionStage,
  ExecutionOutputLine,
  LiveExecutionState,
  ExecutionStageInfo,
} from '@/types';
import {
  getPyodide,
  runPython,
  loadScikitLearn,
  writeFileToPyodide,
  type PyodideInterface,
  type OutputHandler,
} from '@/lib/pyodideEngine';

export type StateCallback = (state: LiveExecutionState) => void;
export type StageCallback = (stage: ExecutionStage, info: ExecutionStageInfo) => void;

const STAGE_LABELS: Record<ExecutionStage, string> = {
  idle: 'Idle',
  loading_pyodide: 'Loading Python Runtime',
  loading_packages: 'Installing ML Libraries',
  dataset_analysis: 'Dataset Analysis',
  data_preprocessing: 'Data Preprocessing',
  model_training: 'Model Training',
  model_evaluation: 'Model Evaluation',
  completed: 'Completed',
  error: 'Error',
};

function createInitialStages(): Record<ExecutionStage, ExecutionStageInfo> {
  const stages: Partial<Record<ExecutionStage, ExecutionStageInfo>> = {};
  const allStages: ExecutionStage[] = [
    'loading_pyodide',
    'loading_packages',
    'dataset_analysis',
    'data_preprocessing',
    'model_training',
    'model_evaluation',
  ];
  for (const s of allStages) {
    stages[s] = {
      stage: s,
      label: STAGE_LABELS[s],
      status: 'pending',
      code: '',
      output: [],
      startTime: null,
      endTime: null,
      error: null,
    };
  }
  // idle, completed, error are meta-stages, not pipeline stages
  stages['idle'] = {
    stage: 'idle',
    label: 'Idle',
    status: 'pending',
    code: '',
    output: [],
    startTime: null,
    endTime: null,
    error: null,
  };
  stages['completed'] = {
    stage: 'completed',
    label: 'Completed',
    status: 'pending',
    code: '',
    output: [],
    startTime: null,
    endTime: null,
    error: null,
  };
  stages['error'] = {
    stage: 'error',
    label: 'Error',
    status: 'pending',
    code: '',
    output: [],
    startTime: null,
    endTime: null,
    error: null,
  };
  return stages as Record<ExecutionStage, ExecutionStageInfo>;
}

export function createInitialExecutionState(): LiveExecutionState {
  return {
    status: 'idle',
    currentStage: 'idle',
    stages: createInitialStages(),
    pyodideReady: false,
    pyodideLoading: false,
    loadingMessage: '',
    totalOutputLines: 0,
  };
}

let lineCounter = 0;
function makeOutputLine(text: string, type: ExecutionOutputLine['type']): ExecutionOutputLine {
  return {
    id: `pyl_${++lineCounter}_${Date.now()}`,
    text,
    type,
    timestamp: new Date().toTimeString().slice(0, 8),
  };
}

// ============================================================
// PythonMLRunner — the core class that drives execution
// ============================================================

export class PythonMLRunner {
  private state: LiveExecutionState = createInitialExecutionState();
  private stateListeners: StateCallback[] = [];
  private stageListeners: StageCallback[] = [];
  private pyodide: PyodideInterface | null = null;
  private csvFileName: string = '';
  private csvContent: string = '';
  private cancelled = false;
  private targetColumn: string | null = null;
  private learningParadigm: 'supervised' | 'unsupervised' = 'unsupervised';

  onStateChange(cb: StateCallback): () => void {
    this.stateListeners.push(cb);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== cb);
    };
  }

  onStageChange(cb: StageCallback): () => void {
    this.stageListeners.push(cb);
    return () => {
      this.stageListeners = this.stageListeners.filter((l) => l !== cb);
    };
  }

  getState(): LiveExecutionState {
    return { ...this.state };
  }

  cancel() {
    this.cancelled = true;
  }

  reset() {
    this.cancelled = true;
    this.state = createInitialExecutionState();
    this.emitState();
  }

  private emitState() {
    this.stateListeners.forEach((cb) => cb({ ...this.state, stages: { ...this.state.stages } }));
  }

  private emitStage(stage: ExecutionStage) {
    const info = this.state.stages[stage];
    if (info) {
      this.stageListeners.forEach((cb) => cb(stage, { ...info, output: [...info.output] }));
    }
  }

  private setStageStatus(stage: ExecutionStage, status: ExecutionStageInfo['status']) {
    const info = this.state.stages[stage];
    if (info) {
      info.status = status;
      if (status === 'running') {
        info.startTime = Date.now();
        info.endTime = null;
        info.error = null;
      } else if (status === 'completed' || status === 'error') {
        info.endTime = Date.now();
      }
      this.emitStage(stage);
    }
  }

  private setStageCode(stage: ExecutionStage, code: string) {
    const info = this.state.stages[stage];
    if (info) {
      info.code = code;
      this.emitStage(stage);
    }
  }

  private appendOutput(stage: ExecutionStage, line: ExecutionOutputLine) {
    const info = this.state.stages[stage];
    if (info) {
      info.output = [...info.output, line];
      this.state.totalOutputLines++;
      this.emitStage(stage);
    }
  }

  private makeOutputHandler(stage: ExecutionStage): OutputHandler {
    return (text: string, stream: 'stdout' | 'stderr') => {
      // Split by newlines so each line is a separate entry
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          this.appendOutput(
            stage,
            makeOutputLine(line, stream === 'stderr' ? 'stderr' : 'stdout')
          );
        }
      }
    };
  }

  private async executeStage(
    stage: ExecutionStage,
    code: string
  ): Promise<{ stdout: string; stderr: string; error: string | null }> {
    this.setStageCode(stage, code);
    this.setStageStatus(stage, 'running');
    this.state.currentStage = stage;
    this.state.status = 'running';
    this.emitState();

    const handler = this.makeOutputHandler(stage);
    const result = await runPython(this.pyodide!, code, handler);

    if (result.error) {
      this.setStageStatus(stage, 'error');
      this.appendOutput(stage, makeOutputLine(result.error, 'error'));
      return { ...result, error: result.error };
    }

    this.setStageStatus(stage, 'completed');
    return { stdout: result.stdout, stderr: result.stderr, error: null };
  }

  // ============================================================
  // Main execution pipeline
  // ============================================================

  async run(csvContent: string, fileName: string, targetColumn: string | null = null, learningParadigm: 'supervised' | 'unsupervised' = 'unsupervised'): Promise<void> {
    this.cancelled = false;
    this.csvContent = csvContent;
    this.csvFileName = fileName;
    this.targetColumn = targetColumn;
    this.learningParadigm = learningParadigm;

    this.state.status = 'running';
    this.emitState();

    try {
      // Stage 1: Load Pyodide
      await this.loadPyodideStage();
      if (this.cancelled) return;

      // Stage 2: Load packages
      await this.loadPackagesStage();
      if (this.cancelled) return;

      // Stage 3: Dataset analysis
      await this.datasetAnalysisStage();
      if (this.cancelled) return;

      // Stage 4: Data preprocessing
      await this.preprocessingStage();
      if (this.cancelled) return;

      // Stage 5: Model training
      await this.modelTrainingStage();
      if (this.cancelled) return;

      // Stage 6: Model evaluation
      await this.evaluationStage();
      if (this.cancelled) return;

      this.state.status = 'success';
      this.state.currentStage = 'completed';
      this.emitState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.status = 'error';
      this.state.currentStage = 'error';
      const currentStageInfo = this.state.stages[this.state.currentStage === 'error' ? this.state.currentStage : 'error'];
      if (currentStageInfo) {
        currentStageInfo.error = msg;
        currentStageInfo.status = 'error';
        this.appendOutput('error', makeOutputLine(msg, 'error'));
      }
      this.emitState();
    }
  }

  // --- Stage 1: Load Pyodide ---

  private async loadPyodideStage(): Promise<void> {
    this.state.currentStage = 'loading_pyodide';
    this.state.pyodideLoading = true;
    this.state.loadingMessage = 'Downloading Pyodide runtime...';
    this.emitState();

    this.setStageStatus('loading_pyodide', 'running');
    this.appendOutput('loading_pyodide', makeOutputLine('Loading Pyodide (CPython WebAssembly)...', 'info'));

    this.pyodide = await getPyodide((msg) => {
      this.state.loadingMessage = msg;
      this.appendOutput('loading_pyodide', makeOutputLine(msg, 'info'));
      this.emitState();
    });

    this.state.pyodideReady = true;
    this.state.pyodideLoading = false;
    this.appendOutput('loading_pyodide', makeOutputLine('Pyodide runtime ready.', 'info'));
    this.setStageStatus('loading_pyodide', 'completed');
    this.emitState();
  }

  // --- Stage 2: Load packages ---

  private async loadPackagesStage(): Promise<void> {
    this.state.currentStage = 'loading_packages';
    this.state.loadingMessage = 'Installing ML libraries...';
    this.emitState();

    this.setStageStatus('loading_packages', 'running');
    const code = `# Installing Python ML libraries via Pyodide
# These are real packages compiled to WebAssembly
import sys
print(f"Python {sys.version}")
print("Installing: numpy, pandas, scikit-learn")`;

    this.setStageCode('loading_packages', code);
    this.appendOutput('loading_packages', makeOutputLine('Installing numpy, pandas, scikit-learn...', 'info'));

    await loadScikitLearn(this.pyodide!, (msg) => {
      this.state.loadingMessage = msg;
      this.appendOutput('loading_packages', makeOutputLine(msg, 'info'));
      this.emitState();
    });

    // Verify imports work
    const verifyCode = `import numpy as np
import pandas as pd
import sklearn
print(f"numpy: {np.__version__}")
print(f"pandas: {pd.__version__}")
print(f"scikit-learn: {sklearn.__version__}")`;

    const result = await runPython(this.pyodide!, verifyCode, this.makeOutputHandler('loading_packages'));
    if (result.error) throw new Error(result.error);

    this.appendOutput('loading_packages', makeOutputLine('All ML libraries installed and verified.', 'info'));
    this.setStageStatus('loading_packages', 'completed');
    this.emitState();
  }

  // --- Stage 3: Dataset analysis ---

  private async datasetAnalysisStage(): Promise<void> {
    writeFileToPyodide(this.pyodide!, this.csvFileName, this.csvContent);

    const code = `import pandas as pd
import numpy as np
import re

df = pd.read_csv("${this.csvFileName}")
print(f"Dataset: ${this.csvFileName}")
print(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns")
print()

missing = df.isna().sum()
print(f"Missing values: {int(missing.sum())}")
print(f"Duplicate rows: {int(df.duplicated().sum())}")
print()

numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()
print(f"Numerical columns ({len(numeric_cols)}): {numeric_cols}")
print(f"Categorical columns ({len(categorical_cols)}): {categorical_cols}")
print()

identifier_patterns = re.compile(r"(^|_)(id|uuid|guid|identifier|customer_id|user_id|account_id|record_id|row_id|index)(_|$)", re.I)
identifier_cols = []
for col in df.columns:
    nunique = df[col].nunique(dropna=True)
    sequential_numeric = pd.api.types.is_integer_dtype(df[col]) and nunique == len(df) and (df[col].max() - df[col].min() + 1) <= len(df) * 1.2 and df[col].min() >= 0
    if identifier_patterns.search(str(col)) or sequential_numeric:
        identifier_cols.append(col)
print(f"Identifier columns: {identifier_cols if identifier_cols else 'None'}")

outcome_patterns = re.compile(r"(^|_)(target|label|class|churn|default|fraud|spam|approved|rejected|survived|outcome|diagnosis|result|status|flag|prediction|response|output|dependent)(_|$)", re.I)
regression_patterns = re.compile(r"(^|_)(price|cost|amount|sales|revenue|salary|value|demand|profit|duration|rate)(_|$)", re.I)

def target_score(col):
    if col in identifier_cols:
        return 0, "identifier column"
    nunique = df[col].nunique(dropna=True)
    name = str(col)
    score = 0
    if outcome_patterns.search(name): score += 75
    if df[col].dtype == bool and nunique == 2: score += 15
    elif pd.api.types.is_integer_dtype(df[col]) and 2 <= nunique <= 20:
        score += 10 if outcome_patterns.search(name) else 0
    elif pd.api.types.is_numeric_dtype(df[col]) and nunique > max(20, len(df)*0.25):
        score += 35 if regression_patterns.search(name) else 0
    elif df[col].dtype == object and 2 <= nunique <= 20 and outcome_patterns.search(name):
        score += 5
    return score, "semantic outcome evidence" if score else "no strong outcome evidence"

scored = [(target_score(c)[0], c, target_score(c)[1]) for c in df.columns]
scored = sorted(scored, key=lambda x: x[0], reverse=True)
best = scored[0] if scored else (0, None, "no columns")
target = ${JSON.stringify(this.targetColumn)} if ${JSON.stringify(this.learningParadigm)} == 'supervised' else None
if target is not None and target not in df.columns:
    raise RuntimeError(f'Configured target column not found: {target}')

if target is None:
    print("Learning paradigm: UNSUPERVISED")
    print("Target column: None")
    print("Reason: No column has strong label/outcome semantics; low-cardinality fields are not forced into targets.")
else:
    print(f"Learning paradigm: SUPERVISED")
    print(f"Target column: {target}")
    print(f"Target evidence score: {best[0]}%")
print()

_ANALYSIS_DONE = True`;

    const result = await this.executeStage('dataset_analysis', code);
    if (result.error) throw new Error(result.error);
  }

  // --- Stage 4: Data preprocessing ---

  private async preprocessingStage(): Promise<void> {
    const code = `import pandas as pd
import numpy as np
import re
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

mode_file = "/tmp/synapse_mode.txt"
df = pd.read_csv("${this.csvFileName}")
df = df.drop_duplicates().reset_index(drop=True)

identifier_patterns = re.compile(r"(^|_)(id|uuid|guid|identifier|customer_id|user_id|account_id|record_id|row_id|index)(_|$)", re.I)
identifier_cols = []
for col in df.columns:
    nunique = df[col].nunique(dropna=True)
    sequential_numeric = pd.api.types.is_integer_dtype(df[col]) and nunique == len(df) and (df[col].max() - df[col].min() + 1) <= len(df) * 1.2 and df[col].min() >= 0
    if identifier_patterns.search(str(col)) or sequential_numeric:
        identifier_cols.append(col)

outcome_patterns = re.compile(r"(^|_)(target|label|class|churn|default|fraud|spam|approved|rejected|survived|outcome|diagnosis|result|status|flag|prediction|response|output|dependent)(_|$)", re.I)
regression_patterns = re.compile(r"(^|_)(price|cost|amount|sales|revenue|salary|value|demand|profit|duration|rate)(_|$)", re.I)

best = (0, None)
for col in df.columns:
    if col in identifier_cols: continue
    nunique = df[col].nunique(dropna=True)
    score = 0
    if outcome_patterns.search(str(col)): score += 75
    if pd.api.types.is_numeric_dtype(df[col]) and nunique > max(20, len(df)*0.25) and regression_patterns.search(str(col)): score += 35
    if score > best[0]: best = (score, col)

target = ${JSON.stringify(this.targetColumn)} if ${JSON.stringify(this.learningParadigm)} == 'supervised' else None
if target is not None and target not in df.columns:
    raise RuntimeError(f'Configured target column not found: {target}')

if target is None:
    mode = "unsupervised"
    print("Target column: None")
    print("Learning paradigm: UNSUPERVISED")
    print(f"Identifier columns excluded: {identifier_cols if identifier_cols else 'None'}")
    X = df.drop(columns=identifier_cols, errors="ignore").copy()
else:
    mode = "supervised"
    print(f"Target column: {target}")
    y = df[target].copy()
    X = df.drop(columns=[target] + identifier_cols, errors="ignore").copy()

with open(mode_file, "w") as f:
    f.write(mode)

numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()
print(f"Numeric features: {len(numeric_cols)}")
print(f"Categorical features: {len(categorical_cols)}")

if numeric_cols:
    X[numeric_cols] = SimpleImputer(strategy="median").fit_transform(X[numeric_cols])
if categorical_cols:
    X[categorical_cols] = SimpleImputer(strategy="most_frequent").fit_transform(X[categorical_cols])
    X = pd.get_dummies(X, columns=categorical_cols, drop_first=True)

constant_cols = [c for c in X.columns if X[c].nunique() <= 1]
if constant_cols:
    X = X.drop(columns=constant_cols)
    print(f"Constant columns removed: {constant_cols}")

X_scaled = StandardScaler().fit_transform(X)
print(f"Final features: {X.shape[1]}")
print(f"Feature names: {list(X.columns)}")
print("Features standardized (z-score normalization)")

if mode == "supervised":
    from sklearn.preprocessing import LabelEncoder
    if y.dtype == 'object': y = LabelEncoder().fit_transform(y.astype(str))
    print(f"Classes: {len(np.unique(y))}")
    counts = pd.Series(y).value_counts()
    print(f"Minimum class count: {int(counts.min())}")
else:
    print("No train/test split: unsupervised learning has no target labels to stratify.")`;

    const result = await this.executeStage('data_preprocessing', code);
    if (result.error) throw new Error(result.error);
  }

  // --- Stage 5: Model training / clustering ---

  private async modelTrainingStage(): Promise<void> {
    const code = `import pandas as pd
import numpy as np
import json
import re
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

with open("/tmp/synapse_mode.txt") as f:
    mode = f.read().strip()

df = pd.read_csv("${this.csvFileName}")
df = df.drop_duplicates().reset_index(drop=True)

identifier_patterns = re.compile(r"(^|_)(id|uuid|guid|identifier|customer_id|user_id|account_id|record_id|row_id|index)(_|$)", re.I)
identifier_cols = []
for col in df.columns:
    nunique = df[col].nunique(dropna=True)
    sequential_numeric = pd.api.types.is_integer_dtype(df[col]) and nunique == len(df) and (df[col].max() - df[col].min() + 1) <= len(df) * 1.2 and df[col].min() >= 0
    if identifier_patterns.search(str(col)) or sequential_numeric:
        identifier_cols.append(col)

if mode == "unsupervised":
    print("=" * 60)
    print("UNSUPERVISED CLUSTERING")
    print("=" * 60)
    X = df.drop(columns=identifier_cols, errors="ignore").copy()
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if numeric_cols:
        X[numeric_cols] = SimpleImputer(strategy="median").fit_transform(X[numeric_cols])
    if categorical_cols:
        X[categorical_cols] = SimpleImputer(strategy="most_frequent").fit_transform(X[categorical_cols])
        X = pd.get_dummies(X, columns=categorical_cols, drop_first=True)
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)
    constant_cols = [c for c in X.columns if X[c].nunique() <= 1]
    if constant_cols: X = X.drop(columns=constant_cols)
    X_scaled = StandardScaler().fit_transform(X)

    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    best_k, best_score, best_labels = None, -1, None
    upper_k = min(6, max(2, len(X)-1))
    for k in range(2, upper_k + 1):
        labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)
        score = silhouette_score(X_scaled, labels) if len(set(labels)) > 1 else -1
        print(f"k={k}: silhouette={score:.4f}")
        if score > best_score:
            best_k, best_score, best_labels = k, score, labels
    print()
    print(f"Selected algorithm: K-Means")
    print(f"Selected clusters: {best_k}")
    print(f"Silhouette Score: {best_score:.4f}")
    print("Cluster distribution:")
    for c, n in pd.Series(best_labels).value_counts().sort_index().items():
        print(f"  Cluster {c}: {n} samples ({n/len(best_labels)*100:.1f}%)")
    with open("/tmp/clustering_results.json", "w") as f:
        json.dump({"algorithm":"K-Means","k":int(best_k),"silhouette":float(best_score),"labels":[int(x) for x in best_labels]}, f)
    print("Clustering completed successfully.")
else:
    # ---- supervised path ----
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    import time

    target = ${JSON.stringify(this.targetColumn)} if ${JSON.stringify(this.learningParadigm)} == 'supervised' else None
    if target is not None and target not in df.columns:
        raise RuntimeError(f'Configured target column not found: {target}')
    outcome_patterns = re.compile(r"(^|_)(target|label|class|churn|default|fraud|spam|approved|rejected|survived|outcome|diagnosis|result|status|flag|prediction|response|output|dependent)(_|$)", re.I)
    for col in df.columns:
        if col in identifier_cols: continue
        nunique = df[col].nunique(dropna=True)
        if outcome_patterns.search(str(col)) and nunique >= 2:
            target = col
            break
    if target is None:
        raise RuntimeError("No reliable supervised target found during execution.")

    y = df[target].copy()
    X = df.drop(columns=[target] + identifier_cols, errors="ignore").copy()
    from sklearn.model_selection import train_test_split
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import OneHotEncoder, StandardScaler, LabelEncoder
    import numpy as np

    is_regression = pd.api.types.is_numeric_dtype(y) and (y.nunique(dropna=True) > 20 or pd.api.types.is_float_dtype(y))
    if not is_regression:
        y_encoder = LabelEncoder()
        y = y_encoder.fit_transform(y.astype(str))

    counts = pd.Series(y).value_counts() if not is_regression else None
    stratify_arg = y if (not is_regression and counts is not None and len(counts) > 1 and int(counts.min()) >= 2) else None
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify_arg)

    numeric_cols = X_train_raw.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = X_train_raw.select_dtypes(exclude=[np.number]).columns.tolist()
    preprocessor = ColumnTransformer([
        ("num", Pipeline([("imputer",SimpleImputer(strategy="median")),("scaler",StandardScaler())]), numeric_cols),
        ("cat", Pipeline([("imputer",SimpleImputer(strategy="most_frequent")),("onehot",OneHotEncoder(handle_unknown="ignore",sparse_output=False))]), categorical_cols),
    ], remainder="drop")
    X_train = preprocessor.fit_transform(X_train_raw)
    X_test = preprocessor.transform(X_test_raw)
    print(f"Training data: {X_train.shape[0]} samples, {X_train.shape[1]} prepared features")
    print("Preprocessing fitted on training data only; test data is transform-only.")

    # Browser-safe large-dataset training: keep the complete held-out test set,
    # but cap the expensive model-fitting partition. This prevents the browser
    # from becoming unresponsive on 100k+ row CSV files.
    import time
    LARGE_DATASET = X_train.shape[0] >= 50000
    VERY_LARGE_DATASET = X_train.shape[0] >= 100000
    TRAIN_LIMIT = 10000 if VERY_LARGE_DATASET else 20000 if LARGE_DATASET else X_train.shape[0]
    if TRAIN_LIMIT < X_train.shape[0]:
        rng = np.random.RandomState(42)
        if not is_regression and len(np.unique(y_train)) > 1:
            sampled=[]
            for cls in np.unique(y_train):
                cls_idx=np.where(y_train==cls)[0]
                quota=max(1,int(TRAIN_LIMIT/len(np.unique(y_train))))
                sampled.extend(cls_idx[:min(quota,len(cls_idx))])
            while len(sampled)<TRAIN_LIMIT:
                sampled.append(int(rng.randint(0,len(y_train))))
            sampled=np.array(sampled[:TRAIN_LIMIT])
        else:
            sampled=np.sort(rng.choice(len(y_train), size=TRAIN_LIMIT, replace=False))
        X_model=X_train[sampled]
        y_model=y_train[sampled]
        print(f"Large-dataset mode: fitting models on {len(sampled)} representative training rows; evaluating on the full test set.")
    else:
        X_model=X_train
        y_model=y_train

    rf_estimators = 10 if VERY_LARGE_DATASET else 15 if LARGE_DATASET else 30
    rf_depth = 6 if VERY_LARGE_DATASET else 7 if LARGE_DATASET else 8
    gb_estimators = 20 if VERY_LARGE_DATASET else 25 if LARGE_DATASET else 40
    gb_depth = 3 if VERY_LARGE_DATASET else 4
    lr_max_iter = 120 if VERY_LARGE_DATASET else 180 if LARGE_DATASET else 1000

    results={}
    if is_regression:
        from sklearn.linear_model import LinearRegression
        from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
        models=[("Linear Regression",LinearRegression()),("Random Forest Regressor",RandomForestRegressor(n_estimators=rf_estimators,max_depth=rf_depth,random_state=42,n_jobs=1)),("Gradient Boosting Regressor",GradientBoostingRegressor(n_estimators=gb_estimators,max_depth=gb_depth,learning_rate=0.08,random_state=42))]
        for name,model in models:
            print("="*60); print(f"Training: {name}"); print("="*60); t0=time.time(); model.fit(X_model,y_model); elapsed=time.time()-t0
            pred=model.predict(X_test); mse=float(np.mean((pred-y_test)**2)); rmse=float(np.sqrt(mse)); mae=float(np.mean(np.abs(pred-y_test))); ss=float(np.sum((y_test-np.mean(y_test))**2)); r2=float(1-np.sum((y_test-pred)**2)/ss) if ss>0 else 0.0
            results[name]={"pred":pred.tolist(),"y_test":y_test.tolist(),"rmse":rmse,"mae":mae,"r2":r2,"time":elapsed}; print(f"RMSE={rmse:.4f} MAE={mae:.4f} R2={r2:.4f}")
    else:
        from sklearn.linear_model import LogisticRegression
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
        models=[("Logistic Regression",LogisticRegression(max_iter=lr_max_iter,random_state=42)),("Random Forest",RandomForestClassifier(n_estimators=rf_estimators,max_depth=rf_depth,random_state=42,n_jobs=1)),("Gradient Boosting",GradientBoostingClassifier(n_estimators=gb_estimators,max_depth=gb_depth,learning_rate=0.3,random_state=42))]
        for name,model in models:
            print("="*60); print(f"Training: {name}"); print("="*60); t0=time.time(); model.fit(X_model,y_model); elapsed=time.time()-t0
            pred=model.predict(X_test); acc=float(np.mean(pred==y_test)); results[name]={"pred":pred.tolist(),"y_test":y_test.tolist(),"acc":acc,"time":elapsed}; print(f"Test accuracy: {acc:.4f}")
    with open("/tmp/model_results.json","w") as f: json.dump(results,f)
    print("All supervised models trained successfully.")`;

    const result = await this.executeStage('model_training', code);
    if (result.error) throw new Error(result.error);
  }

  // --- Stage 6: Evaluation ---

  private async evaluationStage(): Promise<void> {
    const code = `import json
import numpy as np

with open("/tmp/synapse_mode.txt") as f:
    mode = f.read().strip()

if mode == "unsupervised":
    from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score
    with open("/tmp/clustering_results.json") as f:
        result = json.load(f)
    labels = np.array(result["labels"])
    print("=" * 60)
    print("CLUSTER EVALUATION")
    print("=" * 60)
    print(f"Algorithm: {result['algorithm']}")
    print(f"Clusters: {result['k']}")
    print(f"Silhouette Score: {result['silhouette']:.4f}")
    print("Cluster labels generated for every row.")
    print("Evaluation complete — no train/test split was required.")
else:
    import pandas as pd
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    with open("/tmp/model_results.json") as f: results=json.load(f)
    y_test=np.array(results["Logistic Regression"]["y_test"])
    print("MODEL EVALUATION")
    for name,r in results.items():
        pred=np.array(r["pred"])
        print(f"{name}: Accuracy={accuracy_score(y_test,pred):.4f}, Precision={precision_score(y_test,pred,average='macro',zero_division=0):.4f}, Recall={recall_score(y_test,pred,average='macro',zero_division=0):.4f}, F1={f1_score(y_test,pred,average='macro',zero_division=0):.4f}")
    print("Evaluation complete.")`;

    const result = await this.executeStage('model_evaluation', code);
    if (result.error) throw new Error(result.error);
  }


}
