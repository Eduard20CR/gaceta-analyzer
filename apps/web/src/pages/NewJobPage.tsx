import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PAGES_PER_BLOCK } from '@gaceta/shared';
import type { CreateJobResponse } from '@gaceta/shared';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, createJob, uploadPdf } from '../api';
import { AdvancedSettings } from '../components/AdvancedSettings';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormField } from '../components/FormField';
import { UploadProgress } from '../components/UploadProgress';
import { validateNewJobForm } from '../lib/new-job-form';
import type { NewJobFormErrors, NewJobFormValues } from '../lib/new-job-form';
import { isUploadLinkValid, uploadLinkCreatedAt } from '../lib/upload-link';

export const CREATE_JOB_ERROR_MESSAGE =
  'No se pudo crear el análisis. Intente de nuevo.';
export const UPLOAD_ERROR_MESSAGE =
  'No se pudo subir el PDF. Revise su conexión a internet y pulse "Reintentar subida".';
export const UPLOAD_LINK_EXPIRED_MESSAGE =
  'Pasaron más de 15 minutos y el permiso para subir el PDF venció. Pulse "Empezar de nuevo" para crear un análisis nuevo.';

export const QUERY_PLACEHOLDER =
  'Por ejemplo: "impuestos, aranceles" o "cambios en tarifas de importación de alimentos"';

/** The job created by the first click on "Analizar", kept for "Reintentar subida". */
interface CreatedJob {
  response: CreateJobResponse;
  /** `Date.now()` when it was created, to know when the upload link expires. */
  createdAtMs: number;
}

type SubmitState =
  | { step: 'editing' }
  | { step: 'creating' }
  | { step: 'uploading'; progress: number }
  | { step: 'upload-failed'; canRetry: boolean };

const INITIAL_VALUES: NewJobFormValues = {
  name: '',
  query: '',
  file: null,
  pagesPerBlock: String(DEFAULT_PAGES_PER_BLOCK),
};

/**
 * New analysis (FR-02): the user writes what to look for and chooses the PDF.
 *
 * "Analizar" does two things in a row:
 *   1. `POST /api/jobs` creates the job and returns a presigned POST;
 *   2. the browser uploads the PDF straight to S3 with it, showing progress.
 * If step 2 fails, the job already exists, so "Reintentar subida" repeats only
 * step 2 for the same job instead of creating another one.
 */
