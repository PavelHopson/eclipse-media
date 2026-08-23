import type { CSSProperties } from 'react';
import type { DownloadPhase } from '../store/downloads';
import { DOWNLOAD_PHASE_STEPS, getDownloadProgressView } from '../services/downloadProgress';

interface Props {
  eta: string;
  fragmentCurrent: number | null;
  fragmentTotal: number | null;
  phase: DownloadPhase;
  progress: number;
  speed: string;
}

type ProgressStyle = CSSProperties & { '--progress-scale': number };

export function DownloadProgress({
  eta,
  fragmentCurrent,
  fragmentTotal,
  phase,
  progress,
  speed,
}: Props) {
  const view = getDownloadProgressView({ phase, progress, speed, eta, fragmentCurrent, fragmentTotal });
  const progressStyle: ProgressStyle = { '--progress-scale': view.progressScale };

  return (
    <div className={`download-progress is-${phase}`}>
      <div className="download-progress__status" role="status" aria-live="polite" aria-atomic="true">
        <span className="download-status-signal" aria-hidden="true"><span /></span>
        <span><strong>{view.label}</strong><small>{view.detail}</small></span>
      </div>

      <ol className="download-phase-rail" aria-label="Этапы подготовки файла">
        {DOWNLOAD_PHASE_STEPS.map((step, index) => (
          <li
            key={step.id}
            className={index < view.activeStep ? 'is-complete' : index === view.activeStep ? 'is-active' : ''}
            aria-current={index === view.activeStep ? 'step' : undefined}
          >
            <span aria-hidden="true" />
            <small>{step.label}</small>
          </li>
        ))}
      </ol>

      <div
        className="progress-track"
        role="progressbar"
        aria-label={view.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.ariaValueNow}
        aria-valuetext={view.ariaValueText}
      >
        <div className="progress-fill eclipse-progress" style={progressStyle} />
      </div>

      <div className="download-progress__meta mono">
        <span>{view.metaLead}</span>
        <span>{view.metaTail}</span>
      </div>
    </div>
  );
}
