import type { ReviewStatus } from "../../ledger/review-state.ts";
import type { Author } from "../../provenance/author.ts";

const STATUS_TONE: Record<ReviewStatus, "allow" | "ask" | "deny" | "quiet"> = {
  "agent-error": "deny",
  held: "quiet",
  denied: "deny",
  pending: "ask",
  approved: "allow",
  rejected: "quiet",
  "dry-run": "allow",
  refused: "deny",
  sent: "allow",
  failed: "deny",
};

export function StatusMark({ status }: { status: ReviewStatus }) {
  return <span className={`mark mark-${STATUS_TONE[status]}`}>{status}</span>;
}

export function AuthorTag({ author }: { author: Author }) {
  return <span className={`tag tag-${author}`}>{author}</span>;
}

const REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "not as described",
  UNAUTHORISED: "unauthorised",
  CREDIT_NOT_PROCESSED: "credit not processed",
  DUPLICATE_TRANSACTION: "duplicate",
  INCORRECT_AMOUNT: "incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "paid by other means",
  CANCELED_RECURRING_BILLING: "canceled recurring",
};

export function labelReason(reason: string): string {
  return REASONS[reason] ?? reason.toLowerCase().replaceAll("_", " ");
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
