// ============================================================
// Synapse AI — Report Generation Engine
// Converts experiment results into a structured human-readable report.
// ============================================================

import type {
  ExperimentReport,
  ReportSection,
  DatasetProfile,
  CleaningReport,
  FeatureReport,
  EvaluationResults,
  ExplanationResults,
} from '@/types';
import { formatBytes, formatNumber } from '@/lib/csvEngine';

export function generateReport(
  profile: DatasetProfile,
  cleaning: CleaningReport,
  features: FeatureReport,
  evaluation: EvaluationResults,
  explanation: ExplanationResults
): ExperimentReport {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sections: ReportSection[] = [];

  // --- Section 1: Dataset Overview ---
  sections.push({
    title: 'Dataset Overview',
    icon: 'Database',
    content:
      `File: ${profile.fileName} (${formatBytes(profile.fileSizeBytes)})\n` +
      `Shape: ${formatNumber(profile.rows)} rows × ${profile.columns} columns\n` +
      `Task type: ${profile.taskType}\n` +
      `Target column: "${profile.targetColumn}" (evidence score: ${profile.targetConfidence}%)\n` +
      `Quality score: ${profile.qualityScore}/100\n` +
      `Column types: ${profile.numericalColumns} numerical, ${profile.categoricalColumns} categorical, ${profile.booleanColumns} boolean\n` +
      (profile.qualityIssues.length > 0 ? `Issues: ${profile.qualityIssues.join('; ')}` : 'No quality issues detected.'),
  });

  // --- Section 2: Data Cleaning ---
  const cleaningLines: string[] = [
    `Rows: ${formatNumber(cleaning.rowsBefore)} → ${formatNumber(cleaning.rowsAfter)} (after removing ${formatNumber(cleaning.duplicatesRemoved)} duplicates)`,
    `Columns: ${cleaning.columnsBefore} → ${cleaning.columnsAfter} (after removing ${cleaning.constantColumnsRemoved} constant columns)`,
    `Missing values imputed: ${formatNumber(cleaning.missingHandled)} (median strategy for numeric, most-frequent for categorical)`,
    `Categorical columns encoded: ${cleaning.categoricalEncoded}`,
    `Boolean columns converted: ${cleaning.booleanConverted}`,
    `Numeric features standardized (z-score normalization)`,
    `Train/test split: ${formatNumber(cleaning.rowsAfter - Math.floor(cleaning.rowsAfter * 0.2))} train / ${Math.floor(cleaning.rowsAfter * 0.2)} test`,
  ];
  sections.push({
    title: 'Data Cleaning',
    icon: 'Sparkles',
    content: cleaningLines.join('\n'),
  });

  // --- Section 3: Feature Engineering ---
  const featureLines: string[] = [
    `Original features: ${features.originalFeatures}`,
    `Processed features: ${features.processedFeatures}`,
    `Removed: ${features.removedFeatures.length > 0 ? features.removedFeatures.join(', ') : 'none'}`,
    `Correlated pairs detected (r > 0.85): ${features.correlatedPairs.length}`,
  ];
  if (features.correlatedPairs.length > 0) {
    featureLines.push('Correlated pairs:');
    for (const pair of features.correlatedPairs.slice(0, 5)) {
      featureLines.push(`  ${pair.col1} ↔ ${pair.col2} (r=${pair.correlation.toFixed(3)})`);
    }
  }
  featureLines.push(`Selected features: ${features.selectedFeatures.join(', ')}`);
  sections.push({
    title: 'Feature Engineering',
    icon: 'GitBranch',
    content: featureLines.join('\n'),
  });

  // --- Section 4: Model Comparison ---
  const modelLines: string[] = [`Selection metric: ${evaluation.selectionMetric}`, ''];
  if (profile.taskType === 'regression') {
    for (const model of [...evaluation.models].sort((a,b)=>(a.rmse ?? Infinity)-(b.rmse ?? Infinity))) {
      modelLines.push(`${model.isBest ? '★ ' : '  '}${model.modelName.padEnd(28)} RMSE=${(model.rmse ?? 0).toFixed(4)}  MAE=${(model.mae ?? 0).toFixed(4)}  R²=${(model.r2 ?? 0).toFixed(4)}  (${model.trainTime.toFixed(2)}s)`);
    }
    modelLines.push('', `Selected model: ${evaluation.bestModel.modelName}`, `Reason: ${evaluation.selectionReason}`);
  } else {
  const sortedModels = [...evaluation.models].sort((a, b) => b.f1 - a.f1);
  for (const model of sortedModels) {
    modelLines.push(
      `${model.isBest ? '★ ' : '  '}${model.modelName.padEnd(22)} ` +
      `Acc=${(model.accuracy * 100).toFixed(1)}%  ` +
      `Prec=${(model.precision * 100).toFixed(1)}%  ` +
      `Rec=${(model.recall * 100).toFixed(1)}%  ` +
      `F1=${(model.f1 * 100).toFixed(1)}%` +
      (model.rocAuc !== null ? `  AUC=${model.rocAuc.toFixed(3)}` : '') +
      `  (${model.trainTime.toFixed(2)}s)`
    );
  }
  modelLines.push('');
  modelLines.push(`Winner: ${evaluation.bestModel.modelName}`);
  modelLines.push(`Reason: ${evaluation.selectionReason}`);
  }
  sections.push({
    title: 'Model Comparison',
    icon: 'TrendingUp',
    content: modelLines.join('\n'),
  });

  // --- Section 5: Model Explanation ---
  const explainLines: string[] = [
    explanation.globalSummary,
    '',
    'Top features by permutation importance:',
  ];
  for (const pi of explanation.permutationImportance.slice(0, 5)) {
    if (pi.importance > 0) {
      const arrow = pi.direction === 'positive' ? '↑' : pi.direction === 'negative' ? '↓' : '—';
      explainLines.push(
        `  ${pi.feature.padEnd(20)} importance=${pi.importance.toFixed(4)} ${arrow}`
      );
    }
  }
  explainLines.push('');
  explainLines.push('Sample predictions explained:');
  for (const local of explanation.localExplanations.slice(0, 3)) {
    explainLines.push(
      `  [${local.correct ? 'CORRECT' : 'WRONG'}] True: ${local.trueLabel}, Predicted: ${local.predictedLabel}`
    );
    for (const reason of local.topReasons) {
      explainLines.push(`    → ${reason}`);
    }
  }
  sections.push({
    title: 'Model Explanation',
    icon: 'Brain',
    content: explainLines.join('\n'),
  });

  // --- Recommendations ---
  const recommendations: string[] = [];

  // Recommendation based on model performance
  if (profile.taskType === 'regression') {
    recommendations.push(`Use ${evaluation.bestModel.modelName} with RMSE ${(evaluation.bestModel.rmse ?? 0).toFixed(4)}, MAE ${(evaluation.bestModel.mae ?? 0).toFixed(4)}, and R² ${(evaluation.bestModel.r2 ?? 0).toFixed(4)} as the reported regression performance.`);
  } else if (evaluation.bestModel.f1 > 0.9) {
    recommendations.push(`The ${evaluation.bestModel.modelName} model performs excellently (F1 > 90%). It is ready for deployment.`);
  } else if (evaluation.bestModel.f1 > 0.75) {
    recommendations.push(`The ${evaluation.bestModel.modelName} model performs well (F1 > 75%). Consider collecting more data to improve further.`);
  } else if (evaluation.bestModel.f1 > 0.5) {
    recommendations.push(`The ${evaluation.bestModel.modelName} model has moderate performance (F1 > 50%). Feature engineering or hyperparameter tuning may help.`);
  } else {
    recommendations.push(`The ${evaluation.bestModel.modelName} model has low performance (F1 < 50%). The dataset may need more samples, better features, or a different approach.`);
  }

  // Recommendation based on data quality
  if (profile.missingValues > 0) {
    recommendations.push(`The dataset had ${formatNumber(profile.missingValues)} missing values. Consider improving data collection to reduce missingness.`);
  }
  if (profile.duplicates > 0) {
    recommendations.push(`${formatNumber(profile.duplicates)} duplicate rows were removed. Review data collection for potential duplication issues.`);
  }
  if (profile.taskType === 'classification' && profile.imbalanceDetected) {
    recommendations.push(`Class imbalance was detected (${profile.imbalanceRatio}). Consider class weights or resampling for better balance.`);
  }
  if (features.removedFeatures.length > 0) {
    recommendations.push(`${features.removedFeatures.length} highly correlated features were removed. Consider collecting more diverse features.`);
  }
  if (profile.rows < 200) {
    recommendations.push(`The dataset is small (${formatNumber(profile.rows)} rows). Collecting more data would likely improve model performance.`);
  }

  // Recommendation based on feature importance
  const topFeature = explanation.permutationImportance[0];
  if (topFeature && topFeature.importance > 0) {
    recommendations.push(`"${topFeature.feature}" is the most influential feature. Focus on ensuring its quality and availability in production.`);
  }

  // --- Summary ---
  const performanceSummary = profile.taskType === 'regression'
    ? `${evaluation.selectionMetric}: ${(evaluation.bestModel.rmse ?? 0).toFixed(4)}, MAE ${(evaluation.bestModel.mae ?? 0).toFixed(4)}, R² ${(evaluation.bestModel.r2 ?? 0).toFixed(4)}`
    : `${evaluation.selectionMetric}: ${((evaluation.selectionMetric.includes('F1') ? evaluation.bestModel.f1 : evaluation.bestModel.accuracy) * 100).toFixed(1)}%`;
  const summary =
    `Experiment completed on ${generatedAt}. ` +
    `Dataset: ${profile.fileName} (${formatNumber(profile.rows)} rows, ${profile.columns} columns). ` +
    `Task: ${profile.taskType} targeting "${profile.targetColumn}". ` +
    `Selected model: ${evaluation.bestModel.modelName} (${performanceSummary}). ` +
    `${explanation.permutationImportance.filter((p) => p.importance > 0).length} features contributed to predictions. ` +
    `${recommendations.length} recommendation(s) generated.`;

  // --- Full text ---
  const fullText =
    `Synapse AI — Experiment Report\n` +
    `${'='.repeat(60)}\n` +
    `Generated: ${generatedAt}\n\n` +
    `Summary: ${summary}\n\n` +
    sections.map((s) => `${s.title}\n${'-'.repeat(s.title.length)}\n${s.content}`).join('\n\n') +
    `\n\nRecommendations\n${'-'.repeat(15)}\n` +
    recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');

  return {
    title: `Experiment Report — ${profile.fileName}`,
    generatedAt,
    sections,
    recommendations,
    summary,
    fullText,
  };
}
