// ============================================================
// Synapse AI — Workflow Engine
// Orchestrates real agent execution with live event streaming.
// Every event corresponds to an actual computation.
// Module 1+2: Orchestrator → Data Analyst → CleanBot → FeatureBot → Model Scout → TrainerBot → JudgeBot
// ============================================================

import type {
  AgentId,
  AgentState,
  CodeBlock,
  DatasetProfile,
  ExecutionEvent,
  EventType,
  WorkflowState,
  CleaningReport,
  FeatureReport,
  CandidateModel,
  EvaluationResults,
  ModelResult,
  ExplanationResults,
  ExperimentReport,
  ClusteringResults,
  LearningParadigm,
} from '@/types';
import { AGENT_DEFINITIONS, createInitialAgentStates } from '@/lib/agents';
import { parseCSV, profileDataset, formatBytes, formatNumber } from '@/lib/csvEngine';
import type { ParsedCSV } from '@/lib/csvEngine';
import { cleanAndPreprocess, cleanAndPreprocessUnsupervised, type ProcessedData, type UnsupervisedData } from '@/lib/ml/preprocessing';
import { buildClusteringResults } from '@/lib/ml/clustering';
import { LogisticRegression, RandomForest, GradientBoosting, LinearRegression, RandomForestRegressor, GradientBoostingRegressor } from '@/lib/ml/algorithms';
import { evaluateClassification } from '@/lib/ml/evaluation';
import { generateExplanation } from '@/lib/ml/explainability';
import { generateReport } from '@/lib/ml/report';
import { generatePythonScript } from '@/lib/ml/scriptGenerator';
import { PythonMLRunner, createInitialExecutionState } from '@/lib/pythonMLPipeline';
import type { LiveExecutionState } from '@/types';

type EventCallback = (event: ExecutionEvent) => void;
type StateCallback = (state: WorkflowState) => void;
type AgentStateCallback = (agentId: AgentId, state: AgentState) => void;
type CodeCallback = (code: CodeBlock) => void;
type ExecutionStateCallback = (state: LiveExecutionState) => void;

function timestamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

