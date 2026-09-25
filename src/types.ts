// ============================================================
// Synapse AI — Core Type Definitions
// ============================================================

// --- Agent Types ---

export type AgentId =
  | 'orchestrator'
  | 'data_analyst'
  | 'clean_bot'
  | 'feature_bot'
  | 'model_scout'
  | 'trainer_bot'
  | 'judge_bot'
  | 'explain_bot'
  | 'report_bot';

export type AgentStatus =
  | 'idle'
  | 'analyzing'
  | 'working'
  | 'communicating'
  | 'waiting'
  | 'success'
  | 'error';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  responsibility: string;
  tools: string[];
}

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  currentAction: string;
  startTime: number | null;
  endTime: number | null;
  input: string;
  output: string;
  decisionSummary: string;
  error: string | null;
}

// --- Execution Event Types ---

export type EventType =
  | 'agent_started'
  | 'agent_progress'
  | 'tool_called'
  | 'data_loaded'
  | 'analysis_completed'
  | 'decision_made'
  | 'warning'
  | 'error'
  | 'model_completed'
  | 'workflow_completed'
  | 'info';

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  agentId: AgentId;
  agentName: string;
  eventType: EventType;
  message: string;
  details?: Record<string, unknown>;
  status: 'success' | 'progress' | 'warning' | 'error' | 'info';
  codeSnippet?: string;
  outputSnippet?: string;
}

// --- Dataset Profile Types ---

export type TaskType = 'classification' | 'regression' | 'clustering' | 'unknown';

export type LearningParadigm = 'supervised' | 'unsupervised' | 'reinforcement' | 'unknown';

export interface ColumnInfo {
  name: string;
  dtype: 'integer' | 'float' | 'categorical' | 'boolean' | 'datetime' | 'unknown';
  uniqueCount: number;
  missingCount: number;
  missingPercent: number;
  isConstant: boolean;
  isTargetCandidate: boolean;
  isIdentifier?: boolean;
  sampleValues: string[];
  // numeric-only stats
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  // categorical-only
  topCategories?: { value: string; count: number }[];
}

export interface DatasetProfile {
  fileName: string;
  fileSizeBytes: number;
  rows: number;
  columns: number;
  columnInfos: ColumnInfo[];
  missingValues: number;
  missingPercent: number;
  duplicates: number;
  duplicatePercent: number;
  categoricalColumns: number;
  numericalColumns: number;
  constantColumns: number;
  booleanColumns: number;
  taskType: TaskType;
  targetColumn: string | null;
  learningParadigm: LearningParadigm;
  targetConfidence: number;
  targetCandidates: string[];
  targetReason: string;
  identifierColumns: string[];
  imbalanceDetected: boolean;
  imbalanceRatio: string | null;
  qualityScore: number;
  qualityIssues: string[];
  classDistribution: { value: string; count: number; percent: number }[] | null;
  memorySizeBytes: number;
}

// --- Cleaning & Feature Engineering ---

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

// --- Model Selection ---

export interface CandidateModel {
  name: string;
  shortName: string;
  reason: string;
}

// --- Training & Evaluation ---

export interface ModelResult {
  trainingMethod: string;
  trainingStatus: 'trained' | 'failed';
  modelName: string;
  shortName: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  trainTime: number;
  predictions: number[];
  probabilities: number[] | null;
  featureImportance: { name: string; importance: number }[];
  isBest: boolean;
  selectionReason: string;
  testUseReason: string;
  rmse?: number;
  mae?: number;
  r2?: number;
}

