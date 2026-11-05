import type { ReviewStatus } from "../../ledger/review-state.ts";
import type { Author } from "../../provenance/author.ts";
import { AUTHOR_WORDS, STATUS_WORDS, type Tone } from "./plain-words.ts";

export function StatusMark({ status }: { status: ReviewStatus | undefined }) {
  const { label, tone } = status === undefined ? { label: "Not read yet", tone: "quiet" as Tone } : STATUS_WORDS[status];
  return <span className={`mark mark-${tone}`}>{label}</span>;
}

export function AuthorTag({ author }: { author: Author }) {
  return <span className={`tag tag-${author}`}>{AUTHOR_WORDS[author]}</span>;
}
