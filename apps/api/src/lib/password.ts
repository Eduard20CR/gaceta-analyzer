// Password checks for the Lambda authorizer (ADR-0006, NFR-SEC-01, NFR-SEC-03).
//
// The password is a secret: never log it, not even partially (NFR-OBS-03).

import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'bearer ';

/**
 * Returns the token of an `Authorization: Bearer <token>` header, or `null` if
 * the header is missing, uses another scheme or has an empty token.
 * "Bearer" is matched without caring about upper or lower case (RFC 7235).
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }

  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = trimmed.slice(BEARER_PREFIX.length).trim();
  if (token === '') {
    return null;
  }
  return token;
}

/**
 * True when both passwords are equal, compared in constant time (NFR-SEC-03).
 *
 * Why the hashes: a normal `===` stops at the first different character, so an
 * attacker could measure response times to guess the password one character at
 * a time. `timingSafeEqual` always compares every byte, but it throws when the
 * two inputs have different lengths, and checking the length first would leak
 * the password's length. Hashing both with SHA-256 gives two 32-byte values
 * whatever the input lengths, so the comparison never throws and takes the same
 * time for any input.
 */
export function passwordsMatch(provided: string, expected: string): boolean {
  const providedDigest = sha256(provided);
  const expectedDigest = sha256(expected);
  return timingSafeEqual(providedDigest, expectedDigest);
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}
