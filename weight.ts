import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createWeightRecord,
  getWeightHistory,
  getLastTwoWeights,
  getGoatById,
  updateGoat,
  createNotification,
  listGoats,
  getBreeds,
  getDb,
} from "../db";
import { weightRecords, goats } from "../../drizzle/schema";
import { desc, eq, and } from "drizzle-orm";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned." });
  return farmId;
}

function requireWrite(role: string) {
  if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify data." });
}

async function checkWeightAnomaly(goatId: number, newWeight: number, userId: number, farmId: number) {
  const prev = await getLastTwoWeights(goatId);
  if (prev.length < 2) return;
  const prevWeight = prev[1]?.weightKg;
  if (!prevWeight) return;
  const pctChange = Math.abs(newWeight - prevWeight) / prevWeight * 100;
  if (pctChange > 15) {
    const goat = await getGoatById(goatId, farmId);
    await createNotification({
      userId,
      type: "Weight_Check",
      message: `Unusual weight change (${pctChange.toFixed(1)}%) detected for goat ${goat?.tagNumber ?? goatId}`,
      relatedGoatId: goatId,
      farmId,
    });
  }
}

export const weightRouter = router({
  record: protectedProcedure
    .input(z.object({
      goatId: z.number(),
      weightKg: z.number().min(0.1).max(300),
      date: z.string(),
      method: z.enum(["Scale", "Tape_Measure", "Estimate"]).default("Scale"),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      const record = await createWeightRecord({ ...input, recordedBy: ctx.user.id });
      await updateGoat(input.goatId, farmId, { weightKg: input.weightKg });
      await checkWeightAnomaly(input.goatId, input.weightKg, ctx.user.id, farmId);
      return record;
    }),

  getHistory: protectedProcedure
    .input(z.object({ goatId: z.number() }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      return getWeightHistory(input.goatId);
    }),

  getBreedComparison: protectedProcedure
    .input(z.object({ goatId: z.number() }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      if (!goat.breedId) return { actual: goat.weightKg, standard: null, deviation: null };
      const breeds = await getBreeds();
      const breed = breeds.find(b => b.id === goat.breedId);
      if (!breed?.standardWeightKg) return { actual: goat.weightKg, standard: null, deviation: null };
      const deviation = goat.weightKg
        ? ((goat.weightKg - breed.standardWeightKg) / breed.standardWeightKg) * 100
        : null;
      return { actual: goat.weightKg, standard: breed.standardWeightKg, deviation, breedName: breed.name };
    }),

  getRecentWeighins: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: weightRecords.id,
          goatId: weightRecords.goatId,
          tagNumber: goats.tagNumber,
          goatName: goats.name,
          weightKg: weightRecords.weightKg,
          date: weightRecords.date,
          method: weightRecords.method,
        })
        .from(weightRecords)
        .innerJoin(goats, eq(weightRecords.goatId, goats.id))
        .where(eq(goats.farmId, farmId))
        .orderBy(desc(weightRecords.date))
        .limit(input.limit);
    }),

  getAnomalies: protectedProcedure
    .query(async ({ ctx }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const db = await getDb();
      if (!db) return [];
      // Get all active goats in farm
      const farmGoats = await db.select().from(goats).where(and(eq(goats.farmId, farmId), eq(goats.isActive, true)));
      const anomalies: {
        goatId: number; tagNumber: string; goatName: string | null;
        previousWeight: number; currentWeight: number; changePercent: number; date: Date;
      }[] = [];
      for (const g of farmGoats) {
        const history = await getLastTwoWeights(g.id);
        if (history.length < 2) continue;
        const [current, previous] = history;
        if (!current || !previous || !current.weightKg || !previous.weightKg) continue;
        const pctChange = ((current.weightKg - previous.weightKg) / previous.weightKg) * 100;
        if (Math.abs(pctChange) > 15) {
          anomalies.push({
            goatId: g.id,
            tagNumber: g.tagNumber,
            goatName: g.name,
            previousWeight: previous.weightKg,
            currentWeight: current.weightKg,
            changePercent: pctChange,
            date: current.date,
          });
        }
      }
      return anomalies;
    }),

  bulkRecord: protectedProcedure
    .input(z.object({
      date: z.string(),
      method: z.enum(["Scale", "Tape_Measure", "Estimate"]).default("Scale"),
      entries: z.array(z.object({
        goatId: z.number(),
        weightKg: z.number().min(0.1).max(300),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      let count = 0;
      for (const entry of input.entries) {
        const goat = await getGoatById(entry.goatId, farmId);
        if (!goat) continue;
        await createWeightRecord({ goatId: entry.goatId, weightKg: entry.weightKg, date: input.date, method: input.method, recordedBy: ctx.user.id });
        await updateGoat(entry.goatId, farmId, { weightKg: entry.weightKg });
        await checkWeightAnomaly(entry.goatId, entry.weightKg, ctx.user.id, farmId);
        count++;
      }
      return { count };
    }),

  bulkWeighIn: protectedProcedure
    .input(z.object({
      entries: z.array(z.object({
        tagNumber: z.string(),
        weightKg: z.number().min(0.1).max(300),
        date: z.string(),
        method: z.enum(["Scale", "Tape_Measure", "Estimate"]).default("Scale"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const { goats: allGoats } = await listGoats(farmId, { pageSize: 9999 });
      const results: { success: string[]; errors: string[] } = { success: [], errors: [] };
      for (const entry of input.entries) {
        const goat = allGoats.find(g => g.tagNumber === entry.tagNumber);
        if (!goat) { results.errors.push(entry.tagNumber); continue; }
        await createWeightRecord({ goatId: goat.id, weightKg: entry.weightKg, date: entry.date, method: entry.method, recordedBy: ctx.user.id });
        await updateGoat(goat.id, farmId, { weightKg: entry.weightKg });
        await checkWeightAnomaly(goat.id, entry.weightKg, ctx.user.id, farmId);
        results.success.push(entry.tagNumber);
      }
      return results;
    }),
});
