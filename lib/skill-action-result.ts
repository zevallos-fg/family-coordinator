export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { userMessage: string; debugMessage: string; code: string } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(
  code: string,
  userMessage: string,
  debugMessage: string
): ActionResult<never> {
  return { ok: false, error: { code, userMessage, debugMessage } };
}
