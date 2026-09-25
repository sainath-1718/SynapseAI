// ============================================================
// Synapse AI — Step 2: Full-background cinematic agent
// Flow: portrait idle -> START -> hologram video -> exact
// UPLOAD DATASET hologram hotspot -> CSV -> existing workflow.
// Backend/workflow contract is unchanged.
// ============================================================

import { memo, useCallback, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { WorkflowState } from '@/types';

interface UploadPanelProps {
  workflowState: WorkflowState;
  onUpload: (file: File) => void;
  onReset: () => void;
}

function UploadPanelComponent({ workflowState, onUpload, onReset }: UploadPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [hologramReady, setHologramReady] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);

  const isRunning = workflowState.status === 'running';
  const isCompleted = workflowState.status === 'completed';
  const hasError = workflowState.status === 'error';
  const hasProfile = workflowState.datasetProfile !== null;

  const validateFile = (file: File): string | null => {
    const isCSV = file.name.toLowerCase().endsWith('.csv') ||
      file.type === 'text/csv' ||
      file.type === 'application/vnd.ms-excel';
    if (!isCSV) return 'Only .csv files are supported.';
    if (file.size === 0) return 'The file is empty.';
    if (file.size > 50 * 1024 * 1024) return 'File exceeds 50 MB limit.';
    return null;
  };

  const handleStart = () => {
    if (started || isReceiving) return;
    setStarted(true);
    setHologramReady(false);
    setError(null);
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => setError('Hologram animation could not be started.'));
      backgroundVideoRef.current?.play().catch(() => undefined);
    });
  };

  const handleVideoEnded = () => {
    setHologramReady(true);
  };

  const handleHologramClick = () => {
    if (!hologramReady || isReceiving || isRunning) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const err = validateFile(file);
    if (err) {
      setError(err);
      e.target.value = '';
      return;
    }

    setError(null);
    setIsReceiving(true);

    // The hologram click performs the action directly: after selecting a CSV,
    // hand it to the existing Synapse workflow without adding another button.
    window.setTimeout(() => {
      onUpload(file);
      setIsReceiving(false);
    }, 700);
  }, [onUpload]);

  const handleNewUpload = () => {
    setError(null);
    setStarted(false);
    setHologramReady(false);
    setIsReceiving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onReset();
    requestAnimationFrame(() => {
      if (videoRef.current) videoRef.current.currentTime = 0;
      if (backgroundVideoRef.current) backgroundVideoRef.current.currentTime = 0;
    });
  };

  if (hasProfile) {
    return (
      <div className="cinematic-upload cinematic-upload--complete">
        <div className="cinematic-upload__result">
          <div className="flex items-center gap-3 min-w-0">
            <div className="cinematic-upload__check"><CheckCircle2 size={18} /></div>
            <div className="min-w-0">
              <div className="text-xs font-mono tracking-[0.18em] text-synapse-300">DATASET RECEIVED</div>
              <div className="text-sm text-slate-300 font-mono truncate">{workflowState.datasetProfile?.fileName}</div>
            </div>
          </div>
          <button onClick={handleNewUpload} className="cinematic-upload__reset">UPLOAD NEW</button>
        </div>
      </div>
    );
  }

  return (
    <section className="cinematic-upload" aria-label="Dataset upload agent">
      {/* Full-screen visual background. The foreground remains a fixed portrait. */}
      <div className="cinematic-upload__background" aria-hidden="true">
        {!started ? (
          <img src="/dataset-agent-idle.jpg" alt="" />
        ) : (
          <video ref={backgroundVideoRef} src="/dataset-hologram.mp4" muted playsInline preload="auto" />
        )}
      </div>
      <div className="cinematic-upload__background-vignette" aria-hidden="true" />

      <div className="cinematic-upload__chrome">
        <div>
          <div className="cinematic-upload__brand">SYNAPSE AI</div>
          <div className="cinematic-upload__agent">DATA INGESTION AGENT</div>
        </div>
        <div className="cinematic-upload__state">
          <span className={`cinematic-upload__dot ${isRunning ? 'is-running' : hologramReady ? 'is-ready' : ''}`} />
          {isRunning ? 'PROCESSING' : hologramReady ? 'HOLOGRAM READY' : started ? 'AGENT ACTIVE' : 'AGENT IDLE'}
        </div>
      </div>

      <div className="cinematic-upload__stage">
        <div className="cinematic-upload__portrait">
          <video
            ref={videoRef}
            src={started ? '/dataset-hologram.mp4' : undefined}
            poster="/dataset-agent-idle.jpg"
            muted
            playsInline
            preload="auto"
            className={started ? 'is-video' : 'is-idle'}
            onEnded={handleVideoEnded}
            onError={() => setError('Hologram animation could not be loaded.')}
          />
          {!started && <img src="/dataset-agent-idle.jpg" alt="Synapse AI data ingestion agent" />}
          <div className="cinematic-upload__portrait-frame" />
        </div>

        {!started && (
          <div className="cinematic-upload__start-wrap">
            <button className="cinematic-upload__start" onClick={handleStart}>START</button>
            <div className="cinematic-upload__hint">INITIALIZE DATA INGESTION AGENT</div>
          </div>
        )}

        {started && !hologramReady && !isReceiving && (
          <div className="cinematic-upload__loading">
            <span className="cinematic-upload__loader" />
            <span>PROJECTING HOLOGRAM</span>
          </div>
        )}

        {/* Transparent hitbox sits exactly over the UPLOAD DATASET panel in the supplied 9:16 video. */}
        {hologramReady && !isReceiving && (
          <button
            className="cinematic-upload__hologram-hitbox"
            onClick={handleHologramClick}
            aria-label="Upload Dataset"
            title="Upload Dataset"
          />
        )}

        {isReceiving && (
          <div className="cinematic-upload__receiving">
            <Loader2 size={18} className="animate-spin" />
            <span>RECEIVING DATASET</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {error && <div className="cinematic-upload__error">{error}</div>}
      {hasError && !error && <div className="cinematic-upload__error">Dataset processing reported an error. You can upload another CSV.</div>}
    </section>
  );
}

export const UploadPanel = memo(UploadPanelComponent);
