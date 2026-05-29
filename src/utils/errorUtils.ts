/**
 * Extracts a human-readable message from a raw error string.
 * Handles plain strings as well as JSON shapes from the Power Platform SDK:
 *   { "status": 442, "message": "..." }
 *   { "error": { "code": "...", "message": "..." } }
 */
export function extractMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    return parsed?.error?.message ?? parsed?.message ?? trimmed;
  } catch {
    return trimmed;
  }
}
