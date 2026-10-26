import { z } from "zod";

const PROPOSAL_KINDS = ["accept_claim", "make_offer", "provide_evidence", "send_message", "send_invoice", "hold"] as const;

const OrderRecordSchema = z.object({
  order: z.string(),
  transactionId: z.string(),
  buyerEmail: z.email(),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(["NOT_SHIPPED", "IN_TRANSIT", "DELIVERED"]),
  carrier: z.string().optional(),
  tracking: z.string().optional(),
  shipped: z.string().optional(),
  deliveredOn: z.string().optional(),
});

const StorePolicySchema = z.object({
  enabledActions: z.array(z.enum(PROPOSAL_KINDS)),
  // note: money-out above this needs the owner, in the store currency
  autoLimit: z.string(),
  text: z.string(),
});

export const StoreSchema = z.object({
  policy: StorePolicySchema,
  orders: z.array(OrderRecordSchema),
});

export type Store = z.infer<typeof StoreSchema>;
export type OrderRecord = Store["orders"][number];

export function findOrder(store: Store, transactionId: string): OrderRecord | undefined {
  return store.orders.find((o) => o.transactionId === transactionId);
}

export function listOtherCustomerValues(store: Store, buyerEmail: string): string[] {
  return store.orders
    .filter((o) => o.buyerEmail.toLowerCase() !== buyerEmail.toLowerCase())
    .flatMap((o) => [o.order, o.transactionId, o.buyerEmail, o.tracking ?? ""])
    .filter((v) => v.length > 0);
}
