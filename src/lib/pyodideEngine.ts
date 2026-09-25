// ============================================================
// Synapse AI — Pyodide Engine
// Loads Pyodide (CPython compiled to WebAssembly) and executes
// real Python code in the browser. Actual pandas, numpy, and
// scikit-learn operations run on the uploaded CSV data.
// ============================================================

// Pyodide is loaded from CDN as a UMD script — we declare the
// minimal interface we need.

interface PyodideInterface {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<void>;
  loadPackage(names: string | string[]): Promise<void>;
  setStdout(options: { batched: (chunk: string) => void }): void;
  setStderr(options: { batched: (chunk: string) => void }): void;
  globals: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
  FS: {
    writeFile(path: string, data: string): void;
    readFile(path: string): Uint8Array;
    readdir(path: string): string[];
  };
}

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInterface>;
    __pyodidePromise?: Promise<PyodideInterface>;
  }
}

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type OutputHandler = (text: string, stream: 'stdout' | 'stderr') => void;

let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function getPyodide(
  onProgress?: (msg: string) => void
): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    onProgress?.('Downloading Pyodide runtime...');
    await loadScript(PYODIDE_CDN + 'pyodide.js');

    if (!window.loadPyodide) {
      throw new Error('Pyodide failed to initialize — loadPyodide not found');
    }

    onProgress?.('Initializing Python interpreter...');
    const instance = await window.loadPyodide({ indexURL: PYODIDE_CDN });

    onProgress?.('Installing micropip...');
    await instance.loadPackage('micropip');

    pyodideInstance = instance;
    return instance;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  error: string | null;
  result: unknown;
}

export async function runPython(
  pyodide: PyodideInterface,
  code: string,
  onOutput?: OutputHandler
): Promise<ExecutionResult> {
  let stdout = '';
  let stderr = '';

  if (onOutput) {
    pyodide.setStdout({
      batched: (chunk: string) => {
        stdout += chunk;
        onOutput(chunk, 'stdout');
      },
    });
    pyodide.setStderr({
      batched: (chunk: string) => {
        stderr += chunk;
        onOutput(chunk, 'stderr');
      },
    });
  }

  let error: string | null = null;
  let result: unknown = undefined;

  try {
    await pyodide.loadPackagesFromImports(code);
    result = await pyodide.runPythonAsync(code);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (onOutput) {
      onOutput(error, 'stderr');
    }
    stderr += error;
  }

  return { stdout, stderr, error, result };
}

export async function loadScikitLearn(
  pyodide: PyodideInterface,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Installing numpy...');
  await pyodide.loadPackage('numpy');
  onProgress?.('Installing pandas...');
  await pyodide.loadPackage('pandas');
  onProgress?.('Installing scikit-learn...');
  await pyodide.loadPackage('scikit-learn');
}

export function writeFileToPyodide(
  pyodide: PyodideInterface,
  path: string,
  content: string
): void {
  pyodide.FS.writeFile(path, content);
}

export function getPythonVar(
  pyodide: PyodideInterface,
  varName: string
): unknown {
  return pyodide.globals.get(varName);
}

export type { PyodideInterface };