export function NewJobPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<NewJobFormValues>(INITIAL_VALUES);
  // A field's error is only shown once the user has used that field, so the
  // form does not open full of red messages.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitState, setSubmitState] = useState<SubmitState>({
    step: 'editing',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  // Refs change immediately, unlike state: a fast double click cannot start a
  // second job before the page re-renders with the disabled button.
  const isSubmittingRef = useRef(false);
  const createdJobRef = useRef<CreatedJob | null>(null);

  // A mutation (not a direct call) so a 401/403 logs the user out like any
  // other API call (src/app.tsx).
  const createJobMutation = useMutation({ mutationFn: createJob });

  const validation = validateNewJobForm(values);
  const errors: NewJobFormErrors = validation.valid ? {} : validation.errors;
  // Once the job exists, the form is locked: the retry must upload the same
  // file for the same job.
  const isLocked = submitState.step !== 'editing';

  function updateValue<K extends keyof NewJobFormValues>(
    field: K,
    value: NewJobFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function markTouched(field: keyof NewJobFormValues) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function visibleError(field: keyof NewJobFormErrors): string | undefined {
    return touched[field] === true ? errors[field] : undefined;
  }

  async function uploadAndOpenJob(createdJob: CreatedJob, file: File) {
    setSubmitState({ step: 'uploading', progress: 0 });
    try {
      await uploadPdf(createdJob.response.upload, file, (progress) => {
        setSubmitState({ step: 'uploading', progress });
      });
    } catch {
      setSubmitState({
        step: 'upload-failed',
        canRetry: isUploadLinkValid(createdJob.createdAtMs),
      });
      return;
    }

    // The history must show the new job when the user goes back to it.
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    await navigate(`/jobs/${createdJob.response.job.id}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser from reloading the page, which is what a form does by default.
    event.preventDefault();
    if (isSubmittingRef.current || !validation.valid || values.file === null) {
      return;
    }
    isSubmittingRef.current = true;
    setCreateError(null);
    setSubmitState({ step: 'creating' });

    let response: CreateJobResponse;
    try {
      response = await createJobMutation.mutateAsync(validation.request);
    } catch (error) {
      // Nothing was created, so the user can fix the form and try again.
      setCreateError(messageForCreateError(error));
      setSubmitState({ step: 'editing' });
      isSubmittingRef.current = false;
      return;
    }

    const createdJob = { response, createdAtMs: uploadLinkCreatedAt() };
    createdJobRef.current = createdJob;
    await uploadAndOpenJob(createdJob, values.file);
  }

  /** After the upload link expired: unlock the form to create a new job. */
  function handleStartOver() {
    createdJobRef.current = null;
    isSubmittingRef.current = false;
    setSubmitState({ step: 'editing' });
  }

  function handleRetryUpload() {
    const createdJob = createdJobRef.current;
    if (createdJob === null || values.file === null) {
      return;
    }
    void uploadAndOpenJob(createdJob, values.file);
  }

  const canSubmit = validation.valid && !isLocked;

  return (
    <section className="new-job">
      <h1>Nuevo análisis</h1>
      <form
        className="new-job__form card"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        {/* A disabled fieldset disables every input inside it. */}
        <fieldset className="new-job__fields" disabled={isLocked}>
          <FormField
            id="new-job-name"
            label="Nombre (opcional)"
            hint="Si lo deja vacío, se usa el nombre del archivo."
            error={visibleError('name')}
          >
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                value={values.name}
                onChange={(event) => updateValue('name', event.target.value)}
                onBlur={() => markTouched('name')}
              />
            )}
          </FormField>

          <FormField
            id="new-job-query"
            label="¿Qué desea buscar?"
            error={visibleError('query')}
          >
            {(inputProps) => (
              <textarea
                {...inputProps}
                rows={3}
                placeholder={QUERY_PLACEHOLDER}
                value={values.query}
                onChange={(event) => updateValue('query', event.target.value)}
                onBlur={() => markTouched('query')}
              />
            )}
          </FormField>

          <FormField
            id="new-job-file"
            label="Archivo PDF"
            error={visibleError('file')}
          >
            {(inputProps) => (
              <input
                {...inputProps}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  updateValue('file', event.target.files?.[0] ?? null);
                  markTouched('file');
                }}
              />
            )}
          </FormField>

          <AdvancedSettings>
            <FormField
              id="new-job-pages-per-block"
              label="Páginas por bloque"
              hint="Cuántas páginas se envían a la IA en cada consulta. Bloques más grandes hacen menos llamadas a la IA, pero pueden ser más lentos o perder precisión."
              error={visibleError('pagesPerBlock')}
            >
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  min={2}
                  step={1}
                  inputMode="numeric"
                  value={values.pagesPerBlock}
                  onChange={(event) => {
                    updateValue('pagesPerBlock', event.target.value);
                    markTouched('pagesPerBlock');
                  }}
                />
              )}
            </FormField>
          </AdvancedSettings>
        </fieldset>

        {submitState.step === 'editing' && (
          <Button type="submit" disabled={!canSubmit}>
            Analizar
          </Button>
        )}
      </form>

      {createError !== null && <ErrorMessage message={createError} />}
      {submitState.step === 'creating' && (
        <UploadProgress label="Creando el análisis…" />
      )}
      {submitState.step === 'uploading' && (
        <UploadProgress
          label="Subiendo el PDF…"
          progress={submitState.progress}
        />
      )}
      {submitState.step === 'upload-failed' && submitState.canRetry && (
        <ErrorMessage
          message={UPLOAD_ERROR_MESSAGE}
          action={{ label: 'Reintentar subida', onClick: handleRetryUpload }}
        />
      )}
      {submitState.step === 'upload-failed' && !submitState.canRetry && (
        <ErrorMessage
          message={UPLOAD_LINK_EXPIRED_MESSAGE}
          action={{ label: 'Empezar de nuevo', onClick: handleStartOver }}
        />
      )}
    </section>
  );
}

/** The Spanish message for an error of `POST /api/jobs`. */
function messageForCreateError(error: unknown): string {
  // The API's own message (for example a validation error) already says what
  // to fix.
  if (error instanceof ApiError) {
    return error.message;
  }
  return CREATE_JOB_ERROR_MESSAGE;
}
