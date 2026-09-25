// ============================================================
// Synapse AI — Agent Definitions
// ============================================================

import type { AgentDefinition, AgentId, AgentState } from '@/types';

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  orchestrator: {
    id: 'orchestrator',
    name: 'Synapse Core',
    role: 'Orchestrator',
    responsibility: 'Manage the complete workflow, maintain global experiment state, route outputs between agents, detect failures, and trigger retries.',
    tools: ['LangGraph State Graph', 'Execution Trace', 'Workflow Router'],
  },
  data_analyst: {
    id: 'data_analyst',
    name: 'Data Analyst',
    role: 'Dataset Analysis',
    responsibility: 'Understand the uploaded dataset: detect rows, columns, data types, missing values, duplicates, target candidates, and generate a structured dataset profile.',
    tools: ['pandas.read_csv()', 'Schema Inspector', 'Missing-Value Statistics', 'Type Detector', 'Target Detector'],
  },
  clean_bot: {
    id: 'clean_bot',
    name: 'CleanBot',
    role: 'Data Cleaning',
    responsibility: 'Handle missing values, remove duplicates, encode categorical features, and produce a clean dataset artifact.',
    tools: ['SimpleImputer', 'OneHotEncoder', 'Duplicate Remover'],
  },
  feature_bot: {
    id: 'feature_bot',
    name: 'FeatureBot',
    role: 'Feature Engineering',
    responsibility: 'Identify irrelevant features, detect correlated features, perform safe feature selection, and create derived features when justified.',
    tools: ['Correlation Matrix', 'Variance Threshold', 'Feature Selector'],
  },
  model_scout: {
    id: 'model_scout',
    name: 'Model Scout',
    role: 'Model Selection',
    responsibility: 'Analyze problem type, dataset size, and feature characteristics to select appropriate candidate ML models.',
    tools: ['Problem Type Analyzer', 'Model Candidate Evaluator'],
  },
  trainer_bot: {
    id: 'trainer_bot',
    name: 'TrainerBot',
    role: 'Model Training',
    responsibility: 'Create train/validation/test splits, apply preprocessing, train candidate models, and record training configuration.',
    tools: ['train_test_split', 'LogisticRegression', 'RandomForest', 'GradientBoosting'],
  },
  judge_bot: {
    id: 'judge_bot',
    name: 'JudgeBot',
    role: 'Evaluation',
    responsibility: 'Compare trained models fairly using accuracy, precision, recall, F1, and ROC-AUC. Select the best model based on task-appropriate metrics.',
    tools: ['accuracy_score', 'precision_score', 'recall_score', 'f1_score', 'roc_auc_score'],
  },
  explain_bot: {
    id: 'explain_bot',
    name: 'ExplainBot',
    role: 'Explainability',
    responsibility: 'Explain why the selected model produces its predictions using permutation feature importance and global feature importance, and understandable language.',
    tools: ['Permutation Importance', 'Feature Importance', 'Summary Plot'],
  },
  report_bot: {
    id: 'report_bot',
    name: 'ReportBot',
    role: 'Report Generation',
    responsibility: 'Convert technical experiment results into a human-readable final report with dataset summary, model comparison, and recommendations.',
    tools: ['Template Engine', 'LLM Report Generator', 'Markdown Formatter'],
  },
};

export const AGENT_ORDER: AgentId[] = [
  'orchestrator',
  'data_analyst',
  'clean_bot',
  'feature_bot',
  'model_scout',
  'trainer_bot',
  'judge_bot',
  'explain_bot',
  'report_bot',
];

// All agents are active
export const ACTIVE_AGENTS: AgentId[] = [
  'orchestrator',
  'data_analyst',
  'clean_bot',
  'feature_bot',
  'model_scout',
  'trainer_bot',
  'judge_bot',
  'explain_bot',
  'report_bot',
];

// Legacy alias
export const MODULE1_AGENTS: AgentId[] = ACTIVE_AGENTS;

export function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: 'idle',
    currentAction: '',
    startTime: null,
    endTime: null,
    input: '',
    output: '',
    decisionSummary: '',
    error: null,
  };
}

export function createInitialAgentStates(): Record<AgentId, AgentState> {
  const states = {} as Record<AgentId, AgentState>;
  for (const id of AGENT_ORDER) {
    states[id] = createInitialAgentState(id);
  }
  return states;
}
