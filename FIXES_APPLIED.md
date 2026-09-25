# Synapse AI — Stabilization Pass

This build is based on the supplied `SynapseAI_v1.1.0_FIXED(1).zip`.

## Fixed
- Removed the previous `targetEvidence score` syntax corruption.
- Supervised preprocessing now splits first and fits learned preprocessing statistics on the training partition only.
- Numeric imputation and scaling are train-fitted; test rows are transform-only.
- Categorical features use one-hot encoding for low-cardinality values and train-fitted frequency encoding for high-cardinality values.
- Unsupervised categorical features no longer use arbitrary label IDs as distances.
- Identifier columns remain excluded from ML features.
- Correlation screening is train-only for supervised learning and capped for very wide datasets.
- Added missing-value handling for categorical and boolean features.
- Added empty-feature and too-small-dataset guards for clustering.
- Added K-Means empty-cluster recovery.
- Added browser regression models: Linear Regression, Random Forest Regressor, and Gradient Boosting Regressor.
- Added regression metrics: RMSE, MAE, and R², including model selection and UI presentation.
- Regression explainability now uses permutation importance with regression performance scoring.
- Replaced misleading SHAP terminology with permutation feature importance terminology where the implementation is actually permutation-based.
- Replaced misleading XGBoost naming with the actual browser Gradient Boosting implementation.
- Generated Python experiment scripts are task-aware and use leakage-safe preprocessing.
- Python live execution accepts the detected target/paradigm from the main workflow instead of independently selecting a conflicting target.
- Target detection is presented as an evidence score rather than a calibrated probability.
- Removed duplicate model-sorting logic.
- Added wide-feature correlation caps to reduce quadratic runtime risk.

## Validation performed
- TypeScript/TSX source parse: PASS (0 parse diagnostics).
- Static scan: no `TODO`, `FIXME`, `alert(`, or obvious `: any` annotations found in `src`.
- Runtime smoke test: classification algorithms PASS.
- Runtime smoke test: regression algorithms PASS with finite predictions.
- Runtime smoke test: clustering PASS, including empty-cluster handling.
- Runtime smoke test: supervised/unsupervised preprocessing PASS, including identifier exclusion and categorical encoding.

## Environment note
The container could not complete `npm ci` within the available transport timeout, so a full dependency-backed Vite build/typecheck could not be truthfully marked as passed here. The source was additionally parsed with the local TypeScript parser and had zero TS/TSX parse diagnostics.

## Follow-up stabilization fix
- Fixed `src/lib/workflowEngine.ts` execution order: `runDataAnalyst()` now resolves `profile` before the Python runner receives `profile.targetColumn` and `profile.learningParadigm`.
- This removes the TypeScript `TS2448` / `TS2454` use-before-declaration error.

## Validation
- TypeScript parser/no-check validation (`tsc --noCheck --noEmit -p tsconfig.app.json`): PASS, 0 diagnostics.
- Full dependency-backed `npm run typecheck` could not be rerun in the build container because project dependencies were not installed and `npm ci` timed out; offline installation also failed because a required package was not cached. Do not interpret the parser check as a replacement for the user's local `npm run typecheck`.