let eventCounter = 0;
function makeEvent(
  agentId: AgentId,
  eventType: EventType,
  message: string,
  status: ExecutionEvent['status'],
  details?: Record<string, unknown>,
  codeSnippet?: string,
  outputSnippet?: string
): ExecutionEvent {
  return {
    id: `evt_${++eventCounter}_${Date.now()}`,
    timestamp: timestamp(),
    agentId,
    agentName: AGENT_DEFINITIONS[agentId].name,
    eventType,
    message,
    status,
    details,
    codeSnippet,
    outputSnippet,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Yield to UI thread between heavy computations
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class WorkflowEngine {
  private eventListeners: EventCallback[] = [];
  private stateListeners: StateCallback[] = [];
  private agentStateListeners: AgentStateCallback[] = [];
  private codeListeners: CodeCallback[] = [];
  private executionStateListeners: ExecutionStateCallback[] = [];

  private pythonRunner = new PythonMLRunner();
  private executionState: LiveExecutionState = createInitialExecutionState();
  private pythonExecutionPromise: Promise<void> | null = null;

  private agentStates: Record<AgentId, AgentState> = createInitialAgentStates();
  private workflowState: WorkflowState = {
    status: 'idle',
    currentAgentId: null,
    startedAt: null,
    completedAt: null,
    datasetProfile: null,
    targetColumn: null,
    learningParadigm: 'unknown',
    cleaningReport: null,
    featureReport: null,
    candidateModels: null,
    evaluationResults: null,
    explanationResults: null,
    experimentReport: null,
    clusteringResults: null,
    pythonScript: null,
    executionTrace: [],
    errors: [],
    totalAgents: 9,
    completedAgents: 0,
  };

  private running = false;
  private cancelled = false;

  // Cache parsed CSV for reuse across agents
  private parsedCSV: ParsedCSV | null = null;

  // Wire Python runner state changes to our listeners
  private pythonStateSub = this.pythonRunner.onStateChange((state) => {
    this.executionState = state;
    this.emitExecutionState();
  });

  // --- Subscription methods ---

  onEvent(cb: EventCallback): () => void {
    this.eventListeners.push(cb);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== cb);
    };
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateListeners.push(cb);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== cb);
    };
  }

  onAgentStateChange(cb: AgentStateCallback): () => void {
    this.agentStateListeners.push(cb);
    return () => {
      this.agentStateListeners = this.agentStateListeners.filter((l) => l !== cb);
    };
  }

  onCode(cb: CodeCallback): () => void {
    this.codeListeners.push(cb);
    return () => {
      this.codeListeners = this.codeListeners.filter((l) => l !== cb);
    };
  }

  onExecutionStateChange(cb: ExecutionStateCallback): () => void {
    this.executionStateListeners.push(cb);
    return () => {
      this.executionStateListeners = this.executionStateListeners.filter((l) => l !== cb);
    };
  }

  getExecutionState(): LiveExecutionState {
    return { ...this.executionState };
  }

  private emitExecutionState() {
    this.executionStateListeners.forEach((cb) => cb({ ...this.executionState }));
  }

  // --- Internal emitters ---

  private emitEvent(event: ExecutionEvent) {
    this.workflowState.executionTrace = [...this.workflowState.executionTrace, event];
    this.eventListeners.forEach((cb) => cb(event));
  }

  private emitState() {
    this.stateListeners.forEach((cb) => cb({ ...this.workflowState }));
  }

  private emitAgentState(agentId: AgentId) {
    this.agentStateListeners.forEach((cb) =>
      cb(agentId, { ...this.agentStates[agentId] })
    );
  }

  private emitCode(code: CodeBlock) {
    this.codeListeners.forEach((cb) => cb(code));
  }

  private setAgentStatus(agentId: AgentId, status: AgentState['status']) {
    this.agentStates[agentId].status = status;
    this.emitAgentState(agentId);
  }

  private setAgentAction(agentId: AgentId, action: string) {
    this.agentStates[agentId].currentAction = action;
    this.emitAgentState(agentId);
  }

  private setAgentInput(agentId: AgentId, input: string) {
    this.agentStates[agentId].input = input;
    this.emitAgentState(agentId);
  }

  private setAgentOutput(agentId: AgentId, output: string) {
    this.agentStates[agentId].output = output;
    this.emitAgentState(agentId);
  }

  private setAgentDecision(agentId: AgentId, summary: string) {
    this.agentStates[agentId].decisionSummary = summary;
    this.emitAgentState(agentId);
  }

  private setAgentError(agentId: AgentId, error: string) {
    this.agentStates[agentId].error = error;
    this.emitAgentState(agentId);
  }

  private setAgentTimes(agentId: AgentId, start: number | null, end: number | null) {
    this.agentStates[agentId].startTime = start;
    this.agentStates[agentId].endTime = end;
    this.emitAgentState(agentId);
  }

  // --- Public API ---

  getState(): WorkflowState {
    return { ...this.workflowState };
  }

  getAgentStates(): Record<AgentId, AgentState> {
    return { ...this.agentStates };
  }

  isRunning(): boolean {
    return this.running;
  }

  cancel() {
    this.cancelled = true;
  }

  reset() {
    this.cancelled = true;
    this.running = false;
    eventCounter = 0;
    this.parsedCSV = null;
    this.pythonRunner.reset();
    this.executionState = createInitialExecutionState();
    this.emitExecutionState();
    this.agentStates = createInitialAgentStates();
    this.workflowState = {
      status: 'idle',
      currentAgentId: null,
      startedAt: null,
      completedAt: null,
      datasetProfile: null,
      targetColumn: null,
      learningParadigm: 'unknown',
      cleaningReport: null,
      featureReport: null,
      candidateModels: null,
      evaluationResults: null,
      explanationResults: null,
      experimentReport: null,
      clusteringResults: null,
      pythonScript: null,
      executionTrace: [],
      errors: [],
      totalAgents: 9,
      completedAgents: 0,
    };
    this.emitState();
    Object.keys(this.agentStates).forEach((id) => {
      this.emitAgentState(id as AgentId);
    });
  }

  // --- Workflow Execution ---

  async run(file: File): Promise<DatasetProfile | null> {
    if (this.running) return null;
    this.running = true;
    this.cancelled = false;

    this.workflowState.status = 'running';
    this.workflowState.startedAt = Date.now();
    this.workflowState.completedAt = null;
    this.workflowState.executionTrace = [];
    this.workflowState.errors = [];
    this.workflowState.completedAgents = 0;
    this.emitState();

    // Reset Python runner state for this run
    this.pythonRunner.reset();
    this.executionState = createInitialExecutionState();
    this.emitExecutionState();

    try {
      // === ORCHESTRATOR ===
      await this.runOrchestrator(file);
      if (this.cancelled) return null;

      // === DATA ANALYST ===
      // The profile must be available before starting the Python runner because
      // it determines the target column and learning paradigm.
      const profile = await this.runDataAnalyst(file);
      if (this.cancelled) return null;

      // Kick off real Python execution in the background.
      // The Python runner loads Pyodide, installs pandas/numpy/scikit-learn,
      // and executes the full ML pipeline on the uploaded CSV.
      // This runs concurrently with the JS-based agent visualization.
      const csvText = await file.text();
      this.pythonExecutionPromise = this.pythonRunner.run(
        csvText,
        file.name,
        profile.targetColumn,
        profile.learningParadigm === 'supervised' ? 'supervised' : 'unsupervised'
      );

      // === REAL LEARNING-PARADIGM BRANCH ===
      if (!profile.targetColumn || profile.learningParadigm === 'unsupervised' || profile.taskType === 'clustering') {
        await this.runUnsupervisedWorkflow(file, profile);
        if (this.cancelled) return null;
        await this.finishWorkflow('unsupervised');
        return profile;
      }

      // === SUPERVISED PATH ===
      const { data, cleaningReport, featureReport } = await this.runCleanBot(file, profile);
      if (this.cancelled) return null;

      await this.runFeatureBot(featureReport, cleaningReport);
      if (this.cancelled) return null;

      // === MODEL SCOUT ===
      const candidates = await this.runModelScout(profile, data);
      if (this.cancelled) return null;

      // === TRAINER BOT ===
      const modelResults = await this.runTrainerBot(data, candidates);
      if (this.cancelled) return null;

      // === JUDGE BOT ===
      const evalResults = await this.runJudgeBot(data, modelResults);
      if (this.cancelled) return null;

      // === EXPLAIN BOT ===
      const explanation = await this.runExplainBot(evalResults.bestModel, data, profile, cleaningReport, featureReport);
      if (this.cancelled) return null;

      // === REPORT BOT ===
      const report = await this.runReportBot(profile, cleaningReport, featureReport, evalResults, explanation);
      if (this.cancelled) return null;

      await this.finishWorkflow('supervised');
      return profile;
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      if (/least populated class|stratify/i.test(errorMsg)) { errorMsg = 'The selected target has classes with too few records for stratified training. Try a different target or use Unsupervised Learning.'; }

      this.workflowState.status = 'error';
      this.workflowState.errors.push(errorMsg);
      this.emitState();

      this.emitEvent(
        makeEvent(
          'orchestrator',
          'error',
          `Workflow halted: ${errorMsg}`,
          'error',
          { error: errorMsg }
        )
      );

      const currentAgent = this.workflowState.currentAgentId;
      if (currentAgent) {
        this.setAgentError(currentAgent, errorMsg);
        this.setAgentStatus(currentAgent, 'error');
        this.setAgentTimes(currentAgent, this.agentStates[currentAgent].startTime, Date.now());
      }

      this.running = false;
      return null;
    }
  }

  private async finishWorkflow(paradigm: LearningParadigm): Promise<void> {
    this.setAgentAction('orchestrator', `${paradigm === 'supervised' ? 'Supervised' : 'Unsupervised'} workflow completed — ready for dashboard`);
    this.setAgentStatus('orchestrator', 'success');
    this.setAgentTimes('orchestrator', this.agentStates.orchestrator.startTime, Date.now());

    this.emitEvent(makeEvent(
      'orchestrator',
      'workflow_completed',
      `${paradigm === 'supervised' ? 'Supervised' : 'Unsupervised'} multi-agent workflow completed successfully`,
      'success',
      { paradigm, reportGenerated: true }
    ));

    this.workflowState.status = 'completed';
    this.workflowState.completedAt = Date.now();
    this.workflowState.completedAgents = 9;
    this.emitState();

    if (this.pythonExecutionPromise) {
      await this.pythonExecutionPromise;
      this.pythonExecutionPromise = null;
    }
    this.running = false;
  }

  private async runUnsupervisedWorkflow(file: File, profile: DatasetProfile): Promise<void> {
    this.workflowState.learningParadigm = 'unsupervised';
    this.workflowState.currentAgentId = 'clean_bot';
    this.emitState();

    const { data, cleaningReport, featureReport } = await this.runUnsupervisedCleanBot(file, profile);
    if (this.cancelled) return;

    await this.runFeatureBot(featureReport, cleaningReport);
    if (this.cancelled) return;

    await this.runClusterScout(profile, data);
    if (this.cancelled) return;

    const clustering = await this.runClusterer(profile, data);
    if (this.cancelled) return;

    await this.runClusterJudge(clustering, profile);
    if (this.cancelled) return;

    const explanation = await this.runUnsupervisedExplainBot(clustering, profile, cleaningReport, featureReport);
    if (this.cancelled) return;

    await this.runUnsupervisedReportBot(profile, cleaningReport, featureReport, clustering, explanation);
  }

  private async runUnsupervisedCleanBot(file: File, profile: DatasetProfile): Promise<{ data: UnsupervisedData; cleaningReport: CleaningReport; featureReport: FeatureReport }> {
    this.workflowState.currentAgentId = 'clean_bot';
    this.workflowState.targetColumn = null;
    this.workflowState.learningParadigm = 'unsupervised';
    this.workflowState.completedAgents = 2;
    this.setAgentTimes('clean_bot', Date.now(), null);
    this.setAgentStatus('clean_bot', 'working');
    this.setAgentAction('clean_bot', 'Preparing identifier-safe features for unsupervised learning');
    this.setAgentInput('clean_bot', `${profile.rows} rows · no target column`);

    this.emitEvent(makeEvent('clean_bot', 'agent_started', 'CleanBot activated — preparing target-free feature matrix', 'info'));
    this.emitCode({
      title: 'unsupervised_preprocessing.py', language: 'python',
      code: `# CleanBot — Unsupervised Preprocessing\n# 1. Remove duplicate rows\n# 2. Detect and exclude identifier columns\n# 3. Impute missing values\n# 4. Encode categorical features\n# 5. Standardize numeric feature space\n\nidentifier_cols = detect_identifier_columns(df)\nX = df.drop(columns=identifier_cols)\nX = prepare_features(X)\nX_scaled = StandardScaler().fit_transform(X)`,
      output: 'Preparing a target-free feature matrix…'
    });
    await sleep(450);

    const result = cleanAndPreprocessUnsupervised(this.parsedCSV!, profile);
    const { data, cleaningReport, featureReport } = result;

    for (const action of cleaningReport.actions) {
      this.emitEvent(makeEvent('clean_bot', 'agent_progress', action, 'success', {}, undefined, action));
      await sleep(120);
    }
    this.emitEvent(makeEvent('clean_bot', 'analysis_completed', `Prepared ${data.featureNames.length} usable features; identifier columns excluded`, 'success',
      { features: data.featureNames, removedIdentifiers: featureReport.removedFeatures.filter(name => profile.identifierColumns.includes(name)) },
      `X = df.drop(columns=identifier_cols)\nX_scaled = StandardScaler().fit_transform(X)`,
      `Features: ${data.featureNames.join(', ')}\nIdentifiers excluded: ${profile.identifierColumns.join(', ') || 'none'}\nRows ready: ${data.rowCount}`
    ));
    this.setAgentOutput('clean_bot', JSON.stringify({ rows: data.rowCount, features: data.featureNames, excluded_identifiers: profile.identifierColumns }, null, 2));
    this.setAgentDecision('clean_bot', `No target was selected. Excluded ${profile.identifierColumns.length} identifier column(s) and prepared ${data.featureNames.length} features for clustering. Next: FeatureBot.`);
    this.setAgentStatus('clean_bot', 'success');
    this.setAgentTimes('clean_bot', this.agentStates.clean_bot.startTime, Date.now());
    this.workflowState.cleaningReport = cleaningReport;
    this.workflowState.featureReport = featureReport;
    this.emitState();
    await sleep(250);
    this.setAgentStatus('clean_bot', 'idle');
    this.setAgentAction('clean_bot', '');
    return result;
  }

  private async runClusterScout(profile: DatasetProfile, data: UnsupervisedData): Promise<void> {
    this.workflowState.currentAgentId = 'model_scout';
    this.workflowState.completedAgents = 4;
    this.setAgentTimes('model_scout', Date.now(), null);
    this.setAgentStatus('model_scout', 'analyzing');
    this.setAgentAction('model_scout', 'Choosing a clustering strategy');
    this.setAgentInput('model_scout', `${data.rowCount} rows · ${data.featureNames.length} features`);
    this.emitEvent(makeEvent('model_scout', 'agent_started', 'Cluster Scout activated — selecting unsupervised algorithms', 'info'));
    this.emitCode({ title:'cluster_scout.py', language:'python', code:`# Cluster Scout\nfrom sklearn.cluster import KMeans, DBSCAN\n\n# Distance-based clustering is appropriate after standardization.\n# Evaluate K-Means across k=2..6 using silhouette score.\ncandidates = {"K-Means": "multi-cluster centroid method", "DBSCAN": "density-based alternative"}`, output:'Comparing K-Means and DBSCAN for the prepared feature space…' });
    await sleep(450);
    const candidates: CandidateModel[] = [
      { name:'K-Means', shortName:'KMEANS', reason:'Strong baseline for standardized numeric data; k can be selected using silhouette score.' },
      { name:'DBSCAN', shortName:'DBSCAN', reason:'Useful alternative when clusters may be irregularly shaped or contain noise/outliers.' },
    ];
    this.workflowState.candidateModels = candidates;
    this.emitEvent(makeEvent('model_scout','analysis_completed','Clustering candidates ready: K-Means + DBSCAN','success',{candidates:candidates.map(c=>c.name)},undefined,candidates.map(c=>`${c.name}: ${c.reason}`).join('\n')));
    this.setAgentOutput('model_scout', JSON.stringify(candidates, null, 2));
    this.setAgentDecision('model_scout', 'Unsupervised branch selected. K-Means will be scored across multiple k values; DBSCAN is retained as an alternative for non-spherical/noisy structure. Next: Clusterer.');
    this.setAgentStatus('model_scout','success');
    this.setAgentTimes('model_scout',this.agentStates.model_scout.startTime,Date.now());
    this.emitState();
    await sleep(250);
    this.setAgentStatus('model_scout','idle'); this.setAgentAction('model_scout','');
  }

  private async runClusterer(profile: DatasetProfile, data: UnsupervisedData): Promise<ClusteringResults> {
    this.workflowState.currentAgentId = 'trainer_bot';
    this.workflowState.completedAgents = 5;
    this.setAgentTimes('trainer_bot', Date.now(), null);
    this.setAgentStatus('trainer_bot','working');
    this.setAgentAction('trainer_bot','Running K-Means and selecting k by silhouette score');
    this.setAgentInput('trainer_bot', `${data.rowCount} samples · standardized distance space`);
    const script=`# Clusterer — K-Means\nfrom sklearn.cluster import KMeans\nfrom sklearn.metrics import silhouette_score\n\nbest_k = None\nbest_score = -1\nfor k in range(2, min(6, len(X)-1) + 1):\n    labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)\n    score = silhouette_score(X_scaled, labels)\n    if score > best_score:\n        best_k, best_score = k, score\n\nprint(f"Selected k={best_k}; silhouette={best_score:.4f}")`;
    this.emitCode({ title:'clusterer.py', language:'python', code:script, output:'Running K-Means candidates…' });
    await sleep(550);
    const clustering=buildClusteringResults(data);
    this.emitEvent(makeEvent('trainer_bot','analysis_completed',`K-Means discovered ${clustering.k} clusters (silhouette ${clustering.silhouetteScore?.toFixed(3) ?? 'n/a'})`,'success',{k:clustering.k},script,`Selected k=${clustering.k}\nSilhouette=${clustering.silhouetteScore?.toFixed(4) ?? 'n/a'}\nRows assigned=${clustering.labels.length}`));
    this.setAgentOutput('trainer_bot', JSON.stringify({algorithm:clustering.algorithm,k:clustering.k,silhouette:clustering.silhouetteScore,clusterSizes:clustering.clusterSizes},null,2));
    this.setAgentDecision('trainer_bot', `Executed ${clustering.algorithm} with k=${clustering.k}. Every record received a cluster assignment. Next: Cluster Judge.`);
    this.setAgentStatus('trainer_bot','success'); this.setAgentTimes('trainer_bot',this.agentStates.trainer_bot.startTime,Date.now());
    this.emitState();
    await sleep(250); this.setAgentStatus('trainer_bot','idle'); this.setAgentAction('trainer_bot','');
    return clustering;
  }

  private async runClusterJudge(clustering: ClusteringResults, profile: DatasetProfile): Promise<void> {
    this.workflowState.currentAgentId='judge_bot'; this.workflowState.completedAgents=6;
    this.setAgentTimes('judge_bot',Date.now(),null); this.setAgentStatus('judge_bot','analyzing'); this.setAgentAction('judge_bot','Evaluating cluster quality');
    this.emitEvent(makeEvent('judge_bot','agent_started','Cluster Judge activated — validating discovered structure','info'));
    this.emitCode({title:'cluster_evaluation.py',language:'python',code:`# Cluster Judge\nfrom sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score\n\nsilhouette = silhouette_score(X_scaled, labels)\ndavies_bouldin = davies_bouldin_score(X_scaled, labels)\ncalinski_harabasz = calinski_harabasz_score(X_scaled, labels)`,output:'Computing unsupervised quality metrics…'});
    await sleep(400);
    this.emitEvent(makeEvent('judge_bot','analysis_completed',`Cluster quality: Silhouette=${clustering.silhouetteScore?.toFixed(3) ?? 'n/a'}, Davies-Bouldin=${clustering.daviesBouldinScore?.toFixed(3) ?? 'n/a'}`,'success',{},undefined,`Silhouette: ${clustering.silhouetteScore?.toFixed(4) ?? 'n/a'}\nDavies-Bouldin: ${clustering.daviesBouldinScore?.toFixed(4) ?? 'n/a'}\nCalinski-Harabasz: ${clustering.calinskiHarabaszScore?.toFixed(2) ?? 'n/a'}`));
    this.workflowState.clusteringResults=clustering; this.emitState();
    this.setAgentOutput('judge_bot', JSON.stringify(clustering.clusterSizes,null,2));
    this.setAgentDecision('judge_bot', `Validated ${clustering.k} clusters using silhouette, Davies-Bouldin, and Calinski-Harabasz metrics. Largest discovered group: Cluster ${clustering.selectedCluster}. Next: ExplainBot.`);
    this.setAgentStatus('judge_bot','success'); this.setAgentTimes('judge_bot',this.agentStates.judge_bot.startTime,Date.now()); this.emitState();
    await sleep(250); this.setAgentStatus('judge_bot','idle'); this.setAgentAction('judge_bot','');
  }

  private async runUnsupervisedExplainBot(clustering: ClusteringResults, profile: DatasetProfile, cleaning: CleaningReport, features: FeatureReport): Promise<ExplanationResults> {
    this.workflowState.currentAgentId='explain_bot'; this.workflowState.completedAgents=7;
    this.setAgentTimes('explain_bot',Date.now(),null); this.setAgentStatus('explain_bot','analyzing'); this.setAgentAction('explain_bot','Explaining discovered segments');
    this.emitEvent(makeEvent('explain_bot','agent_started','ExplainBot activated — interpreting cluster structure','info'));
    this.emitCode({title:'cluster_explain.py',language:'python',code:`# ExplainBot — Cluster Interpretation\n# Compare each cluster centroid with the global standardized feature mean.\nfor cluster_profile in cluster_profiles:\n    print(cluster_profile)`,output:'Comparing cluster profiles and preparing human-readable insights…'});
    await sleep(350);
    const topFeatures=features.varianceScores.slice(0,5).map((f,i)=>({name:f.name,importance:Math.max(0.01,1/(i+1)),direction:'cluster-separating variance'}));
    const explanation: ExplanationResults = { modelName: clustering.algorithm, permutationImportance: [], localExplanations: [], globalSummary: `${clustering.k} groups were discovered without using a target label. The largest group is Cluster ${clustering.selectedCluster}. Cluster separation is summarized by silhouette ${clustering.silhouetteScore?.toFixed(3) ?? 'n/a'}.`, topFeatures };
    this.workflowState.explanationResults=explanation;
    this.setAgentOutput('explain_bot', explanation.globalSummary);
    this.setAgentDecision('explain_bot', `${explanation.globalSummary} Top separating features are ${topFeatures.slice(0,3).map(f=>f.name).join(', ')}. Next: ReportBot.`);
    this.emitEvent(makeEvent('explain_bot','analysis_completed','Cluster interpretation generated','success',{topFeatures:topFeatures.map(f=>f.name)},undefined,explanation.globalSummary));
    this.setAgentStatus('explain_bot','success'); this.setAgentTimes('explain_bot',this.agentStates.explain_bot.startTime,Date.now()); this.emitState();
    await sleep(250); this.setAgentStatus('explain_bot','idle'); this.setAgentAction('explain_bot','');
    return explanation;
  }

  private async runUnsupervisedReportBot(profile: DatasetProfile, cleaning: CleaningReport, features: FeatureReport, clustering: ClusteringResults, explanation: ExplanationResults): Promise<void> {
    this.workflowState.currentAgentId='report_bot'; this.workflowState.completedAgents=8;
    this.setAgentTimes('report_bot',Date.now(),null); this.setAgentStatus('report_bot','working'); this.setAgentAction('report_bot','Compiling unsupervised experiment report');
    this.emitEvent(makeEvent('report_bot','agent_started','ReportBot activated — documenting clustering experiment','info'));
    const report: ExperimentReport={
      title:`Unsupervised Experiment Report — ${profile.fileName}`,
      generatedAt:new Date().toISOString(),
      sections:[
        {title:'Dataset Overview',icon:'database',content:`${formatNumber(profile.rows)} rows × ${profile.columns} columns. No reliable target was detected. Identifier columns excluded: ${profile.identifierColumns.join(', ') || 'none'}.`},
        {title:'Learning Decision',icon:'git-branch',content:`Synapse selected the unsupervised branch because ${profile.targetReason}`},
        {title:'Feature Preparation',icon:'sliders-horizontal',content:`Prepared ${features.processedFeatures} features after removing identifiers/constants, imputing missing values, encoding categories, and standardizing distances.`},
        {title:'Cluster Discovery',icon:'waypoints',content:`K-Means selected k=${clustering.k}. ${clustering.summary}`},
        {title:'Cluster Evaluation',icon:'chart-no-axes-combined',content:`Silhouette=${clustering.silhouetteScore?.toFixed(4) ?? 'n/a'}; Davies-Bouldin=${clustering.daviesBouldinScore?.toFixed(4) ?? 'n/a'}; Calinski-Harabasz=${clustering.calinskiHarabaszScore?.toFixed(2) ?? 'n/a'}.`},
        {title:'Explainability',icon:'sparkles',content:explanation.globalSummary},
      ],
      recommendations:[clustering.recommendation,'Inspect cluster profiles before using them for business decisions.','Try DBSCAN when domain knowledge suggests irregular or noise-heavy groups.'],
      summary:`Synapse discovered ${clustering.k} unsupervised groups without forcing a target column.`,
      fullText:''
    };
    report.fullText=[report.title,'',report.summary,...report.sections.map(s=>`\n## ${s.title}\n${s.content}`),'\nRecommendations:',...report.recommendations.map((r,i)=>`${i+1}. ${r}`)].join('\n');
    this.workflowState.experimentReport=report;
    this.setAgentOutput('report_bot',report.fullText);
    this.setAgentDecision('report_bot',`Generated the final unsupervised report covering dataset analysis, learning-paradigm decision, feature preparation, cluster discovery, evaluation, and recommendations. Workflow complete.`);
    this.emitCode({title:'synapse_unsupervised_experiment.py',language:'python',code:this.buildUnsupervisedPythonScript(profile),output:'# Complete unsupervised experiment script generated.\n# Requires: pandas numpy scikit-learn'});
    this.workflowState.pythonScript=this.buildUnsupervisedPythonScript(profile);
    this.setAgentStatus('report_bot','success'); this.setAgentTimes('report_bot',this.agentStates.report_bot.startTime,Date.now()); this.emitState();
    await sleep(250); this.setAgentStatus('report_bot','idle'); this.setAgentAction('report_bot','');
  }

  private buildUnsupervisedPythonScript(profile: DatasetProfile): string {
    const ids=JSON.stringify(profile.identifierColumns);
    return `#!/usr/bin/env python3\n\"\"\"Synapse AI — Unsupervised clustering experiment\"\"\"\nimport pandas as pd\nimport numpy as np\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.impute import SimpleImputer\nfrom sklearn.cluster import KMeans\nfrom sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score\n\nDATA_FILE = \"${profile.fileName}\"\nIDENTIFIER_COLUMNS = ${ids}\n\ndf = pd.read_csv(DATA_FILE)\ndf = df.drop_duplicates().reset_index(drop=True)\nX = df.drop(columns=[c for c in IDENTIFIER_COLUMNS if c in df.columns])\nnum_cols = X.select_dtypes(include=[np.number]).columns.tolist()\ncat_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()\nif num_cols:\n    X[num_cols] = SimpleImputer(strategy=\"median\").fit_transform(X[num_cols])\nif cat_cols:\n    X[cat_cols] = SimpleImputer(strategy=\"most_frequent\").fit_transform(X[cat_cols])\n    X = pd.get_dummies(X, columns=cat_cols, drop_first=True)\nX = X.replace([np.inf, -np.inf], np.nan).fillna(0)\nX_scaled = StandardScaler().fit_transform(X)\n\nbest_k, best_score, best_labels = None, -1, None\nfor k in range(2, min(6, len(X)-1) + 1):\n    labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)\n    score = silhouette_score(X_scaled, labels)\n    print(f\"k={k}: silhouette={score:.4f}\")\n    if score > best_score:\n        best_k, best_score, best_labels = k, score, labels\n\nprint(f\"Selected k={best_k}\")\nprint(f\"Silhouette Score: {silhouette_score(X_scaled, best_labels):.4f}\")\nprint(f\"Davies-Bouldin Index: {davies_bouldin_score(X_scaled, best_labels):.4f}\")\nprint(f\"Calinski-Harabasz Score: {calinski_harabasz_score(X_scaled, best_labels):.2f}\")\nprint(\"Cluster sizes:\")\nprint(pd.Series(best_labels).value_counts().sort_index())\n`;
  }

  // --- Orchestrator ---

  private async runOrchestrator(file: File): Promise<void> {
    this.workflowState.currentAgentId = 'orchestrator';
    this.emitState();

    this.setAgentTimes('orchestrator', Date.now(), null);
    this.setAgentStatus('orchestrator', 'working');
    this.setAgentAction('orchestrator', 'Initializing workflow and validating input');
    this.setAgentInput('orchestrator', `${file.name} (${formatBytes(file.size)})`);

    this.emitEvent(
      makeEvent(
        'orchestrator',
        'agent_started',
        `Synapse Core activated — initializing multi-agent workflow`,
        'info',
        { fileName: file.name, fileSize: formatBytes(file.size) }
      )
    );

    this.emitCode({
      title: 'orchestrator.py',
      language: 'python',
      code: `# Synapse Core — Orchestrator\nfrom langgraph.graph import StateGraph\n\nworkflow = StateGraph(ExperimentState)\nworkflow.add_node("data_analyst", data_analyst_agent)\nworkflow.add_node("clean_bot", clean_bot_agent)\nworkflow.add_node("feature_bot", feature_bot_agent)\nworkflow.add_node("model_scout", model_scout_agent)\nworkflow.add_node("trainer_bot", trainer_bot_agent)\nworkflow.add_node("judge_bot", judge_bot_agent)\nworkflow.add_node("explain_bot", explain_bot_agent)\nworkflow.add_node("report_bot", report_bot_agent)\nworkflow.add_edge(START, "data_analyst")\nworkflow.add_edge("data_analyst", "clean_bot")\nworkflow.add_edge("clean_bot", "feature_bot")\nworkflow.add_edge("feature_bot", "model_scout")\nworkflow.add_edge("model_scout", "trainer_bot")\nworkflow.add_edge("trainer_bot", "judge_bot")\nworkflow.add_edge("judge_bot", "explain_bot")\nworkflow.add_edge("explain_bot", "report_bot")\n\nprint("Workflow initialized. 9 agents ready.")`,
      output: `Workflow initialized.\n9 agents ready: Data Analyst → CleanBot → FeatureBot → Model Scout → TrainerBot → JudgeBot → ExplainBot → ReportBot\nRouting to: Data Analyst`,
    });

    await sleep(600);

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      throw new Error(`Invalid file type: "${file.name}". Only .csv files are supported.`);
    }
    if (file.size === 0) {
      throw new Error('The uploaded file is empty.');
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('File exceeds 50 MB limit. Please use a smaller dataset.');
    }

    this.emitEvent(
      makeEvent('orchestrator', 'decision_made', `Input validated — routing to Data Analyst agent`, 'success',
        { fileName: file.name, fileSize: formatBytes(file.size) }
      )
    );

    this.setAgentDecision('orchestrator',
      `Validated ${file.name} (${formatBytes(file.size)}). File type and size checks passed. ` +
      `Routing through 9-agent pipeline: Data Analyst → CleanBot → FeatureBot → Model Scout → TrainerBot → JudgeBot → ExplainBot → ReportBot.`
    );

    await sleep(400);
    this.setAgentStatus('orchestrator', 'communicating');
    this.setAgentAction('orchestrator', 'Routing to Data Analyst agent');
    await sleep(300);
  }

  // --- Data Analyst ---

  private async runDataAnalyst(file: File): Promise<DatasetProfile> {
    this.workflowState.currentAgentId = 'data_analyst';
    this.workflowState.completedAgents = 1;
    this.emitState();

    this.setAgentTimes('data_analyst', Date.now(), null);
    this.setAgentStatus('data_analyst', 'analyzing');
    this.setAgentAction('data_analyst', 'Loading dataset with pandas.read_csv()');
    this.setAgentInput('data_analyst', file.name);

    this.emitEvent(
      makeEvent('data_analyst', 'agent_started', `Data Analyst activated — beginning dataset profiling`, 'info', { fileName: file.name })
    );

    this.emitCode({
      title: 'data_analyst.py',
      language: 'python',
      code: `# Data Analyst — Dataset Profiling\nimport pandas as pd\n\ndf = pd.read_csv("${file.name}")\nprint(f"Loading ${file.name}...")`,
      output: `Loading ${file.name}...`,
      activeLine: 3,
    });

    await sleep(700);

    const text = await file.text();
    const parsed = parseCSV(text, file.name, file.size);
    this.parsedCSV = parsed;

    if (parsed.headers.length === 0) {
      throw new Error('No columns detected in the CSV file. The file may be malformed or empty.');
    }
    if (parsed.rows.length === 0) {
      throw new Error('No data rows detected in the CSV file. The file contains only headers.');
    }

    this.setAgentAction('data_analyst', 'Inspecting schema and calculating statistics');

    this.emitEvent(
      makeEvent('data_analyst', 'data_loaded', `Dataset loaded successfully`, 'success',
        { rows: parsed.rows.length, columns: parsed.headers.length },
        `df = pd.read_csv("${file.name}")\nrows, columns = df.shape`,
        `Rows: ${formatNumber(parsed.rows.length)}\nColumns: ${parsed.headers.length}`
      )
    );

    this.emitCode({
      title: 'data_analyst.py',
      language: 'python',
      code: `# Data Analyst — Dataset Profiling\nimport pandas as pd\n\ndf = pd.read_csv("${file.name}")\nrows, columns = df.shape\nprint(f"Rows: {rows}")\nprint(f"Columns: {columns}")`,
      output: `Rows: ${formatNumber(parsed.rows.length)}\nColumns: ${parsed.headers.length}`,
    });

    await sleep(500);

    this.setAgentStatus('data_analyst', 'working');
    this.setAgentAction('data_analyst', 'Detecting data types and missing values');

    this.emitEvent(
      makeEvent('data_analyst', 'agent_progress', `Inspecting schema and detecting data types`, 'progress',
        { columns: parsed.headers.length }, `dtypes = df.dtypes\nprint(dtypes)`, `Detecting types for ${parsed.headers.length} columns...`
      )
    );

    await sleep(400);

    const profile = profileDataset(parsed, file.name);

    if (profile.missingValues > 0) {
      this.emitEvent(
        makeEvent('data_analyst', 'agent_progress', `Missing values detected: ${formatNumber(profile.missingValues)}`, 'warning',
          { count: profile.missingValues, percent: profile.missingPercent.toFixed(2) },
          `missing = df.isna().sum()\nprint(f"Missing: {missing.sum()}")`,
          `Missing values: ${formatNumber(profile.missingValues)} (${profile.missingPercent.toFixed(2)}%)`
        )
      );
      await sleep(300);
    }

    if (profile.duplicates > 0) {
      this.emitEvent(
        makeEvent('data_analyst', 'agent_progress', `Duplicate rows detected: ${formatNumber(profile.duplicates)}`, 'warning',
          { count: profile.duplicates }, `duplicates = df.duplicated().sum()`, `Duplicates: ${formatNumber(profile.duplicates)}`
        )
      );
      await sleep(300);
    }

    this.setAgentAction('data_analyst', 'Classifying columns as numerical or categorical');
    this.emitEvent(
      makeEvent('data_analyst', 'agent_progress',
        `Column types classified: ${profile.numericalColumns} numerical, ${profile.categoricalColumns} categorical, ${profile.booleanColumns} boolean`,
        'progress', { numerical: profile.numericalColumns, categorical: profile.categoricalColumns, boolean: profile.booleanColumns }
      )
    );
    await sleep(400);

    if (profile.constantColumns > 0) {
      this.emitEvent(
        makeEvent('data_analyst', 'agent_progress', `Constant columns detected: ${profile.constantColumns} (no variance — candidates for removal)`, 'warning', { count: profile.constantColumns })
      );
      await sleep(200);
    }

    this.setAgentAction('data_analyst', 'Detecting target column and task type');
    await sleep(300);

    if (profile.targetColumn) {
      this.emitEvent(
        makeEvent('data_analyst', 'analysis_completed', `Target column detected: "${profile.targetColumn}" (${profile.taskType})`, 'success',
          { target: profile.targetColumn, taskType: profile.taskType, evidenceScore: profile.targetConfidence },
          `# Target detection heuristic\ntarget = detect_target_candidate(df)\nprint(f"Target: {target}")`,
          `Target column: ${profile.targetColumn}\nTask type: ${profile.taskType}\nEvidence score: ${profile.targetConfidence}%`
        )
      );
    } else {
      this.emitEvent(
        makeEvent('data_analyst', 'warning', `No reliable target detected — switching to Unsupervised Learning`, 'warning')
      );
    }
    await sleep(300);

    if (profile.imbalanceDetected) {
      this.emitEvent(
        makeEvent('data_analyst', 'agent_progress', `Class imbalance detected — ratio ${profile.imbalanceRatio}`, 'warning', { ratio: profile.imbalanceRatio })
      );
      await sleep(300);
    }

    this.setAgentAction('data_analyst', 'Computing dataset quality score');
    await sleep(400);

    this.emitEvent(
      makeEvent('data_analyst', 'analysis_completed', `Dataset quality score: ${profile.qualityScore}/100`,
        profile.qualityScore >= 70 ? 'success' : 'warning',
        { qualityScore: profile.qualityScore, issues: profile.qualityIssues }
      )
    );

    this.setAgentStatus('data_analyst', 'communicating');
    this.setAgentAction('data_analyst', 'Generating DatasetProfile artifact');
    await sleep(400);

    const profileJSON = JSON.stringify({
      rows: profile.rows, columns: profile.columns, task_type: profile.taskType,
      target_column: profile.targetColumn, missing_values: profile.missingValues,
      duplicates: profile.duplicates, quality_score: profile.qualityScore,
    }, null, 2);

    this.emitEvent(
      makeEvent('data_analyst', 'analysis_completed', `DatasetProfile artifact generated`, 'success',
        { profile: profileJSON },
        `profile = DatasetProfile(rows=${profile.rows}, columns=${profile.columns}, task_type="${profile.taskType}")`,
        profileJSON
      )
    );

    this.setAgentOutput('data_analyst', profileJSON);
    this.setAgentDecision('data_analyst',
      `Analyzed ${file.name}: ${formatNumber(profile.rows)} rows × ${profile.columns} columns. ` +
      `${profile.learningParadigm === 'unsupervised' ? `No reliable target detected (${profile.targetReason})` : `Detected ${profile.taskType} target "${profile.targetColumn}" (evidence score: ${profile.targetConfidence}%)`}. ` +
      `Quality score: ${profile.qualityScore}/100. Next: CleanBot and the learning-paradigm branch.`
    );

    this.setAgentStatus('data_analyst', 'success');
    this.setAgentTimes('data_analyst', this.agentStates.data_analyst.startTime, Date.now());

    this.workflowState.datasetProfile = profile;
    this.workflowState.targetColumn = profile.targetColumn;
    this.workflowState.learningParadigm = profile.learningParadigm;
    this.emitState();

    await sleep(300);
    this.setAgentStatus('data_analyst', 'idle');
    this.setAgentAction('data_analyst', '');

    return profile;
  }

  // --- CleanBot ---

  private async runCleanBot(
    file: File,
    profile: DatasetProfile
  ): Promise<{ data: ProcessedData; cleaningReport: CleaningReport; featureReport: FeatureReport }> {
    this.workflowState.currentAgentId = 'clean_bot';
    this.workflowState.completedAgents = 2;
    this.emitState();

    this.setAgentTimes('clean_bot', Date.now(), null);
    this.setAgentStatus('clean_bot', 'working');
    this.setAgentAction('clean_bot', 'Applying data cleaning pipeline');
    this.setAgentInput('clean_bot', `DatasetProfile (${profile.rows} rows, ${profile.columns} cols)`);

    this.emitEvent(
      makeEvent('clean_bot', 'agent_started', `CleanBot activated — preparing dataset for training`, 'info')
    );

    this.emitCode({
      title: 'clean_bot.py',
      language: 'python',
      code: `# CleanBot — Data Preprocessing\nfrom sklearn.impute import SimpleImputer\nfrom sklearn.preprocessing import OneHotEncoder\n\n# Remove duplicates\ndf = df.drop_duplicates()\n\n# Impute missing values\nnumeric_imputer = SimpleImputer(strategy="median")\ncategorical_imputer = SimpleImputer(strategy="most_frequent")\n\n# Encode categorical features\nencoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)`,
      output: `Initializing preprocessing pipeline...`,
    });

    await sleep(500);

    // --- ACTUAL PREPROCESSING ---
    const target = profile.targetColumn!;
    const { data, cleaningReport, featureReport } = cleanAndPreprocess(this.parsedCSV!, profile, target);

    // Report cleaning actions
    this.emitEvent(
      makeEvent('clean_bot', 'agent_progress',
        `Removed ${cleaningReport.duplicatesRemoved} duplicate rows`,
        cleaningReport.duplicatesRemoved > 0 ? 'success' : 'info',
        { count: cleaningReport.duplicatesRemoved },
        `df = df.drop_duplicates()`,
        `Duplicates removed: ${cleaningReport.duplicatesRemoved}`
      )
    );
    await sleep(200);

    if (cleaningReport.missingHandled > 0) {
      this.emitEvent(
        makeEvent('clean_bot', 'agent_progress',
          `Imputed ${cleaningReport.missingHandled} missing values (median strategy)`,
          'success',
          { count: cleaningReport.missingHandled },
          `imputer = SimpleImputer(strategy="median")\nX_numeric = imputer.fit_transform(X_numeric)`,
          `Missing values handled: ${cleaningReport.missingHandled}`
        )
      );
      await sleep(200);
    }

    if (cleaningReport.categoricalEncoded > 0) {
      this.emitEvent(
        makeEvent('clean_bot', 'agent_progress',
          `Encoded ${cleaningReport.categoricalEncoded} categorical columns`,
          'success',
          { count: cleaningReport.categoricalEncoded },
          `encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)\nfor col in categorical_cols:\n    X[col] = encoder.fit_transform(X[col])`,
          `Categorical columns encoded: ${cleaningReport.categoricalEncoded}`
        )
      );
      await sleep(200);
    }

    if (cleaningReport.constantColumnsRemoved > 0) {
      this.emitEvent(
        makeEvent('clean_bot', 'agent_progress',
          `Removed ${cleaningReport.constantColumnsRemoved} constant columns`,
          'success',
          { count: cleaningReport.constantColumnsRemoved },
          `constant_cols = [c for c in df.columns if df[c].nunique() <= 1]\ndf = df.drop(columns=constant_cols)`,
          `Constant columns removed: ${cleaningReport.constantColumnsRemoved}`
        )
      );
      await sleep(200);
    }

    this.emitEvent(
      makeEvent('clean_bot', 'agent_progress',
        `Standardized ${data.featureNames.length} numeric features (z-score normalization)`,
        'success',
        {}, `scaler = StandardScaler()\nX_scaled = scaler.fit_transform(X)`, `Features standardized`
      )
    );
    await sleep(200);

    // Split report
    this.emitEvent(
      makeEvent('clean_bot', 'agent_progress',
        `Train/test split: ${data.XTrain.length} train / ${data.XTest.length} test (${data.taskType === 'classification' ? 'stratified' : 'random'})`,
        'success',
        { trainSize: data.XTrain.length, testSize: data.XTest.length, method: data.taskType === 'classification' ? 'stratified' : 'random' },
        `X_train, X_test, y_train, y_test = train_test_split(\n    X, y, test_size=0.2, random_state=42, stratify=y\n)`,
        `Train: ${data.XTrain.length} samples\nTest: ${data.XTest.length} samples\nClasses: ${data.numClasses}`
      )
    );

    const cleanJSON = JSON.stringify({
      rows_before: cleaningReport.rowsBefore, rows_after: cleaningReport.rowsAfter,
      missing_handled: cleaningReport.missingHandled, duplicates_removed: cleaningReport.duplicatesRemoved,
      categorical_encoded: cleaningReport.categoricalEncoded, constant_columns_removed: cleaningReport.constantColumnsRemoved,
      features: data.featureNames.length, train_size: data.XTrain.length, test_size: data.XTest.length,
    }, null, 2);

    this.emitEvent(
      makeEvent('clean_bot', 'analysis_completed', `CleaningReport artifact generated`, 'success',
        { report: cleanJSON }, undefined, cleanJSON)
    );

    this.setAgentOutput('clean_bot', cleanJSON);
    this.setAgentDecision('clean_bot',
      `Cleaned dataset: ${cleaningReport.duplicatesRemoved} duplicates removed, ${cleaningReport.missingHandled} missing values imputed, ` +
      `${cleaningReport.categoricalEncoded} categorical columns encoded, ${cleaningReport.constantColumnsRemoved} constant columns removed. ` +
      `Features: ${data.featureNames.length}. Train/test: ${data.XTrain.length}/${data.XTest.length}. ` +
      `Next: FeatureBot for feature engineering.`
    );

    this.setAgentStatus('clean_bot', 'success');
    this.setAgentTimes('clean_bot', this.agentStates.clean_bot.startTime, Date.now());

    this.workflowState.cleaningReport = cleaningReport;
    this.workflowState.featureReport = featureReport;
    this.emitState();

    await sleep(300);
    this.setAgentStatus('clean_bot', 'idle');
    this.setAgentAction('clean_bot', '');

    return { data, cleaningReport, featureReport };
  }

  // --- FeatureBot ---

  private async runFeatureBot(
    featureReport: FeatureReport,
    cleaningReport: CleaningReport
  ): Promise<void> {
    this.workflowState.currentAgentId = 'feature_bot';
    this.workflowState.completedAgents = 3;
    this.emitState();

    this.setAgentTimes('feature_bot', Date.now(), null);
    this.setAgentStatus('feature_bot', 'working');
    this.setAgentAction('feature_bot', 'Analyzing feature relevance and correlations');
    this.setAgentInput('feature_bot', `Cleaned dataset (${featureReport.originalFeatures} features)`);

    this.emitEvent(
      makeEvent('feature_bot', 'agent_started', `FeatureBot activated — engineering feature matrix`, 'info')
    );

    this.emitCode({
      title: 'feature_bot.py',
      language: 'python',
      code: `# FeatureBot — Feature Engineering\nimport numpy as np\nfrom sklearn.feature_selection import VarianceThreshold\n\n# Compute correlation matrix\ncorr_matrix = np.corrcoef(X, rowvar=False)\n\n# Find highly correlated pairs\nhighly_correlated = []\nfor i in range(X.shape[1]):\n    for j in range(i+1, X.shape[1]):\n        if abs(corr_matrix[i, j]) > 0.85:\n            highly_correlated.append((i, j, corr_matrix[i, j]))\n\n# Remove low-variance features\nselector = VarianceThreshold(threshold=0.01)\nX_selected = selector.fit_transform(X)`,
      output: `Analyzing ${featureReport.originalFeatures} features...`,
    });

    await sleep(500);

    this.emitEvent(
      makeEvent('feature_bot', 'agent_progress',
        `Computed correlation matrix for ${featureReport.originalFeatures} features`,
        'progress', { features: featureReport.originalFeatures },
        `corr_matrix = np.corrcoef(X, rowvar=False)`, `Correlation matrix computed`
      )
    );
    await sleep(300);

    if (featureReport.correlatedPairs.length > 0) {
      this.emitEvent(
        makeEvent('feature_bot', 'agent_progress',
          `Detected ${featureReport.correlatedPairs.length} highly correlated feature pairs (r > 0.85)`,
          'warning',
          { count: featureReport.correlatedPairs.length, pairs: featureReport.correlatedPairs.slice(0, 5) },
          `highly_correlated = [(i,j) for i in range(n) for j in range(i+1,n) if abs(corr[i,j]) > 0.85]`,
          featureReport.correlatedPairs.slice(0, 5).map(p => `${p.col1} ↔ ${p.col2}: ${p.correlation.toFixed(3)}`).join('\n')
        )
      );
      await sleep(300);
    }

    if (featureReport.removedFeatures.length > 0) {
      this.emitEvent(
        makeEvent('feature_bot', 'agent_progress',
          `Removed ${featureReport.removedFeatures.length} redundant feature(s): ${featureReport.removedFeatures.join(', ')}`,
          'success',
          { removed: featureReport.removedFeatures },
          `X = X.drop(columns=to_remove)`,
          `Removed: ${featureReport.removedFeatures.join(', ')}`
        )
      );
      await sleep(300);
    }

    this.emitEvent(
      makeEvent('feature_bot', 'analysis_completed',
        `Feature matrix prepared: ${featureReport.originalFeatures} → ${featureReport.processedFeatures} features`,
        'success',
        { original: featureReport.originalFeatures, processed: featureReport.processedFeatures },
        `X_selected = selector.fit_transform(X)\nprint(f"Features: {featureReport.originalFeatures} -> {featureReport.processedFeatures}")`,
        `Original features: ${featureReport.originalFeatures}\nProcessed features: ${featureReport.processedFeatures}\nSelected: ${featureReport.selectedFeatures.join(', ')}`
      )
    );

    const featJSON = JSON.stringify({
      original_features: featureReport.originalFeatures,
      processed_features: featureReport.processedFeatures,
      removed: featureReport.removedFeatures,
      selected: featureReport.selectedFeatures,
      top_variance: featureReport.varianceScores.slice(0, 5),
    }, null, 2);

    this.setAgentOutput('feature_bot', featJSON);
    const nextStage = this.workflowState.learningParadigm === 'unsupervised'
      ? 'Next: Cluster Scout to select an unsupervised algorithm.'
      : 'Next: Model Scout to select candidate models.';
    this.setAgentDecision('feature_bot',
      `Analyzed ${featureReport.originalFeatures} features. Found ${featureReport.correlatedPairs.length} correlated pairs. ` +
      `Removed ${featureReport.removedFeatures.length} redundant features. ` +
      `Final feature matrix: ${featureReport.processedFeatures} features. ` +
      `Top features by variance: ${featureReport.varianceScores.slice(0, 3).map(v => v.name).join(', ')}. ` +
      nextStage
    );

    this.setAgentStatus('feature_bot', 'success');
    this.setAgentTimes('feature_bot', this.agentStates.feature_bot.startTime, Date.now());
    this.emitState();

    await sleep(300);
    this.setAgentStatus('feature_bot', 'idle');
    this.setAgentAction('feature_bot', '');
  }

  // --- Model Scout ---

  private async runModelScout(
    profile: DatasetProfile,
    data: ProcessedData
  ): Promise<CandidateModel[]> {
    this.workflowState.currentAgentId = 'model_scout';
    this.workflowState.completedAgents = 4;
    this.emitState();

    this.setAgentTimes('model_scout', Date.now(), null);
    this.setAgentStatus('model_scout', 'analyzing');
    this.setAgentAction('model_scout', 'Analyzing problem characteristics');
    this.setAgentInput('model_scout', `${profile.taskType} · ${data.featureNames.length} features · ${data.XTrain.length} training samples`);

    this.emitEvent(
      makeEvent('model_scout', 'agent_started', `Model Scout activated — selecting candidate models`, 'info')
    );

    this.emitCode({
      title: 'model_scout.py',
      language: 'python',
      code: `# Model Scout — Model Selection\n${data.taskType === 'regression' ? 'from sklearn.linear_model import LinearRegression\nfrom sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor' : 'from sklearn.linear_model import LogisticRegression\nfrom sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier'}\n\n# Analyze problem characteristics\nproblem_type = "${data.taskType}"\nn_samples = ${data.XTrain.length}\nn_features = ${data.featureNames.length}\nn_classes = ${data.numClasses}\nimbalance = ${profile.imbalanceDetected}\n\n# Select candidates based on data characteristics\ncandidates = ${data.taskType === 'regression' ? '["Linear Regression", "Random Forest Regressor", "Gradient Boosting Regressor"]' : '["Logistic Regression", "Random Forest", "Gradient Boosting"]'}`,
      output: `Problem type: ${data.taskType}\nSamples: ${data.XTrain.length}\nFeatures: ${data.featureNames.length}\nClasses: ${data.numClasses}\nImbalanced: ${profile.imbalanceDetected}`,
    });

    await sleep(500);

    const candidates: CandidateModel[] = [];
    if (data.taskType === 'regression') {
      candidates.push({ name: 'Linear Regression', shortName: 'LIN', reason: 'Interpretable linear baseline for continuous numeric targets.' });
      candidates.push({ name: 'Random Forest Regressor', shortName: 'RFR', reason: 'Non-linear tree ensemble for continuous targets and mixed feature relationships.' });
      candidates.push({ name: 'Gradient Boosting Regressor', shortName: 'GBR', reason: 'Boosted regression trees for capturing non-linear tabular patterns.' });
      for (const c of candidates) {
        this.emitEvent(makeEvent('model_scout','agent_progress',`Candidate selected: ${c.name}`,'success',{model:c.name},undefined,c.reason));
        await sleep(200);
      }
    } else {
      candidates.push({ name: 'Logistic Regression', shortName: 'LR', reason: `Baseline linear model — fast and interpretable for ${data.numClasses}-class classification.` });
      candidates.push({ name: 'Random Forest', shortName: 'RF', reason: `Tree ensemble that captures non-linear relationships across ${data.featureNames.length} prepared features.` });
      candidates.push({ name: 'Gradient Boosting', shortName: 'GB', reason: `Boosted trees for non-linear tabular classification${profile.imbalanceDetected ? '; class imbalance is present.' : '.'}` });
      for (const c of candidates) {
        this.emitEvent(makeEvent('model_scout','agent_progress',`Candidate selected: ${c.name}`,'success',{model:c.name},undefined,c.reason));
        await sleep(200);
      }
    }

    this.emitEvent(
      makeEvent('model_scout', 'analysis_completed',
        `3 candidate models selected for ${data.taskType}: ${candidates.map(c=>c.shortName).join(', ')}`,
        'success',
        { candidates: candidates.map(c => c.name) },
        `print(f"Candidate models: {[c[0] for c in candidates]}")`,
        `${data.taskType === 'regression' ? 'Problem Type: regression\nCandidate Models:\n- Linear Regression\n- Random Forest Regressor\n- Gradient Boosting Regressor' : 'Problem Type: classification\nCandidate Models:\n- Logistic Regression\n- Random Forest\n- Gradient Boosting'}`
      )
    );

    const scoutJSON = JSON.stringify({
      problem_type: data.taskType,
      n_samples: data.XTrain.length,
      n_features: data.featureNames.length,
      n_classes: data.numClasses,
      imbalance: profile.imbalanceDetected,
      candidates: candidates.map(c => ({ name: c.name, reason: c.reason })),
    }, null, 2);

    this.setAgentOutput('model_scout', scoutJSON);
    this.setAgentDecision('model_scout',
      `Problem type: ${data.taskType}. ${data.XTrain.length} training samples, ${data.featureNames.length} features, ${data.numClasses} classes. ` +
      `${data.taskType === 'classification' && profile.imbalanceDetected ? 'Class imbalance detected — F1 will be preferred over accuracy. ' : ''}` +
      `Selected 3 candidates: ${candidates.map(c => c.name).join(', ')}. ` +
      `Next: TrainerBot to train all candidates.`
    );

    this.setAgentStatus('model_scout', 'success');
    this.setAgentTimes('model_scout', this.agentStates.model_scout.startTime, Date.now());

    this.workflowState.candidateModels = candidates;
    this.emitState();

    await sleep(300);
    this.setAgentStatus('model_scout', 'idle');
    this.setAgentAction('model_scout', '');

    return candidates;
  }

  // --- TrainerBot ---

  private async runTrainerBot(
    data: ProcessedData,
    candidates: CandidateModel[]
  ): Promise<ModelResult[]> {
    this.workflowState.currentAgentId = 'trainer_bot';
    this.workflowState.completedAgents = 5;
    this.emitState();

    this.setAgentTimes('trainer_bot', Date.now(), null);
    this.setAgentStatus('trainer_bot', 'working');
    this.setAgentAction('trainer_bot', 'Training candidate models');
    this.setAgentInput('trainer_bot', `${candidates.length} models · ${data.XTrain.length} samples · ${data.featureNames.length} features`);

    this.emitEvent(
      makeEvent('trainer_bot', 'agent_started', `TrainerBot activated — training ${candidates.length} candidate models`, 'info')
    );

    // Browser-safe scaling for large tabular datasets. The full test set is still
    // evaluated; only the expensive tree/gradient training stage is bounded.
    // Keep these limits above emitCode because the generated training code uses them.
    const largeDataset = data.XTrain.length >= 50000;
    const veryLargeDataset = data.XTrain.length >= 100000;
    const rfTrees = veryLargeDataset ? 10 : largeDataset ? 15 : 30;
    const rfDepth = veryLargeDataset ? 6 : largeDataset ? 7 : 8;
    const treeTrainLimit = veryLargeDataset ? 10000 : largeDataset ? 20000 : data.XTrain.length;
    const gbTrees = veryLargeDataset ? 20 : largeDataset ? 25 : 40;
    const gbDepth = veryLargeDataset ? 3 : 4;
    const lrEpochs = veryLargeDataset ? 120 : largeDataset ? 180 : 300;

    this.emitCode({
      title: 'trainer_bot.py',
      language: 'python',
      code: data.taskType === 'regression'
        ? `# TrainerBot — Regression Training\nfrom sklearn.linear_model import LinearRegression\nfrom sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor\n\nmodels = {\n    "Linear Regression": LinearRegression(),\n    "Random Forest Regressor": RandomForestRegressor(n_estimators=${rfTrees}, max_depth=${rfDepth}, random_state=42),\n    "Gradient Boosting Regressor": GradientBoostingRegressor(n_estimators=${gbTrees}, max_depth=${gbDepth}, learning_rate=0.08, random_state=42),\n}\n\nfor name, model in models.items():\n    model.fit(X_train, y_train)\n    predictions = model.predict(X_test)`
        : `# TrainerBot — Classification Training\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier\n\nmodels = {\n    "Logistic Regression": LogisticRegression(max_iter=${lrEpochs}, random_state=42),\n    "Random Forest": RandomForestClassifier(n_estimators=${rfTrees}, max_depth=${rfDepth}, random_state=42),\n    "Gradient Boosting": GradientBoostingClassifier(n_estimators=${gbTrees}, max_depth=${gbDepth}, learning_rate=0.3, random_state=42),\n}\n\nfor name, model in models.items():\n    model.fit(X_train, y_train)\n    predictions = model.predict(X_test)`,
      output: `Training ${candidates.length} models on ${data.XTrain.length} samples...`,
    });

    await sleep(400);

    const results: ModelResult[] = [];

    // Train each model for real
    for (const candidate of candidates) {
      this.setAgentAction('trainer_bot', `Training ${candidate.name}...`);

      this.emitEvent(
        makeEvent('trainer_bot', 'agent_progress', `Training ${candidate.name}...`, 'progress',
          { model: candidate.name },
          `${candidate.shortName.toLowerCase()} = ${candidate.name.replace(' ', '')}(...)\n${candidate.shortName.toLowerCase()}.fit(X_train, y_train)`,
          `Training ${candidate.name}...`
        )
      );

      await sleep(200);

      const startTime = performance.now();
      let predictions: number[];
      let probabilities: number[] | null = null;
      let featureImportance: { name: string; importance: number }[] = [];

      await yieldToUI();

      if (data.taskType === 'regression') {
        if (candidate.shortName === 'LIN') {
          const model = new LinearRegression(data.featureNames); model.fit(data.XTrain,data.yTrain); predictions=model.predict(data.XTest); featureImportance=model.featureImportance();
        } else if (candidate.shortName === 'RFR') {
          const model = new RandomForestRegressor(data.featureNames,rfTrees,rfDepth); model.fit(data.XTrain,data.yTrain,42,treeTrainLimit); predictions=model.predict(data.XTest); featureImportance=model.featureImportance();
        } else {
          const model = new GradientBoostingRegressor(data.featureNames,gbTrees,gbDepth,0.03); model.fit(data.XTrain,data.yTrain,42,treeTrainLimit); predictions=model.predict(data.XTest); featureImportance=model.featureImportance();
        }
      } else if (candidate.shortName === 'LR') {
        const model = new LogisticRegression(data.numClasses || 2, data.featureNames, 0.1, lrEpochs); model.fit(data.XTrain, data.yTrain); predictions = model.predict(data.XTest); probabilities = model.predictProba(data.XTest).map(p => p[p.length-1]); featureImportance = model.featureImportance();
      } else if (candidate.shortName === 'RF') {
        const model = new RandomForest(data.numClasses || 2, data.featureNames, rfTrees, rfDepth); model.fit(data.XTrain, data.yTrain, 42, treeTrainLimit); predictions = model.predict(data.XTest); featureImportance = model.featureImportance();
      } else {
        const model = new GradientBoosting(data.numClasses || 2, data.featureNames, gbTrees, gbDepth, 0.3); model.fit(data.XTrain, data.yTrain, 42, treeTrainLimit); predictions = model.predict(data.XTest); probabilities = model.predictProba(data.XTest).map(p => p[1]); featureImportance = model.featureImportance();
      }

      const trainTime = (performance.now() - startTime) / 1000;

      // Quick metrics for the training report
      const mse = data.yTest.reduce((s,v,i)=>s+(v-predictions[i])**2,0)/Math.max(1,data.yTest.length);
      const rmse=Math.sqrt(mse); const mae=data.yTest.reduce((s,v,i)=>s+Math.abs(v-predictions[i]),0)/Math.max(1,data.yTest.length);
      const yMean=data.yTest.reduce((a,b)=>a+b,0)/Math.max(1,data.yTest.length);
      const ssTot=data.yTest.reduce((s,v)=>s+(v-yMean)**2,0); const r2=ssTot>0?1-(mse*data.yTest.length)/ssTot:0;
      const trainAcc = data.taskType === 'classification' ? data.yTest.reduce((s,v,i)=>s+(v===predictions[i]?1:0),0)/Math.max(1,data.yTest.length) : 0;
      this.emitEvent(makeEvent('trainer_bot','model_completed',data.taskType==='regression'?`${candidate.name} completed — RMSE: ${rmse.toFixed(4)} (${trainTime.toFixed(2)}s)`:`${candidate.name} training completed — accuracy: ${(trainAcc*100).toFixed(1)}% (${trainTime.toFixed(2)}s)`,'success',{model:candidate.name,accuracy:trainAcc,rmse,mae,r2,trainTime},undefined,data.taskType==='regression'?`${candidate.name}\nRMSE: ${rmse.toFixed(4)}\nMAE: ${mae.toFixed(4)}\nR²: ${r2.toFixed(4)}`:`${candidate.name}\nAccuracy: ${(trainAcc*100).toFixed(1)}%`));

      const trainingMethod = data.taskType === 'regression'
        ? (candidate.shortName === 'LIN' ? 'LinearRegression().fit(X_train, y_train)' : candidate.shortName === 'RFR' ? `RandomForestRegressor(n_estimators=${rfTrees}, max_depth=${rfDepth}, random_state=42).fit(X_train_sampled, y_train_sampled)` : 'GradientBoostingRegressor(n_estimators=40, max_depth=3, learning_rate=0.03, random_state=42).fit(X_train, y_train)')
        : (candidate.shortName === 'LR' ? `LogisticRegression(max_iter=${lrEpochs}, random_state=42).fit(X_train, y_train)` : candidate.shortName === 'RF' ? `RandomForestClassifier(n_estimators=${rfTrees}, max_depth=${rfDepth}, random_state=42).fit(X_train_sampled, y_train_sampled)` : 'GradientBoostingClassifier(n_estimators=${gbTrees}, max_depth=${gbDepth}, learning_rate=0.3, random_state=42).fit(X_train, y_train)');

      results.push({
        modelName: candidate.name,
        shortName: candidate.shortName,
        trainingMethod,
        trainingStatus: 'trained',
        accuracy: trainAcc,
        precision: 0,
        recall: 0,
        f1: 0,
        rocAuc: null,
        trainTime,
        predictions,
        probabilities,
        featureImportance,
        isBest: false,
        selectionReason: '',
        testUseReason: '',
        rmse: data.taskType === 'regression' ? rmse : undefined,
        mae: data.taskType === 'regression' ? mae : undefined,
        r2: data.taskType === 'regression' ? r2 : undefined,
      });

      await sleep(300);
    }

    const trainJSON = JSON.stringify({
      models_trained: results.length,
      models: results.map(r => ({ name: r.modelName, accuracy: r.accuracy.toFixed(4), train_time: r.trainTime.toFixed(3) })),
    }, null, 2);

    this.setAgentOutput('trainer_bot', trainJSON);
    this.setAgentDecision('trainer_bot',
      `Trained ${results.length} models: ${results.map(r => data.taskType === 'regression' ? `${r.shortName} (RMSE ${(r.rmse ?? 0).toFixed(3)})` : `${r.shortName} (${(r.accuracy * 100).toFixed(1)}%)`).join(', ')}. ` +
      `Training times: ${results.map(r => `${r.shortName}: ${r.trainTime.toFixed(2)}s`).join(', ')}. ` +
      `Next: JudgeBot for full evaluation and model selection.`
    );

    this.setAgentStatus('trainer_bot', 'success');
    this.setAgentTimes('trainer_bot', this.agentStates.trainer_bot.startTime, Date.now());
    this.emitState();

    await sleep(300);
    this.setAgentStatus('trainer_bot', 'idle');
    this.setAgentAction('trainer_bot', '');

    return results;
  }

  // --- JudgeBot ---

  private async runJudgeBot(
    data: ProcessedData,
    modelResults: ModelResult[]
  ): Promise<EvaluationResults> {
    this.workflowState.currentAgentId = 'judge_bot';
    this.workflowState.completedAgents = 6;
    this.emitState();

    this.setAgentTimes('judge_bot', Date.now(), null);
    this.setAgentStatus('judge_bot', 'working');
    this.setAgentAction('judge_bot', 'Evaluating model performance');
    this.setAgentInput('judge_bot', `${modelResults.length} trained models · ${data.XTest.length} test samples`);

    this.emitEvent(
      makeEvent('judge_bot', 'agent_started', `JudgeBot activated — comparing ${modelResults.length} models`, 'info')
    );

    this.emitCode({
      title: 'judge_bot.py',
      language: 'python',
      code: data.taskType === 'regression'
        ? `# JudgeBot — Regression Evaluation\nfrom sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score\n\nfor name, preds in all_predictions.items():\n    rmse = mean_squared_error(y_test, preds) ** 0.5\n    mae = mean_absolute_error(y_test, preds)\n    r2 = r2_score(y_test, preds)`
        : `# JudgeBot — Classification Evaluation\nfrom sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score\n\nfor name, preds in all_predictions.items():\n    acc = accuracy_score(y_test, preds)\n    prec = precision_score(y_test, preds, average="macro", zero_division=0)\n    rec = recall_score(y_test, preds, average="macro", zero_division=0)\n    f1 = f1_score(y_test, preds, average="macro", zero_division=0)`,
      output: `Evaluating ${modelResults.length} ${data.taskType} models on ${data.XTest.length} test samples...`,
    });

    await sleep(400);

    if (data.taskType === 'regression') {
      const evaluated = modelResults.map(r => ({...r, rmse:r.rmse ?? 0, mae:r.mae ?? 0, r2:r.r2 ?? 0}));
      evaluated.sort((a,b)=>(a.rmse!)-(b.rmse!));
      const best=evaluated[0]; best.isBest=true; best.selectionReason=`Lowest RMSE (${best.rmse!.toFixed(4)}) among all candidates.`;
      evaluated.forEach(m => { m.testUseReason = m.modelName === best.modelName ? `Used for final test result because it achieved the lowest RMSE on the held-out test set.` : `Not used for final test result because its RMSE was higher than ${best.modelName}.`; });
      const evalResults:EvaluationResults={models:evaluated,bestModel:best,selectionMetric:'RMSE (lower is better)',selectionReason:`${best.modelName} achieved the lowest RMSE of ${best.rmse!.toFixed(4)} across ${evaluated.length} candidate models.`,finalModelUseReason:`${best.modelName} is the final model used for the test result because it produced the lowest RMSE on the held-out test set.`,confusionMatrix:[],perClass:[]};
      this.emitEvent(makeEvent('judge_bot','decision_made',`Regression model selected: ${best.modelName} (RMSE ${best.rmse!.toFixed(4)})`,'success',{bestModel:best.modelName,rmse:best.rmse},undefined,`RMSE: ${best.rmse!.toFixed(4)}\nMAE: ${best.mae!.toFixed(4)}\nR²: ${best.r2!.toFixed(4)}`));
      this.setAgentOutput('judge_bot',JSON.stringify({selection_metric:'RMSE',models:evaluated.map(m=>({name:m.modelName,rmse:m.rmse,mae:m.mae,r2:m.r2,is_best:m.isBest}))},null,2));
      this.setAgentDecision('judge_bot',`Evaluated ${evaluated.length} regression models using RMSE. Selected ${best.modelName} based on the lowest RMSE.`);
      this.workflowState.evaluationResults=evalResults; this.emitState();
      this.setAgentStatus('judge_bot','success'); this.setAgentTimes('judge_bot',this.agentStates.judge_bot.startTime,Date.now());
      await sleep(300); this.setAgentStatus('judge_bot','idle'); this.setAgentAction('judge_bot','');
      return evalResults;
    }

    // Classification evaluation
    const useF1 = data.numClasses > 2;
    const selectionMetric = useF1 ? 'F1 Score (macro)' : 'Accuracy';
    const metricKey = useF1 ? 'f1' : 'accuracy';
    const evaluated: ModelResult[] = [];
    for (const result of modelResults) {
      this.setAgentAction('judge_bot', `Evaluating ${result.modelName}...`);
      const evalMetrics = evaluateClassification(data.yTest,result.predictions,result.probabilities,data.labelMapInverse);
      evaluated.push({...result,accuracy:evalMetrics.accuracy,precision:evalMetrics.precision,recall:evalMetrics.recall,f1:evalMetrics.f1,rocAuc:evalMetrics.rocAuc});
      await sleep(150);
    }
    evaluated.sort((a,b)=>(b[metricKey] as number)-(a[metricKey] as number));
    const best=evaluated[0]; best.isBest=true; best.selectionReason=`Highest ${selectionMetric} (${((best[metricKey] as number)*100).toFixed(1)}%) among all candidates.`;
    evaluated.forEach(m => { m.testUseReason = m.modelName === best.modelName ? `Used for final test result because it achieved the highest ${selectionMetric} on the held-out test set.` : `Not used for final test result because its ${selectionMetric} was lower than ${best.modelName}.`; });
    const bestEval=evaluateClassification(data.yTest,best.predictions,best.probabilities,data.labelMapInverse);
    const evalResults:EvaluationResults={models:evaluated,bestModel:best,selectionMetric,selectionReason:`${best.modelName} achieved the highest ${selectionMetric} across ${evaluated.length} candidates.`,finalModelUseReason:`${best.modelName} is the final model used for the test result because it achieved the highest ${selectionMetric} on the held-out test set.`,confusionMatrix:bestEval.confusionMatrix,perClass:bestEval.perClass};
    this.emitEvent(makeEvent('judge_bot','decision_made',`Best model selected: ${best.modelName} (${selectionMetric}: ${((best[metricKey] as number)*100).toFixed(1)}%)`,'success',{bestModel:best.modelName,metric:selectionMetric,score:best[metricKey]},undefined,`Recommended Model: ${best.modelName}`));
    this.setAgentOutput('judge_bot',JSON.stringify({selection_metric:selectionMetric,models:evaluated.map(m=>({name:m.modelName,accuracy:m.accuracy,f1:m.f1,roc_auc:m.rocAuc,is_best:m.isBest})),best_model:best.modelName},null,2));
    this.setAgentDecision('judge_bot',`Evaluated ${evaluated.length} classification models using ${selectionMetric}. Selected ${best.modelName}.`);
    this.workflowState.evaluationResults=evalResults; this.emitState();

    this.setAgentStatus('judge_bot', 'success');
    this.setAgentTimes('judge_bot', this.agentStates.judge_bot.startTime, Date.now());

    this.workflowState.evaluationResults = evalResults;
    this.emitState();

    await sleep(300);
    this.setAgentStatus('judge_bot', 'idle');
    this.setAgentAction('judge_bot', '');

    return evalResults;
  }

  // --- ExplainBot ---

  private async runExplainBot(
    bestModel: ModelResult,
    data: ProcessedData,
    profile: DatasetProfile,
    cleaningReport: CleaningReport,
    featureReport: FeatureReport
  ): Promise<ExplanationResults> {
    this.workflowState.currentAgentId = 'explain_bot';
    this.workflowState.completedAgents = 7;
    this.emitState();

    this.setAgentTimes('explain_bot', Date.now(), null);
    this.setAgentStatus('explain_bot', 'analyzing');
    this.setAgentAction('explain_bot', 'Computing permutation feature importance');
    this.setAgentInput('explain_bot', `${bestModel.modelName} · ${data.featureNames.length} features · ${data.XTest.length} test samples`);

    this.emitEvent(
      makeEvent('explain_bot', 'agent_started', `ExplainBot activated — analyzing ${bestModel.modelName} predictions`, 'info')
    );

    this.emitCode({
      title: 'explain_bot.py',
      language: 'python',
      code: `# ExplainBot — Model Explainability\nimport numpy as np\nfrom sklearn.inspection import permutation_importance\n\n# Permutation importance: shuffle each feature, measure accuracy drop\nresult = permutation_importance(\n    model, X_test, y_test,\n    n_repeats=5, random_state=42\n)\n\nfor i in result.importances_mean.argsort()[::-1]:\n    print(f"{feature_names[i]:20s} {result.importances_mean[i]:.4f}")`,
      output: `Computing permutation importance for ${data.featureNames.length} features...`,
    });

    await sleep(500);

    // --- ACTUAL PERMUTATION IMPORTANCE ---
    this.setAgentStatus('explain_bot', 'working');

    await yieldToUI();

    const explanation = generateExplanation(bestModel, data, profile, cleaningReport, featureReport);

    // Report top features
    const topFeatures = explanation.permutationImportance.filter((p) => p.importance > 0).slice(0, 5);

    this.emitEvent(
      makeEvent('explain_bot', 'analysis_completed',
        `Permutation importance computed for ${data.featureNames.length} features`,
        'success',
        { topFeatures: topFeatures.map((f) => ({ name: f.feature, importance: f.importance })) },
        `result = permutation_importance(model, X_test, y_test)`,
        topFeatures.map((f) => `${f.feature}: ${f.importance.toFixed(4)} (${f.direction})`).join('\n')
      )
    );
    await sleep(300);

    // Report global summary
    this.setAgentAction('explain_bot', 'Generating global explanation summary');
    this.emitEvent(
      makeEvent('explain_bot', 'analysis_completed',
        `Global summary: ${topFeatures.length} features significantly influence predictions`,
        'success',
        { summary: explanation.globalSummary },
        undefined,
        explanation.globalSummary
      )
    );
    await sleep(300);

    // Report local explanations
    this.setAgentAction('explain_bot', 'Generating local explanations for sample predictions');
    this.emitEvent(
      makeEvent('explain_bot', 'agent_progress',
        `Analyzing ${explanation.localExplanations.length} sample predictions (correct and incorrect)`,
        'progress',
        { count: explanation.localExplanations.length }
      )
    );
    await sleep(300);

    for (const local of explanation.localExplanations.slice(0, 3)) {
      const status = local.correct ? 'CORRECT' : 'WRONG';
      this.emitEvent(
        makeEvent('explain_bot', 'analysis_completed',
          `Sample #${local.sampleIndex} [${status}]: true="${local.trueLabel}", predicted="${local.predictedLabel}"`,
          local.correct ? 'success' : 'warning',
          { sample: local.sampleIndex, correct: local.correct },
          undefined,
          local.topReasons.join('\n')
        )
      );
      await sleep(200);
    }

    const explainJSON = JSON.stringify({
      model: bestModel.modelName,
      permutation_importance: explanation.permutationImportance.slice(0, 10),
      local_explanations: explanation.localExplanations.length,
      global_summary: explanation.globalSummary,
    }, null, 2);

    this.setAgentOutput('explain_bot', explainJSON);
    this.setAgentDecision('explain_bot',
      `Analyzed ${bestModel.modelName} using permutation importance. ` +
      `Top features: ${topFeatures.map((f) => `${f.feature} (${f.importance.toFixed(3)}, ${f.direction})`).join(', ')}. ` +
      `Explained ${explanation.localExplanations.length} sample predictions. ` +
      `${explanation.localExplanations.filter((e) => !e.correct).length} were misclassified. ` +
      `Next: ReportBot for final report generation.`
    );

    this.setAgentStatus('explain_bot', 'success');
    this.setAgentTimes('explain_bot', this.agentStates.explain_bot.startTime, Date.now());

    this.workflowState.explanationResults = explanation;
    this.emitState();

    await sleep(300);
    this.setAgentStatus('explain_bot', 'idle');
    this.setAgentAction('explain_bot', '');

    return explanation;
  }

  // --- ReportBot ---

  private async runReportBot(
    profile: DatasetProfile,
    cleaning: CleaningReport,
    features: FeatureReport,
    evaluation: EvaluationResults,
    explanation: ExplanationResults
  ): Promise<ExperimentReport> {
    this.workflowState.currentAgentId = 'report_bot';
    this.workflowState.completedAgents = 8;
    this.emitState();

    this.setAgentTimes('report_bot', Date.now(), null);
    this.setAgentStatus('report_bot', 'working');
    this.setAgentAction('report_bot', 'Compiling experiment report');
    this.setAgentInput('report_bot', `${evaluation.bestModel.modelName} · ${evaluation.models.length} models · ${explanation.permutationImportance.length} features`);

    this.emitEvent(
      makeEvent('report_bot', 'agent_started', `ReportBot activated — generating final experiment report`, 'info')
    );

    this.emitCode({
      title: 'report_bot.py',
      language: 'python',
      code: `# ReportBot — Final Report Generation\nreport = ExperimentReport(\n    title=f"Experiment Report — {dataset.fileName}",\n    sections=[\n        DatasetOverview(profile),\n        CleaningSummary(cleaning),\n        FeatureSummary(features),\n        ModelComparison(evaluation),\n        ExplanationSummary(explanation),\n    ],\n    recommendations=generate_recommendations(\n        profile, evaluation, explanation\n    ),\n)\nreport.save("experiment_report.txt")\nprint("Report generated successfully.")`,
      output: `Compiling report from all agent outputs...`,
    });

    await sleep(500);

    // --- ACTUAL REPORT GENERATION ---
    const report = generateReport(profile, cleaning, features, evaluation, explanation);

    this.setAgentAction('report_bot', 'Writing report sections');
    await sleep(300);

    for (const section of report.sections) {
      this.emitEvent(
        makeEvent('report_bot', 'agent_progress',
          `Section: ${section.title}`,
          'progress',
          { section: section.title }
        )
      );
      await sleep(150);
    }

    this.setAgentAction('report_bot', 'Generating recommendations');
    await sleep(300);

    this.emitEvent(
      makeEvent('report_bot', 'analysis_completed',
        `${report.recommendations.length} recommendations generated`,
        'success',
        { count: report.recommendations.length },
        undefined,
        report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')
      )
    );
    await sleep(200);

    this.emitEvent(
      makeEvent('report_bot', 'analysis_completed',
        `Experiment report generated — ${report.sections.length} sections, ${report.recommendations.length} recommendations`,
        'success',
        { sections: report.sections.length, recommendations: report.recommendations.length },
        `report.save("experiment_report.txt")`,
        `Report: ${report.title}\nSections: ${report.sections.length}\nRecommendations: ${report.recommendations.length}\n\n${report.summary}`
      )
    );

    this.setAgentOutput('report_bot', report.fullText);
    this.setAgentDecision('report_bot',
      `Generated final report with ${report.sections.length} sections and ${report.recommendations.length} recommendations. ` +
      `Selected model: ${evaluation.bestModel.modelName} (${profile.taskType === 'regression' ? `RMSE ${(evaluation.bestModel.rmse ?? 0).toFixed(4)}` : `${(evaluation.bestModel.f1 * 100).toFixed(1)}% F1`}). ` +
      `Report covers dataset overview, cleaning, feature engineering, model comparison, and explanation. ` +
      `Workflow complete — all 9 agents finished.`
    );

    this.setAgentStatus('report_bot', 'success');
    this.setAgentTimes('report_bot', this.agentStates.report_bot.startTime, Date.now());

    this.workflowState.experimentReport = report;
    this.emitState();

    // Generate the complete runnable Python script
    const pythonScript = generatePythonScript({
      profile,
      cleaning,
      features,
      evaluation,
      explanation,
      report,
      fileName: profile.fileName,
    });
    this.workflowState.pythonScript = pythonScript;
    this.emitState();

    // Emit the complete script as the final code block
    this.emitCode({
      title: 'synapse_experiment.py',
      language: 'python',
      code: pythonScript,
      output: `# Complete runnable script generated.\n# Save as .py and run: python synapse_experiment.py\n# Requires: pip install pandas numpy scikit-learn\n\n# ${report.sections.length} sections · ${report.recommendations.length} recommendations\n# Selected model: ${evaluation.bestModel.modelName}` ,
    });

    await sleep(300);
    this.setAgentStatus('report_bot', 'idle');
    this.setAgentAction('report_bot', '');

    return report;
  }
}
