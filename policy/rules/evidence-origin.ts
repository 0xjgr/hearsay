import type { Rule } from "../rule.ts";
import type { RuleHit } from "../verdict.ts";

const SOURCES = { trackingNumber: "merchant:order.tracking", carrier: "merchant:order.carrier" } as const;

// threat: the buyer supplies a "corrected" tracking number, maybe for a parcel that came
// back, and the seller files it as their own proof
export const checkEvidenceOrigin: Rule = (proposal) => {
  if (proposal.kind !== "provide_evidence") return [];
  const hits: RuleHit[] = [];
  for (const field of ["trackingNumber", "carrier"] as const) {
    const cite = proposal[field].cite;
    if (cite === SOURCES[field]) continue;
    hits.push({ rule: "evidence-origin", outcome: "deny", reason: `${field} cites ${cite}, not the store record ${SOURCES[field]}` });
  }
  return hits;
};
