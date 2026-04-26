import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createHealthRecord,
  getHealthHistory,
  getUpcomingHealthDue,
  getGoatById,
  updateGoat,
  createTransaction,
  createNotification,
  generateInvoiceRef,
} from "../db";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned." });
  return farmId;
}

function requireWrite(role: string) {
  if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify data." });
}

export const healthRouter = router({
  addRecord: protectedProcedure
    .input(z.object({
      goatId: z.number(),
      recordType: z.enum(["Vaccination", "Treatment", "Deworming", "Checkup", "Surgery"]),
      productUsed: z.string().optional(),
      dosage: z.string().optional(),
      vetName: z.string().optional(),
      vetContact: z.string().optional(),
      date: z.string(),
      nextDueDate: z.string().optional(),
      cost: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });

      const record = await createHealthRecord({ ...input, recordedBy: ctx.user.id });

      // Update health status if treatment
      if (input.recordType === "Treatment") {
        await updateGoat(input.goatId, farmId, { healthStatus: "Under_Treatment" });
      }

      // Schedule notification if next due date
      if (input.nextDueDate) {
        await createNotification({
          userId: ctx.user.id,
          type: "Health_Due",
          message: `${input.recordType} due for ${goat.tagNumber}${goat.name ? ` (${goat.name})` : ""} on ${input.nextDueDate}`,
          relatedGoatId: input.goatId,
          farmId,
        });
      }

      return record;
    }),

  getHistory: protectedProcedure
    .input(z.object({ goatId: z.number() }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      return getHealthHistory(input.goatId);
    }),

  getUpcomingDue: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return getUpcomingHealthDue(farmId, input.daysAhead);
    }),

  markHealthy: protectedProcedure
    .input(z.object({ goatId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      await updateGoat(input.goatId, farmId, { healthStatus: "Healthy" });
      return { success: true };
    }),

  markDeceased: protectedProcedure
    .input(z.object({ goatId: z.number(), cause: z.string().optional(), date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      await updateGoat(input.goatId, farmId, { healthStatus: "Deceased", isActive: false });
      const invoiceRef = await generateInvoiceRef();
      await createTransaction({
        goatId: input.goatId,
        transactionType: "Death_Loss",
        price: 0,
        date: input.date,
        notes: input.cause,
        invoiceReference: invoiceRef,
        farmId,
        recordedBy: ctx.user.id,
      });
      return { success: true };
    }),

  bulkVaccinate: protectedProcedure
    .input(z.object({
      recordType: z.enum(["Vaccination", "Treatment", "Deworming", "Checkup", "Surgery"]),
      productUsed: z.string().optional(),
      dosage: z.string().optional(),
      vetName: z.string().optional(),
      date: z.string(),
      nextDueDate: z.string().optional(),
      cost: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      // Get all active goats in the farm
      const { listGoats: lg } = await import("../db");
      const { goats: allGoats } = await lg(farmId, { pageSize: 9999 });
      const results = [];
      for (const goat of allGoats) {
        const record = await createHealthRecord({ ...input, goatId: goat.id, recordedBy: ctx.user.id });
        results.push(record);
      }
      return { count: results.length, success: true };
    }),
});
