export type RuleId =
  | "action-in-policy"
  | "citation-mismatch"
  | "amount-origin"
  | "hearsay"
  | "record-conflict"
  | "recipient-origin"
  | "evidence-origin"
  | "contact-origin"
  | "customer-scope"
  | "auto-limit"
  | "tool-scope";

export type RuleHit = { rule: RuleId; outcome: "ask" | "deny"; reason: string };

export type Verdict =
  | { kind: "allow" }
  | { kind: "ask"; hits: RuleHit[] }
  | { kind: "deny"; hits: RuleHit[] };

export function reachVerdict(hits: RuleHit[]): Verdict {
  if (hits.some((h) => h.outcome === "deny")) return { kind: "deny", hits };
  if (hits.length > 0) return { kind: "ask", hits };
  return { kind: "allow" };
}
