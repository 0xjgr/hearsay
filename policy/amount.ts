// note: amounts as integer cents so 22 and 22.00 compare equal
export function parseCents(amount: string): number | undefined {
  // threat: long digit strings (tracking numbers) lose precision as floats and compare equal
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (match === null) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
