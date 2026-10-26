import { findSource } from "../../provenance/author.ts";
import { parseCents } from "../amount.ts";
import { findAmount, listParameters } from "../proposal.ts";
import type { Rule } from "../rule.ts";
import type { RuleHit } from "../verdict.ts";

export const checkCitationMismatch: Rule = (proposal, { docket }) => {
  const hits: RuleHit[] = [];
  const parameters = listParameters(proposal);
  const amount = findAmount(proposal);
  for (const cited of [...parameters, ...proposal.because]) {
    const source = findSource(docket, cited.cite);
    if (source === undefined) {
      hits.push({ rule: "citation-mismatch", outcome: "deny", reason: `${cited.cite} does not exist in ${docket.disputeId}` });
      continue;
    }
    // note: reasons in because may paraphrase; only parameters must match their source
    if (parameters.includes(cited) && !isQuotedFrom(cited.value, source, cited === amount)) {
      hits.push({ rule: "citation-mismatch", outcome: "deny", reason: `"${cited.value}" is not in ${cited.cite}` });
    }
  }
  return hits;
};

function isQuotedFrom(value: string, source: string, isAmount: boolean): boolean {
  if (isAmount) {
    const cents = parseCents(value);
    return cents !== undefined && cents === parseCents(source);
  }
  const quote = tokenize(value);
  const tokens = tokenize(source);
  if (quote.length === 0) return false;
  for (let start = 0; start + quote.length <= tokens.length; start++) {
    if (quote.every((token, offset) => tokens[start + offset] === token)) return true;
  }
  return false;
}

// threat: substring matching would let "100" hide inside "1000"
function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9@._+-]+/g) ?? [];
  return words.map((w) => w.replace(/^[._-]+|[._-]+$/g, "")).filter((w) => w.length > 0);
}
