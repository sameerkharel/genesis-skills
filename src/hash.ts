/**
 * Cryptographic SHA-256 hashing utilities backed by Node.js built-in `node:crypto`.
 * Zero external dependencies.
 */

import { createHash } from 'node:crypto';

/**
 * Computes a standard lowercase hex SHA-256 digest (64 characters).
 */
export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
