// JSON logger for the Lambdas and the local CLI (NFR-OBS-01).
//
// NEVER log the PDF text, the app password or API keys (NFR-OBS-03).
// Log page numbers, counts, ids and durations instead.
//
// Every log is one JSON line, so CloudWatch Logs Insights can filter by field:
//   {"level":"info","message":"Block analyzed","timestamp":"…","jobId":"3f6c","block":4}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Extra fields added to a log line, for example `{ jobId, pageCount }`. */
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

// These fields are always written by the logger itself. A context field with
// the same name is ignored, so a log line can never lie about its level or time.
const RESERVED_FIELDS = new Set(['level', 'message', 'timestamp']);

/**
 * Creates a logger whose lines all include `baseContext`.
 * Typical use: `const log = createLogger({ jobId });` once per job.
 */
export function createLogger(baseContext: LogContext = {}): Logger {
  return {
    debug: (message, context) =>
      writeLog('debug', message, { ...baseContext, ...context }),
    info: (message, context) =>
      writeLog('info', message, { ...baseContext, ...context }),
    warn: (message, context) =>
      writeLog('warn', message, { ...baseContext, ...context }),
    error: (message, context) =>
      writeLog('error', message, { ...baseContext, ...context }),
  };
}

// A logger without a jobId, for code that runs outside a job (for example, at startup).
const defaultLogger = createLogger();

export function debug(message: string, context?: LogContext): void {
  defaultLogger.debug(message, context);
}

export function info(message: string, context?: LogContext): void {
  defaultLogger.info(message, context);
}

export function warn(message: string, context?: LogContext): void {
  defaultLogger.warn(message, context);
}

export function error(message: string, context?: LogContext): void {
  defaultLogger.error(message, context);
}

function writeLog(level: LogLevel, message: string, context: LogContext): void {
  const line = formatLine(level, message, context);

  // debug and info go to stdout, warn and error to stderr.
  // Lambda sends both to CloudWatch Logs.
  if (level === 'warn' || level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** Builds the JSON line. Exported only for tests. */
export function formatLine(
  level: LogLevel,
  message: string,
  context: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const entry: Record<string, unknown> = { level, message, timestamp };

  for (const [key, value] of Object.entries(context)) {
    if (RESERVED_FIELDS.has(key)) {
      continue;
    }
    entry[key] = serializeValue(value);
  }

  try {
    return JSON.stringify(entry);
  } catch {
    // JSON.stringify throws on circular objects or BigInt values. Logging must
    // never break the code that called it, so fall back to the fixed fields.
    return JSON.stringify({
      level,
      message,
      timestamp,
      logError: 'Context could not be serialized',
    });
  }
}

// JSON.stringify turns an Error into "{}" because its fields are not enumerable,
// so errors are converted to a plain object first.
function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }
  return value;
}

function serializeError(err: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };

  // Keep the original error when one error wraps another (`new Error('…', { cause })`).
  if (err.cause !== undefined) {
    serialized['cause'] = serializeValue(err.cause);
  }

  return serialized;
}
