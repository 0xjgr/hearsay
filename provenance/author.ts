export type Author = "paypal" | "merchant" | "buyer";

export type SegmentId = `seg-${number}`;
export type FactKey = `paypal:${string}` | `merchant:${string}`;
export type Citation = FactKey | SegmentId;

// note: a segment is anything the buyer wrote or picked, free text or not
export type Segment = { id: SegmentId; path: string; text: string };
export type Fact = { key: FactKey; value: string };

export type Docket = {
  disputeId: string;
  segments: Segment[];
  facts: Fact[];
};

export function isSegmentId(citation: string): citation is SegmentId {
  return /^seg-\d+$/.test(citation);
}

export function authorOfCitation(citation: Citation): Author {
  if (isSegmentId(citation)) return "buyer";
  return citation.startsWith("paypal:") ? "paypal" : "merchant";
}

export function findSource(docket: Docket, citation: Citation): string | undefined {
  if (isSegmentId(citation)) return docket.segments.find((s) => s.id === citation)?.text;
  return docket.facts.find((f) => f.key === citation)?.value;
}
