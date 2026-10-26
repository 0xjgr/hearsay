import type { GrantBook } from "../policy/grant-book.ts";
import type { Proposal } from "../policy/proposal.ts";
import type { Verdict } from "../policy/verdict.ts";
import type { Docket } from "../provenance/author.ts";
import type { Json } from "../provenance/trace-dispute.ts";
import { buildRequest, type DisputeRequest } from "./dispute-request.ts";
import type { Toolkit } from "./toolkit.ts";

export type Execution =
  | { kind: "held" }
  | { kind: "refused"; reason: string }
  | { kind: "dry-run"; request: DisputeRequest }
  | { kind: "sent"; request: DisputeRequest; status: number; reply: string }
  | { kind: "failed"; request: DisputeRequest; status: number; reply: string };

export type ExecutionInput = {
  proposal: Proposal;
  verdict: Verdict;
  docket: Docket;
  // note: the dispute as paypal returns it right before the write, not the one the agent read
  freshDispute: Json;
  grants: GrantBook;
  send: { toolkit: Toolkit } | "dry-run";
};

// note: the only code path that writes to paypal
export async function executeProposal(input: ExecutionInput): Promise<Execution> {
  const { proposal, verdict, docket } = input;
  if (proposal.kind === "hold") return { kind: "held" };
  if (verdict.kind === "deny") return { kind: "refused", reason: `denied by ${verdict.hits.map((h) => h.rule).join(",")}` };
  if (verdict.kind === "ask" && !input.grants.spend(docket.disputeId, proposal)) {
    return { kind: "refused", reason: "needs the owner's grant" };
  }
  const built = buildRequest(proposal, docket);
  if (!built.ok) return { kind: "refused", reason: built.error };
  if (!listLinkRels(input.freshDispute).includes(proposal.kind)) {
    return { kind: "refused", reason: `paypal offers no ${proposal.kind} link on ${docket.disputeId} now` };
  }
  if (input.send === "dry-run") return { kind: "dry-run", request: built.request };
  return postRequest(input.send.toolkit, docket.disputeId, built.request);
}

async function postRequest(toolkit: Toolkit, disputeId: string, request: DisputeRequest): Promise<Execution> {
  const headers = await toolkit.client.getHeaders();
  const url = `${toolkit.client.getBaseUrl()}/v1/customer/disputes/${encodeURIComponent(disputeId)}/${request.path}`;
  let body: string | FormData;
  if (request.body.type === "json") {
    body = JSON.stringify(request.body.json);
  } else {
    body = new FormData();
    body.append("input", new Blob([JSON.stringify(request.body.input)], { type: "application/json" }));
    // note: fetch sets the multipart boundary itself
    delete headers["Content-Type"];
    delete headers["content-type"];
  }
  const response = await fetch(url, { method: "POST", headers, body });
  const reply = await response.text();
  return { kind: response.ok ? "sent" : "failed", request, status: response.status, reply };
}

function listLinkRels(dispute: Json): string[] {
  if (dispute === null || typeof dispute !== "object" || Array.isArray(dispute)) return [];
  const links = dispute["links"];
  if (!Array.isArray(links)) return [];
  return links.flatMap((link) => (link !== null && typeof link === "object" && !Array.isArray(link) && typeof link["rel"] === "string" ? [link["rel"]] : []));
}
