// PostgREST access, always as the mapped user.
//
// Every request carries that user's access token in Authorization, alongside the
// public anon key as apikey. There is no service-role path: the only credential
// this module can present belongs to a single `sub`, so RLS decides what it sees.
// The anon key adds nothing on its own — by itself it is role=anon.

export class SupabaseError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

export class UserClient {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly userJWT: string
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = new URL(`/rest/v1/${path}`, this.baseUrl);

    // A relative path must not be able to redirect this at another host.
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new SupabaseError("refusing to call a host other than the configured project", 500);
    }

    const res = await fetch(url, {
      ...init,
      redirect: "error",
      headers: {
        // The gateway validates `apikey` as a project API key and rejects a user
        // token there ("Invalid API key"). The anon key is the right value: it is
        // public, ships in the browser bundle, and carries role=anon. Authorization
        // is what actually binds the request to the user, and RLS follows that.
        apikey: this.anonKey,
        Authorization: `Bearer ${this.userJWT}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    const body = text ? safeJSON(text) : null;

    if (!res.ok) {
      // RLS denials surface as 401/403, or as an empty result on reads. Either way
      // they are reported, never swallowed.
      throw new SupabaseError(
        typeof body === "object" && body && "message" in body
          ? String((body as { message: unknown }).message)
          : `PostgREST ${res.status}`,
        res.status,
        body
      );
    }
    return body;
  }

  async insert<T = unknown>(table: string, row: Record<string, unknown>): Promise<T> {
    const rows = (await this.request(table, {
      method: "POST",
      body: JSON.stringify(row),
      headers: { Prefer: "return=representation" },
    })) as T[];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new SupabaseError("insert returned no row (RLS refused it)", 403);
    }
    return rows[0];
  }

  async select<T = unknown>(table: string, query: string): Promise<T[]> {
    return (await this.request(`${table}?${query}`)) as T[];
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    return (await this.request(`rpc/${fn}`, {
      method: "POST",
      body: JSON.stringify(args),
    })) as T;
  }

  /**
   * The caller's family, read through their own token.
   *
   * Resolved server-side on purpose: family_id is never accepted from a tool call,
   * so a request cannot aim a write at a family the user is not in. RLS would
   * refuse it anyway — this makes the refusal unnecessary rather than relied upon.
   */
  async familyId(): Promise<string> {
    const rows = await this.select<{ family_id: string }>(
      "family_members",
      "select=family_id&limit=2"
    );
    if (!rows.length) throw new SupabaseError("this user belongs to no family", 403);
    if (rows.length > 1) {
      // Refuse rather than guess. Picking the first would silently file a write
      // against whichever family happened to sort first, and the row is append-only.
      throw new SupabaseError(
        "this user belongs to more than one family; the connector cannot tell which one " +
          "a write is meant for. Split the connector token per family before using it.",
        409
      );
    }
    return rows[0].family_id;
  }
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
