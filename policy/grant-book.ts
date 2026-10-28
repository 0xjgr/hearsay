import type { Proposal } from "./proposal.ts";

// note: a grant is the owner's yes to one exact proposal on one dispute, spent on use
export class GrantBook {
  readonly #open = new Set<string>();

  grant(disputeId: string, proposal: Proposal): void {
    this.#open.add(fingerprint(disputeId, proposal));
  }

  has(disputeId: string, proposal: Proposal): boolean {
    return this.#open.has(fingerprint(disputeId, proposal));
  }

  // threat: a grant reused for a changed amount or a second refund
  spend(disputeId: string, proposal: Proposal): boolean {
    return this.#open.delete(fingerprint(disputeId, proposal));
  }
}

function fingerprint(disputeId: string, proposal: Proposal): string {
  return JSON.stringify([disputeId, sortKeys(proposal)]);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]));
}
