import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getHerdSummary,
  getMortalityReport,
  getFinancialSummary,
  getBreedingPerformance,
  getUpcomingHealthDue,
  getRecentTransactions,
  getBreeds,
  getAgeClasses,
} from "../db";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned." });
  return farmId;
}

export const reportsRouter = router({
  // Dashboard aggregation
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const farmId = requireFarm(ctx.user.farmId);
    const [herdSummary, upcomingDue, recentTransactions, breedsList, ageClassList] = await Promise.all([
      getHerdSummary(farmId),
      getUpcomingHealthDue(farmId, 14),
      getRecentTransactions(farmId, 5),
      getBreeds(),
      getAgeClasses(),
    ]);
    return { herdSummary, upcomingDue, recentTransactions, breedsList, ageClassList };
  }),

  herdSummary: protectedProcedure.query(async ({ ctx }) => {
    const farmId = requireFarm(ctx.user.farmId);
    const [summary, breedsList, ageClassList] = await Promise.all([
      getHerdSummary(farmId),
      getBreeds(),
      getAgeClasses(),
    ]);
    return { summary, breedsList, ageClassList };
  }),

  mortalityReport: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return getMortalityReport(farmId, input?.startDate, input?.endDate);
    }),

  financialSummary: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return getFinancialSummary(farmId, input?.startDate, input?.endDate);
    }),

  breedingPerformance: protectedProcedure.query(async ({ ctx }) => {
    const farmId = requireFarm(ctx.user.farmId);
    return getBreedingPerformance(farmId);
  }),

  // Export data as JSON (frontend handles CSV/PDF rendering)
  exportHerdSummary: protectedProcedure.query(async ({ ctx }) => {
    const farmId = requireFarm(ctx.user.farmId);
    const [summary, breedsList, ageClassList] = await Promise.all([
      getHerdSummary(farmId),
      getBreeds(),
      getAgeClasses(),
    ]);
    return { summary, breedsList, ageClassList, exportedAt: new Date().toISOString() };
  }),

  exportFinancial: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const { getTransactions } = await import("../db");
      const [summary, transactions] = await Promise.all([
        getFinancialSummary(farmId, input?.startDate, input?.endDate),
        getTransactions(farmId, { startDate: input?.startDate, endDate: input?.endDate }),
      ]);
      return { summary, transactions, exportedAt: new Date().toISOString() };
    }),
});
