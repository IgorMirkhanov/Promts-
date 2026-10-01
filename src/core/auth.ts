import { timingSafeEqual } from 'node:crypto';

export function checkPassword(provided: string): boolean {
  const required = process.env.APP_PASSWORD;
  if (!required) return true; // No password set

  try {
    const providedBuf = Buffer.from(provided);
    const requiredBuf = Buffer.from(required);

    // Pad to same length for timing-safe comparison
    const maxLen = Math.max(providedBuf.length, requiredBuf.length);
    const paddedProvided = Buffer.alloc(maxLen);
    const paddedRequired = Buffer.alloc(maxLen);
    providedBuf.copy(paddedProvided);
    requiredBuf.copy(paddedRequired);

    return timingSafeEqual(paddedProvided, paddedRequired);
  } catch {
    return false;
  }
}

export function requireAuth(request: Request): boolean {
  if (!process.env.APP_PASSWORD) return true;

  const password = request.headers.get('x-app-password');
  return password ? checkPassword(password) : false;
}
