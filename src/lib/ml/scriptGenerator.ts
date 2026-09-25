// ============================================================
// Synapse AI — Reproducible Python Script Generator
// Generates a leakage-safe, task-aware scikit-learn experiment.
// ============================================================

import type { DatasetProfile, CleaningReport, FeatureReport, EvaluationResults, ExplanationResults, ExperimentReport } from '@/types';

interface ScriptParams {
  profile: DatasetProfile;
  cleaning: CleaningReport;
  features: FeatureReport;
  evaluation: EvaluationResults;
  explanation: ExplanationResults;
  report: ExperimentReport;
  fileName: string;
}

function pyString(value: string): string { return JSON.stringify(value); }

export function generatePythonScript(params: ScriptParams): string {
  const { profile, evaluation, report, fileName } = params;
  const target = profile.targetColumn;
  const ids = profile.identifierColumns;

  const header = `#!/usr/bin/env python3
"""Synapse AI — reproducible ML experiment.

The script uses leakage-safe preprocessing: train/test split happens before
learned imputers, encoders, scalers, and feature-selection statistics are fit.
"""
import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler, LabelEncoder
from sklearn.inspection import permutation_importance

DATA_FILE = ${pyString(fileName)}
RANDOM_STATE = 42
TEST_SIZE = 0.2


df = pd.read_csv(DATA_FILE).drop_duplicates().reset_index(drop=True)
print(f"Dataset: {DATA_FILE}")
print(f"Rows: {len(df):,}  Columns: {len(df.columns):,}")
`;

  if (profile.learningParadigm === 'unsupervised' || !target) {
    return `${header}
# No reliable target was selected. Run an unsupervised clustering pipeline.
IDENTIFIER_COLUMNS = ${JSON.stringify(ids)}
X = df.drop(columns=[c for c in IDENTIFIER_COLUMNS if c in df.columns], errors="ignore").copy()

numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()
preprocessor = ColumnTransformer([
    ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric_cols),
    ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), categorical_cols),
], remainder="drop")
X_ready = preprocessor.fit_transform(X)

from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

if len(X_ready) < 3:
    raise ValueError("At least 3 unique rows are required for clustering.")
upper_k = min(6, len(X_ready) - 1)
best = None
for k in range(2, upper_k + 1):
    labels = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10).fit_predict(X_ready)
    sil = silhouette_score(X_ready, labels)
    print(f"k={k}: silhouette={sil:.4f}")
    if best is None or sil > best["silhouette"]:
        best = {"k": k, "labels": labels, "silhouette": sil}

labels = best["labels"]
print(f"\\nSelected algorithm: K-Means")
print(f"Selected clusters: {best['k']}")
print(f"Silhouette: {best['silhouette']:.4f}")
print(f"Davies-Bouldin: {davies_bouldin_score(X_ready, labels):.4f}")
print(f"Calinski-Harabasz: {calinski_harabasz_score(X_ready, labels):.2f}")
`;
  }

  const regression = profile.taskType === 'regression';
  const modelBlock = regression
    ? `from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

models = {
    "Linear Regression": LinearRegression(),
    "Random Forest Regressor": RandomForestRegressor(n_estimators=30, max_depth=8, random_state=RANDOM_STATE, n_jobs=1),
    "Gradient Boosting Regressor": GradientBoostingRegressor(n_estimators=40, max_depth=4, learning_rate=0.08, random_state=RANDOM_STATE),
}`
    : `from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report, confusion_matrix

models = {
    "Logistic Regression": LogisticRegression(max_iter=1000, random_state=RANDOM_STATE),
    "Random Forest": RandomForestClassifier(n_estimators=30, max_depth=8, random_state=RANDOM_STATE, n_jobs=1),
    "Gradient Boosting": GradientBoostingClassifier(n_estimators=40, max_depth=4, learning_rate=0.3, random_state=RANDOM_STATE),
}`;

  const targetPrep = regression
    ? `y = pd.to_numeric(df[${pyString(target)}], errors="coerce")
valid = y.notna()
df = df.loc[valid].reset_index(drop=True)
y = y.loc[valid].reset_index(drop=True)
X = df.drop(columns=[${pyString(target)}] + IDENTIFIER_COLUMNS, errors="ignore").copy()`
    : `y_raw = df[${pyString(target)}]
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y_raw.astype(str))
X = df.drop(columns=[${pyString(target)}] + IDENTIFIER_COLUMNS, errors="ignore").copy()`;

  const split = regression
    ? `X_train_raw, X_test_raw, y_train, y_test = train_test_split(X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE)`
    : `class_counts = pd.Series(y).value_counts()
stratify_arg = y if len(class_counts) > 1 and int(class_counts.min()) >= 2 else None
X_train_raw, X_test_raw, y_train, y_test = train_test_split(X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=stratify_arg)`;

  const metrics = regression
    ? `for name, model in models.items():
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    rmse = mean_squared_error(y_test, pred) ** 0.5
    mae = mean_absolute_error(y_test, pred)
    r2 = r2_score(y_test, pred)
    results[name] = {"model": model, "pred": pred, "rmse": rmse, "mae": mae, "r2": r2}
    print(f"{name}: RMSE={rmse:.4f}  MAE={mae:.4f}  R2={r2:.4f}")

best_name = min(results, key=lambda k: results[k]["rmse"])
best_model = results[best_name]["model"]
print(f"\\nSelected model: {best_name}")

perm = permutation_importance(best_model, X_test, y_test, n_repeats=5, random_state=RANDOM_STATE, scoring="r2")
print("Permutation Feature Importance:")
for i in perm.importances_mean.argsort()[::-1][:10]:
    print(f"  prepared_feature_{i}: {perm.importances_mean[i]:.4f}")`
    : `for name, model in models.items():
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    acc = accuracy_score(y_test, pred)
    prec = precision_score(y_test, pred, average="macro", zero_division=0)
    rec = recall_score(y_test, pred, average="macro", zero_division=0)
    f1 = f1_score(y_test, pred, average="macro", zero_division=0)
    results[name] = {"model": model, "pred": pred, "accuracy": acc, "precision": prec, "recall": rec, "f1": f1}
    print(f"{name}: Acc={acc:.4f}  Precision={prec:.4f}  Recall={rec:.4f}  F1={f1:.4f}")

selection_metric = "f1" if len(np.unique(y)) > 2 else "accuracy"
best_name = max(results, key=lambda k: results[k][selection_metric])
best_model = results[best_name]["model"]
print(f"\\nSelected model: {best_name} ({selection_metric.upper()}={results[best_name][selection_metric]:.4f})")
print(classification_report(y_test, results[best_name]["pred"], zero_division=0))
print(confusion_matrix(y_test, results[best_name]["pred"]))

perm = permutation_importance(best_model, X_test, y_test, n_repeats=5, random_state=RANDOM_STATE, scoring=selection_metric)
print("Permutation Feature Importance:")
for i in perm.importances_mean.argsort()[::-1][:10]:
    print(f"  prepared_feature_{i}: {perm.importances_mean[i]:.4f}")`;

  return `${header}
IDENTIFIER_COLUMNS = ${JSON.stringify(ids)}
${targetPrep}

# Split BEFORE fitting any learned preprocessing parameters.
${split}
numeric_cols = X_train_raw.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = X_train_raw.select_dtypes(exclude=[np.number]).columns.tolist()
preprocessor = ColumnTransformer([
    ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric_cols),
    ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), categorical_cols),
], remainder="drop")

# Fit preprocessing ONLY on the training partition.
X_train = preprocessor.fit_transform(X_train_raw)
X_test = preprocessor.transform(X_test_raw)
print(f"Prepared train shape: {X_train.shape}")
print(f"Prepared test shape: {X_test.shape}")

${modelBlock}
results = {}
${metrics}
`;
}
