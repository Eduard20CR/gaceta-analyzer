import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { createLogger, formatLine, info, warn } from '../src/lib/logger';

// Captures what the logger writes, so tests can read each line as JSON.
let stdout: MockInstance<typeof console.log>;
let stderr: MockInstance<typeof console.error>;

beforeEach(() => {
  stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T20:18:00.000Z'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function parseLine(
  spy: MockInstance<(...args: unknown[]) => void>,
  callIndex = 0,
): Record<string, unknown> {
  const call = spy.mock.calls[callIndex];
  if (call === undefined) {
    throw new Error(`No log line at index ${callIndex}`);
  }
  return JSON.parse(String(call[0])) as Record<string, unknown>;
}

describe('log line format', () => {
  it('writes one JSON line with level, message and timestamp', () => {
    info('Job created');

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(parseLine(stdout)).toEqual({
      level: 'info',
      message: 'Job created',
      timestamp: '2026-11-04T20:18:00.000Z',
    });
  });

  it('adds the context fields', () => {
    info('PDF read', { pageCount: 120, durationMs: 850 });

    expect(parseLine(stdout)).toMatchObject({
      pageCount: 120,
      durationMs: 850,
    });
  });

  it('writes debug and info to stdout, warn and error to stderr', () => {
    const log = createLogger();

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(parseLine(stdout, 0).level).toBe('debug');
    expect(parseLine(stdout, 1).level).toBe('info');
    expect(parseLine(stderr, 0).level).toBe('warn');
    expect(parseLine(stderr, 1).level).toBe('error');
  });

  it('does not let the context overwrite level, message or timestamp', () => {
    warn('Real message', {
      level: 'debug',
      message: 'fake',
      timestamp: 'yesterday',
    });

    expect(parseLine(stderr)).toEqual({
      level: 'warn',
      message: 'Real message',
      timestamp: '2026-11-04T20:18:00.000Z',
    });
  });

  it('still writes a valid line when the context cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const line = formatLine('info', 'Odd context', { circular });

    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.message).toBe('Odd context');
    expect(parsed.logError).toBeTypeOf('string');
  });
});

describe('createLogger with a jobId', () => {
  it('includes the jobId in every line', () => {
    const log = createLogger({ jobId: '3f6c' });

    log.info('Started');
    log.warn('Discarded invalid findings', { count: 2 });
    log.error('Failed');

    expect(parseLine(stdout)).toMatchObject({ jobId: '3f6c' });
    expect(parseLine(stderr, 0)).toMatchObject({ jobId: '3f6c', count: 2 });
    expect(parseLine(stderr, 1)).toMatchObject({ jobId: '3f6c' });
  });
});

describe('error serialization', () => {
  it('writes name, message and stack instead of {}', () => {
    const log = createLogger({ jobId: '3f6c' });

    log.error('Block failed', { error: new TypeError('Bad response') });

    const logged = parseLine(stderr).error as Record<string, unknown>;
    expect(logged.name).toBe('TypeError');
    expect(logged.message).toBe('Bad response');
    expect(logged.stack).toContain('TypeError: Bad response');
  });

  it('includes the cause of a wrapped error', () => {
    const cause = new Error('Timeout');

    warn('Retrying', { error: new Error('DeepSeek call failed', { cause }) });

    const logged = parseLine(stderr).error as Record<string, unknown>;
    expect(logged.cause).toMatchObject({ name: 'Error', message: 'Timeout' });
  });
});