export interface EvaluationResults {
  models: ModelResult[];
  bestModel: ModelResult;
  selectionMetric: string;
  selectionReason: string;
  finalModelUseReason: string;
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

// --- Explainability ---

export interface PermutationImportance {
  feature: string;
  importance: number;
  accuracyDrop: number;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface LocalExplanation {
  sampleIndex: number;
  trueLabel: string;
  predictedLabel: string;
  correct: boolean;
  contributions: { feature: string; value: number; contribution: number; direction: 'pushed_up' | 'pushed_down' | 'neutral' }[];
  topReasons: string[];
}

export interface ExplanationResults {
  modelName: string;
  permutationImportance: PermutationImportance[];
  localExplanations: LocalExplanation[];
  globalSummary: string;
  topFeatures: { name: string; importance: number; direction: string }[];
}

// --- Report ---

export interface ReportSection {
  title: string;
  content: string;
  icon: string;
}

export interface ExperimentReport {
  title: string;
  generatedAt: string;
  sections: ReportSection[];
  recommendations: string[];
  summary: string;
  fullText: string;
}


// --- Unsupervised learning ---

export interface ClusterPoint {
  x: number;
  y: number;
  cluster: number;
  rowIndex: number;
}

export interface ClusterProfile {
  cluster: number;
  size: number;
  percentage: number;
  centroid: Record<string, number>;
}

export interface ClusterCandidateResult {
  algorithm: 'K-Means' | 'DBSCAN';
  reason: string;
  trainingMethod: string;
  status: 'evaluated' | 'not_selected';
  silhouetteScore: number | null;
  daviesBouldinScore: number | null;
  calinskiHarabaszScore: number | null;
}

export interface ClusteringResults {
  algorithm: 'K-Means' | 'DBSCAN';
  k: number;
  labels: number[];
  featureNames: string[];
  clusterSizes: { cluster: number; size: number; percentage: number }[];
  clusterProfiles: ClusterProfile[];
  silhouetteScore: number | null;
  daviesBouldinScore: number | null;
  calinskiHarabaszScore: number | null;
  pcaPoints: ClusterPoint[];
  selectedCluster: number | null;
  summary: string;
  recommendation: string;
  candidates: ClusterCandidateResult[];
  selectionReason: string;
}

// --- Workflow State ---

export interface WorkflowState {
  status: 'idle' | 'running' | 'completed' | 'error' | 'paused';
  currentAgentId: AgentId | null;
  startedAt: number | null;
  completedAt: number | null;
  datasetProfile: DatasetProfile | null;
  targetColumn: string | null;
  learningParadigm: LearningParadigm;
  cleaningReport: CleaningReport | null;
  featureReport: FeatureReport | null;
  candidateModels: CandidateModel[] | null;
  evaluationResults: EvaluationResults | null;
  explanationResults: ExplanationResults | null;
  experimentReport: ExperimentReport | null;
  clusteringResults: ClusteringResults | null;
  pythonScript: string | null;
  executionTrace: ExecutionEvent[];
  errors: string[];
  totalAgents: number;
  completedAgents: number;
}

// --- Code Snippet for Live Code Panel ---

export interface CodeBlock {
  title: string;
  language: string;
  code: string;
  output?: string;
  activeLine?: number;
}

// --- Live Python Execution ---

export type ExecutionStage =
  | 'idle'
  | 'loading_pyodide'
  | 'loading_packages'
  | 'dataset_analysis'
  | 'data_preprocessing'
  | 'model_training'
  | 'model_evaluation'
  | 'completed'
  | 'error';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface ExecutionOutputLine {
  id: string;
  text: string;
  type: 'stdout' | 'stderr' | 'result' | 'info' | 'error';
  timestamp: string;
}

export interface ExecutionStageInfo {
  stage: ExecutionStage;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  code: string;
  output: ExecutionOutputLine[];
  startTime: number | null;
  endTime: number | null;
  error: string | null;
}

export interface LiveExecutionState {
  status: ExecutionStatus;
  currentStage: ExecutionStage;
  stages: Record<ExecutionStage, ExecutionStageInfo>;
  pyodideReady: boolean;
  pyodideLoading: boolean;
  loadingMessage: string;
  totalOutputLines: number;
}
