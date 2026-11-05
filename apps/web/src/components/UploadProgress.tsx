interface UploadProgressProps {
  /** What is happening, for example "Subiendo el PDF…". */
  label: string;
  /**
   * Fraction done, from 0 to 1. Leave it out while the total is unknown: the
   * bar then moves without showing a percentage.
   */
  progress?: number | undefined;
}

/** A progress bar with its label and percentage (FR-02). */
export function UploadProgress({ label, progress }: UploadProgressProps) {
  const percent =
    progress === undefined ? undefined : Math.round(progress * 100);

  return (
    <div className="upload-progress">
      <p className="upload-progress__label">
        {label}
        {percent !== undefined && ` ${percent} %`}
      </p>
      {/* <progress> is announced by screen readers as a progress bar. */}
      <progress
        className="upload-progress__bar"
        aria-label={label}
        max={1}
        value={progress}
      />
    </div>
  );
}
