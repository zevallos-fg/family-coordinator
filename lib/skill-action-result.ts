export type ActionResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: { userMessage: string; debugMessage: string; code: string } };

/**
 * `warning` is for the half-success: the thing the user asked for happened, but
 * something that came with it did not. Creating a trip saves the trip and then
 * writes a packing list and prep tasks; if those secondary writes fail, returning
 * an error would be a lie (the trip exists) and returning a bare success would be
 * the bug we just spent a sweep finding.
 *
 * Optional, so every existing caller keeps compiling and simply ignores it.
 */
export function ok<T>(data: T, warning?: string): ActionResult<T> {
  return warning ? { ok: true, data, warning } : { ok: true, data };
}

export function err(
  code: string,
  userMessage: string,
  debugMessage: string
): ActionResult<never> {
  return { ok: false, error: { code, userMessage, debugMessage } };
}
