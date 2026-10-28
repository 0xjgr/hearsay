import { readLedger } from "../ledger/ledger-file.ts";
import { listDisputes } from "../paypal/toolkit.ts";
import { listInbox } from "./list-inbox.ts";
import { reviewDispute, type Desk } from "./review-dispute.ts";

// note: the fallback until sandbox webhooks are confirmed; one model call at a time on a laptop gpu
export function pollDisputes(desk: Desk, everySeconds: number): () => void {
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    const listed = await listDisputes(desk.toolkit);
    if (!listed.ok) console.log(`[poll] list failed ${listed.error}`);
    else {
      const due = listInbox(listed.value, readLedger(desk.ledgerPath).entries, desk.frozen).filter(
        (row) => row.status === "WAITING_FOR_SELLER_RESPONSE" && row.isStale && !row.frozen,
      );
      console.log(`[poll] listed=${listed.value.length} due=${due.map((r) => r.disputeId).join(",") || 0}`);
      for (const row of due) {
        const reviewed = await reviewDispute(desk, { disputeId: row.disputeId, warnModel: false });
        if (!reviewed.ok) console.log(`[poll] ${row.disputeId} ${reviewed.error}`);
      }
    }
    timer = setTimeout(tick, everySeconds * 1000);
  };
  void tick();
  return () => clearTimeout(timer);
}
