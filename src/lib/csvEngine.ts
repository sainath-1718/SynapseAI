// ============================================================
// Synapse AI — Real CSV Parser & Dataset Analysis Engine
// All operations are real computations performed in the browser.
// No fake data, no hardcoded results.
// ============================================================

import type { ColumnInfo, DatasetProfile, TaskType, LearningParadigm } from '@/types';

// --- CSV Parser ---

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  fileSizeBytes: number;
}

/**
 * Parses CSV text into headers + row arrays.
 * Handles quoted fields, escaped quotes, and mixed line endings.
 */
export function parseCSV(text: string, fileName: string, fileSizeBytes: number): ParsedCSV {
  const headers: string[] = [];
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  let headerParsed = false;
  let i = 0;

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    i = 0;
  }

  // Detect delimiter (comma default, but check for semicolon/tab)
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > 0) delimiter = ';';
  else if (tabCount > commaCount && tabCount > 0) delimiter = '\t';

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (char === '\r') {
      i++;
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      currentField = '';
      if (!headerParsed) {
        headers.push(...currentRow);
        headerParsed = true;
      } else {
        // Only push rows that have the right number of columns or at least some content
        if (currentRow.some((f) => f.trim() !== '')) {
          rows.push(currentRow);
        }
      }
      currentRow = [];
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Handle last field/row
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (!headerParsed) {
      headers.push(...currentRow);
    } else if (currentRow.some((f) => f.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  // Sanitize header names — trim whitespace, replace newlines
  const cleanHeaders = headers.map((h) => h.trim().replace(/[\r\n]+/g, ' '));

  return { headers: cleanHeaders, rows, fileSizeBytes, };
}

// --- Type Detection ---

function isNumeric(value: string): boolean {
  if (value === null || value === undefined || value.trim() === '') return false;
  const s = value.trim();
  // Match integers, floats, scientific notation, negative numbers
  return /^[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(s) && !isNaN(parseFloat(s.replace(',', '.')));
}

function isBoolean(value: string): boolean {
  const s = value.trim().toLowerCase();
  return ['true', 'false', 'yes', 'no', '0', '1'].includes(s);
}

function isInteger(value: string): boolean {
  if (!isNumeric(value)) return false;
  const s = value.trim().replace(',', '.');
  return /^[+-]?\d+([eE][+-]?\d+)?$/.test(s) || (Number.isInteger(parseFloat(s)) && !s.includes('.'));
}

function parseDateTime(value: string): boolean {
  const s = value.trim();
  if (s === '') return false;
  // ISO date, date-time, common formats
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return true;
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) return true;
  return false;
}

type DetectedType = 'integer' | 'float' | 'categorical' | 'boolean' | 'datetime' | 'unknown';

function detectColumnType(values: string[]): DetectedType {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v.trim() !== '');
  if (nonEmpty.length === 0) return 'unknown';

  const sample = nonEmpty.slice(0, Math.min(500, nonEmpty.length));
  const numericCount = sample.filter(isNumeric).length;
  const boolCount = sample.filter(isBoolean).length;
  const dateCount = sample.filter(parseDateTime).length;
  const intCount = sample.filter(isInteger).length;

  const sampleLen = sample.length;

  if (intCount / sampleLen > 0.9) {
    // Check if it's actually boolean-like (0/1 only)
    const uniqueInts = new Set(sample.filter(isInteger).map((v) => parseInt(v.trim(), 10)));
    if (uniqueInts.size === 2 && uniqueInts.has(0) && uniqueInts.has(1)) return 'boolean';
    return 'integer';
  }

  if (numericCount / sampleLen > 0.9) return 'float';

  if (boolCount / sampleLen > 0.9) {
    const uniqueVals = new Set(sample.map((v) => v.trim().toLowerCase()));
    // Only treat as boolean if values are truly boolean-like (not 0/1 which could be numeric)
    if ([...uniqueVals].some((v) => ['true', 'false', 'yes', 'no'].includes(v))) {
      return 'boolean';
    }
  }

  if (dateCount / sampleLen > 0.8) return 'datetime';

  return 'categorical';
}

// --- Dataset Profiler ---

/**
 * Performs real dataset analysis.
 * All statistics are computed from the actual parsed data.
 */
export function profileDataset(
  parsed: ParsedCSV,
  fileName: string
): DatasetProfile {
  const { headers, rows, fileSizeBytes } = parsed;
  const totalRows = rows.length;
  const totalCols = headers.length;

  // Build column data arrays
  const columnData: string[][] = headers.map((_, colIdx) =>
    rows.map((row) => (row[colIdx] !== undefined ? row[colIdx] : ''))
  );

  // Analyze each column
  const columnInfos: ColumnInfo[] = headers.map((header, colIdx) => {
    const values = columnData[colIdx];
    const nonEmpty = values.filter((v) => v.trim() !== '');
    const missingCount = totalRows - nonEmpty.length;
    const missingPercent = totalRows > 0 ? (missingCount / totalRows) * 100 : 0;

    const uniqueSet = new Set(nonEmpty.map((v) => v.trim()));
    const uniqueCount = uniqueSet.size;
    const isConstant = uniqueCount === 1 && nonEmpty.length > 0;

    const detectedType = detectColumnType(values);
    const sampleValues = nonEmpty.slice(0, 5).map((v) => v.trim());

    const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const numericNonEmpty = nonEmpty.map((v) => parseFloat(v.replace(',', '.'))).filter((v) => !isNaN(v));
    const looksLikeIdName = /(^|_)(id|uuid|guid|identifier|customer_id|user_id|account_id|record_id|row_id|index)(_|$)/.test(lowerHeader) || /(^|_)(id|uuid|guid|identifier)$/.test(lowerHeader);
    const sequentialInteger = detectedType === 'integer' && uniqueCount === totalRows && numericNonEmpty.length === totalRows && (Math.max(...numericNonEmpty) - Math.min(...numericNonEmpty) + 1) <= totalRows * 1.2 && Math.min(...numericNonEmpty) >= 0;
    const isIdentifier = !isConstant && (looksLikeIdName || sequentialInteger);

    const info: ColumnInfo = {
      name: header,
      dtype: detectedType,
      uniqueCount,
      missingCount,
      missingPercent,
      isConstant,
      isTargetCandidate: false,
      isIdentifier,
      sampleValues,
    };

    // Numeric statistics
    if (detectedType === 'integer' || detectedType === 'float') {
      const numericValues = nonEmpty
        .map((v) => parseFloat(v.trim().replace(',', '.')))
        .filter((v) => !isNaN(v));
      if (numericValues.length > 0) {
        info.min = Math.min(...numericValues);
        info.max = Math.max(...numericValues);
        info.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        const variance =
          numericValues.reduce((a, b) => a + Math.pow(b - info.mean!, 2), 0) /
          numericValues.length;
        info.std = Math.sqrt(variance);
      }
    }

    // Categorical top values
    if (detectedType === 'categorical' || detectedType === 'boolean') {
      const counts = new Map<string, number>();
      nonEmpty.forEach((v) => {
        const key = v.trim();
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      info.topCategories = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
    }

    return info;
  });

  // Detect duplicates
  const rowStrings = rows.map((r) => r.join('\x1f'));
  const uniqueRows = new Set(rowStrings);
  const duplicates = totalRows - uniqueRows.size;
  const duplicatePercent = totalRows > 0 ? (duplicates / totalRows) * 100 : 0;

  // Count column types
  const numericalColumns = columnInfos.filter(
    (c) => c.dtype === 'integer' || c.dtype === 'float'
  ).length;
  const categoricalColumns = columnInfos.filter((c) => c.dtype === 'categorical').length;
  const booleanColumns = columnInfos.filter((c) => c.dtype === 'boolean').length;
  const constantColumns = columnInfos.filter((c) => c.isConstant).length;

  // Target column + identifier detection
  const identifierColumns = columnInfos.filter((c) => c.isIdentifier).map((c) => c.name);
  const { targetColumn, targetConfidence, targetCandidates, taskType, targetReason } = detectTarget(columnInfos, totalRows);
  const learningParadigm: LearningParadigm = targetColumn ? 'supervised' : 'unsupervised';
  columnInfos.forEach((c) => {
    c.isTargetCandidate = targetCandidates.includes(c.name);
  });

  // Class imbalance detection (for classification)
  let imbalanceDetected = false;
  let imbalanceRatio: string | null = null;
  let classDistribution: { value: string; count: number; percent: number }[] | null = null;

  if (taskType === 'classification' && targetColumn) {
    const targetInfo = columnInfos.find((c) => c.name === targetColumn);
    if (targetInfo?.topCategories) {
      classDistribution = targetInfo.topCategories.map(({ value, count }) => ({
        value,
        count,
        percent: totalRows > 0 ? (count / totalRows) * 100 : 0,
      }));

      if (targetInfo.topCategories.length >= 2) {
        const maxCount = Math.max(...targetInfo.topCategories.map((c) => c.count));
        const minCount = Math.min(...targetInfo.topCategories.map((c) => c.count));
        const ratio = maxCount / minCount;
        imbalanceDetected = ratio > 3;
        imbalanceRatio = `${ratio.toFixed(1)}:1`;
      }
    }
  }

  // Quality scoring
  const qualityIssues: string[] = [];
  let qualityScore = 100;

  if (columnInfos.reduce((a, c) => a + c.missingCount, 0) > 0) {
    const totalMissing = columnInfos.reduce((a, c) => a + c.missingCount, 0);
    const overallMissingPercent = (totalMissing / (totalRows * totalCols)) * 100;
    qualityScore -= Math.min(25, overallMissingPercent * 2);
    if (overallMissingPercent > 5) {
      qualityIssues.push(`High missing value ratio (${overallMissingPercent.toFixed(1)}%)`);
    } else {
      qualityIssues.push(`${totalMissing} missing values detected`);
    }
  }

  if (duplicates > 0) {
    qualityScore -= Math.min(15, duplicatePercent * 1.5);
    qualityIssues.push(`${duplicates} duplicate rows found`);
  }

  if (constantColumns > 0) {
    qualityScore -= constantColumns * 5;
    qualityIssues.push(`${constantColumns} constant column(s) provide no information`);
  }

  if (totalRows < 100) {
    qualityScore -= 15;
    qualityIssues.push('Small dataset — may lack sufficient samples for reliable training');
  }

  if (totalRows > 0 && totalCols > totalRows * 0.5) {
    qualityScore -= 10;
    qualityIssues.push('High column-to-row ratio — risk of overfitting');
  }

  if (targetColumn === null) {
    qualityScore -= 20;
    qualityIssues.push('No reliable target column detected — unsupervised learning recommended');
  }

  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  const missingValues = columnInfos.reduce((a, c) => a + c.missingCount, 0);
  const missingPercent = totalRows * totalCols > 0 ? (missingValues / (totalRows * totalCols)) * 100 : 0;

  return {
    fileName,
    fileSizeBytes,
    rows: totalRows,
    columns: totalCols,
    columnInfos,
    missingValues,
    missingPercent,
    duplicates,
    duplicatePercent,
    categoricalColumns,
    numericalColumns,
    constantColumns,
    booleanColumns,
    taskType,
    targetColumn,
    targetConfidence,
    targetCandidates,
    targetReason,
    identifierColumns,
    learningParadigm,
    imbalanceDetected,
    imbalanceRatio,
    qualityScore,
    qualityIssues,
    classDistribution,
    memorySizeBytes: fileSizeBytes,
  };
}

// --- Target Detection ---

function detectTarget(
  columns: ColumnInfo[],
  totalRows: number
): {
  targetColumn: string | null;
  targetConfidence: number;
  targetCandidates: string[];
  taskType: TaskType;
  targetReason: string;
} {
  const candidates: { name: string; score: number; taskType: TaskType; reason: string }[] = [];
  const outcomeNames = /(^|_)(target|label|class|churn|default|fraud|spam|approved|rejected|survived|outcome|diagnosis|result|status|flag|prediction|outcome|response|y|output|dependent)(_|$)/;
  const regressionNames = /(^|_)(price|cost|amount|sales|revenue|salary|value|score|demand|profit|duration|rate)(_|$)/;
  const identifierNames = /(^|_)(id|uuid|guid|identifier|customer_id|user_id|account_id|record_id|row_id|index)(_|$)/;

  for (const col of columns) {
    if (col.isConstant || col.missingPercent > 50 || col.isIdentifier) continue;
    const lower = col.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    let score = 0;
    let taskType: TaskType = 'unknown';
    const reasons: string[] = [];

    if ((col.dtype === 'categorical' || col.dtype === 'boolean') && col.uniqueCount >= 2 && col.uniqueCount <= Math.max(20, Math.min(50, Math.floor(totalRows * 0.2)))) {
      taskType = 'classification';
      if (outcomeNames.test(lower)) { score += 70; reasons.push('name matches a label/outcome pattern'); }
      if (col.uniqueCount === 2) { score += 15; reasons.push('binary outcome'); }
      if (col.uniqueCount <= 10) { score += 5; }
    }

    if (col.dtype === 'integer' && col.uniqueCount >= 2 && col.uniqueCount <= 20) {
      taskType = 'classification';
      if (outcomeNames.test(lower)) { score += 75; reasons.push('name matches a label/outcome pattern'); }
      else { score += 5; reasons.push('numeric low-cardinality column without outcome semantics'); }
      if (col.uniqueCount === 2) score += 10;
    }

    if ((col.dtype === 'float' || col.dtype === 'integer') && col.uniqueCount > Math.max(20, Math.floor(totalRows * 0.25))) {
      taskType = 'regression';
      if (outcomeNames.test(lower)) { score += 70; reasons.push('name matches an outcome pattern'); }
      if (regressionNames.test(lower)) { score += 35; reasons.push('name suggests a measurable outcome'); }
      if (lower === 'target' || lower === 'y') score += 20;
    }

    if (identifierNames.test(lower) || col.isIdentifier) {
      score = 0;
      continue;
    }

    // Do not promote a merely numeric/categorical column into a target without semantic evidence.
    if (score >= 45) {
      candidates.push({ name: col.name, score, taskType, reason: reasons.join('; ') || 'strong target evidence' });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) {
    return {
      targetColumn: null,
      targetConfidence: 0,
      targetCandidates: [],
      taskType: 'clustering',
      targetReason: 'No column has strong outcome/label semantics. A low-cardinality numeric field alone is not treated as a target.',
    };
  }

  const best = candidates[0];
  return {
    targetColumn: best.name,
    targetConfidence: Math.min(100, best.score),
    targetCandidates: candidates.slice(0, 5).map((c) => c.name),
    taskType: best.taskType,
    targetReason: best.reason,
  };
}

// --- Utility ---

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
