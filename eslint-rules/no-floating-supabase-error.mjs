/**
 * no-floating-supabase-error
 *
 * A PostgREST call returns `{ data, error }`. Whenever the `error` half is
 * dropped, the failure has to disguise itself as something else, and the code
 * downstream believes the disguise:
 *
 *   - `?? []`   turns a failed read into "you have nothing"
 *   - `?? 0`    turned a broken API key into 21 cents of spend and a clean row
 *   - `if (!row) notFound()` turns a failed read into "that does not exist" —
 *     which is what /caregiver-view did to every caregiver for months
 *   - an unassigned `await supabase.from(...).insert(...)` turned every trip's
 *     prep tasks into nothing at all
 *
 * Four instances of that shape reached production in one week. This rule exists
 * so a fifth cannot arrive quietly.
 *
 * FLAGGED
 *   const { data } = await supabase.from("x").select()        // error dropped
 *   const { data, error } = await …; // and `error` never referenced again
 *   await supabase.from("x").insert(row);                     // result discarded
 *
 * NOT FLAGGED
 *   const { data, error } = await …; if (error) …             // handled
 *   const res = await …; if (res.error) …                     // handled
 *   await supabase.from("x").insert(row); // supabase-error-ignored: fire-and-forget telemetry
 *
 * The escape hatch is deliberate and deliberately noisy: a trailing
 * `// supabase-error-ignored: <reason>` on the statement. Dropping an error is
 * sometimes right. Dropping it silently never is.
 */

const ACK = /supabase-error-ignored:\s*\S/;

/** Does this call chain start from something that looks like a Supabase client? */
function isSupabaseChain(node) {
  let cur = node;
  let sawTerminal = false;
  while (cur) {
    if (cur.type === "CallExpression") {
      const callee = cur.callee;
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        const name = callee.property.name;
        if (name === "from" || name === "rpc") sawTerminal = true;
        cur = callee.object;
        continue;
      }
      cur = callee;
      continue;
    }
    if (cur.type === "MemberExpression") {
      cur = cur.object;
      continue;
    }
    break;
  }
  return sawTerminal;
}

/** `error` in the destructuring pattern, and the local name it binds to. */
function errorBinding(pattern) {
  if (!pattern || pattern.type !== "ObjectPattern") return null;
  for (const prop of pattern.properties) {
    if (prop.type !== "Property") continue;
    if (prop.key.type === "Identifier" && prop.key.name === "error") {
      return prop.value.type === "Identifier" ? prop.value.name : null;
    }
  }
  return null;
}

function hasAcknowledgement(context, node) {
  const source = context.sourceCode ?? context.getSourceCode();
  const comments = [
    ...source.getCommentsBefore(node),
    ...source.getCommentsAfter(node),
  ];
  // Also any comment on the same line as the statement's last token.
  const last = source.getLastToken(node);
  if (last) {
    for (const c of source.getAllComments()) {
      if (c.loc.start.line === last.loc.end.line) comments.push(c);
    }
  }
  return comments.some((c) => ACK.test(c.value));
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require the error half of a Supabase response to be read, or explicitly acknowledged",
    },
    schema: [],
    messages: {
      discarded:
        "This Supabase call's result is discarded, so a failure is invisible. Capture `{ error }` and handle it, or add `// supabase-error-ignored: <reason>`.",
      notDestructured:
        "This Supabase response destructures `data` but not `error`, so a failed query becomes an empty result. Add `error` and handle it, or add `// supabase-error-ignored: <reason>`.",
      unused:
        "`{{name}}` is captured but never read, so a failed query is indistinguishable from an empty one. Handle it, or add `// supabase-error-ignored: <reason>`.",
    },
  },

  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();

    function statementOf(node) {
      let cur = node;
      while (cur.parent && !/Statement|Declaration/.test(cur.parent.type)) cur = cur.parent;
      return cur.parent ?? cur;
    }

    return {
      AwaitExpression(node) {
        if (!isSupabaseChain(node.argument)) return;

        const parent = node.parent;

        // 1. `await supabase.from(...).insert(...)` as a bare statement.
        if (parent.type === "ExpressionStatement") {
          if (!hasAcknowledgement(context, parent)) {
            context.report({ node, messageId: "discarded" });
          }
          return;
        }

        if (parent.type !== "VariableDeclarator") return;
        const pattern = parent.id;
        if (pattern.type !== "ObjectPattern") return; // `const res = await …` — res.error may be read

        const stmt = statementOf(parent);

        // 2. destructured, but `error` is not among the properties.
        const hasRest = pattern.properties.some((p) => p.type === "RestElement");
        const errName = errorBinding(pattern);
        if (!errName && !hasRest) {
          if (!hasAcknowledgement(context, stmt)) {
            context.report({ node: pattern, messageId: "notDestructured" });
          }
          return;
        }
        if (!errName) return;

        // 3. captured, but never referenced again.
        const scope = source.getScope ? source.getScope(node) : context.getScope();
        const variable = findVariable(scope, errName);
        const reads = variable ? variable.references.filter((r) => r.isRead()) : [];
        if (reads.length === 0 && !hasAcknowledgement(context, stmt)) {
          context.report({
            node: pattern,
            messageId: "unused",
            data: { name: errName },
          });
        }
      },
    };
  },
};

function findVariable(scope, name) {
  let cur = scope;
  while (cur) {
    const found = cur.variables.find((v) => v.name === name);
    if (found) return found;
    cur = cur.upper;
  }
  return null;
}
