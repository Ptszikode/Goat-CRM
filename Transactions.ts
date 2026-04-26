import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createTransaction,
  getTransactions,
  getFinancialSummary,
  getGoatById,
  updateGoat,
  generateInvoiceRef,
  createGoat,
} from "../db";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned." });
  return farmId;
}

function requireWrite(role: string) {
  if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify data." });
}

export const transactionsRouter = router({
  recordSale: protectedProcedure
    .input(z.object({
      goatId: z.number(),
      price: z.number().min(0),
      currency: z.string().default("USD"),
      buyerName: z.string().optional(),
      buyerContact: z.string().optional(),
      date: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat || !goat.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not available for sale" });
      const invoiceRef = await generateInvoiceRef();
      const txn = await createTransaction({
        goatId: input.goatId,
        transactionType: "Sale",
        price: input.price,
        currency: input.currency,
        counterpartyName: input.buyerName,
        counterpartyContact: input.buyerContact,
        date: input.date,
        invoiceReference: invoiceRef,
        notes: input.notes,
        farmId,
        recordedBy: ctx.user.id,
      });
      await updateGoat(input.goatId, farmId, { isActive: false });
      return { ...txn, invoiceReference: invoiceRef };
    }),

  recordPurchase: protectedProcedure
    .input(z.object({
      // Goat details
      tagNumber: z.string().min(1),
      name: z.string().optional(),
      breedId: z.number().optional(),
      gender: z.enum(["Buck", "Doe", "Wether"]),
      dateOfBirth: z.string().optional(),
      weightKg: z.number().optional(),
      locationCamp: z.string().optional(),
      // Purchase details
      price: z.number().min(0),
      currency: z.string().default("USD"),
      sellerName: z.string().optional(),
      sellerContact: z.string().optional(),
      date: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const { price, currency, sellerName, sellerContact, date, notes, ...goatData } = input;
      const invoiceRef = await generateInvoiceRef();
      // Create the goat
      await createGoat({ ...goatData, farmId, createdBy: ctx.user.id, purchasePrice: price });
      // Get the new goat's ID
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const result = await db.execute(`SELECT id FROM goats WHERE tag_number = '${goatData.tagNumber}' AND farm_id = ${farmId} ORDER BY created_at DESC LIMIT 1`);
      const goatId = ((result as unknown) as { id: number }[])[0]?.id;
      if (!goatId) throw new Error("Failed to create goat");
      const txn = await createTransaction({
        goatId,
        transactionType: "Purchase",
        price,
        currency,
        counterpartyName: sellerName,
        counterpartyContact: sellerContact,
        date,
        invoiceReference: invoiceRef,
        notes,
        farmId,
        recordedBy: ctx.user.id,
      });
      return { goatId, transaction: txn, invoiceReference: invoiceRef };
    }),

  list: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      goatId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return getTransactions(farmId, input ?? {});
    }),

  getFinancialSummary: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return getFinancialSummary(farmId, input?.startDate, input?.endDate);
    }),
});
