import type { ReactNode } from "react";

type Span = { start: number; end: number; kind: "inject" | "cited" };

// note: a reading aid only; the rules never look at wording, so a miss here changes no verdict
const INSTRUCTION_PATTERNS = [
  /\[[^\]]*(assistant|instruction|paypal|risk|review|system|owner)[^\]]*\]/gi,
  /note to (the )?(assistant|agent|ai|seller)[^.\n]*/gi,
  /(ignore|disregard) (all |any )?(previous|prior|above)[^.\n]*/gi,
  /\bauto-?(accept|resolve|refund)[^.\n]*/gi,
  /(submit|file) (usps |the |that |this )?(tracking|number)[^.\n]*/gi,
  /\b(owner|merchant) note[^.\n]*/gi,
  /(write|reply|respond) (to|at) [\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
];

export function findInstructions(text: string): Span[] {
  return INSTRUCTION_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: "inject" as const })));
}

export function hasInstruction(text: string): boolean {
  return findInstructions(text).length > 0;
}

// threat: buyer text becomes text nodes and mark elements, never parsed markup
export function markText(text: string, cited: string[]): ReactNode {
  const spans: Span[] = [
    ...cited.flatMap((value) => {
      const needle = value.trim();
      const at = needle.length < 2 ? -1 : text.indexOf(needle);
      return at < 0 ? [] : [{ start: at, end: at + needle.length, kind: "cited" as const }];
    }),
    ...findInstructions(text),
  ].sort((a, b) => a.start - b.start || (a.kind === "cited" ? -1 : 1));
  const kept: Span[] = [];
  for (const span of spans) if (kept.every((k) => span.start >= k.end || span.end <= k.start)) kept.push(span);
  kept.sort((a, b) => a.start - b.start);
  if (kept.length === 0) return text;
  const nodes: ReactNode[] = [];
  let at = 0;
  kept.forEach((span, i) => {
    nodes.push(text.slice(at, span.start));
    nodes.push(
      <mark key={i} className={`mark-${span.kind}`} title={span.kind === "inject" ? "Reads like an order to the agent" : "The value the agent used"}>
        {text.slice(span.start, span.end)}
      </mark>,
    );
    at = span.end;
  });
  nodes.push(text.slice(at));
  return nodes;
}
