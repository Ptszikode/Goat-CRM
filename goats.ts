import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listGoats,
  getGoatById,
  createGoat,
  updateGoat,
  getGoatOffspring,
  getPedigree,
  countGoatsByTag,
  getGoatPhotos,
  getHealthHistory,
  getWeightHistory,
} from "../db";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned. Please set up your farm first." });
  return farmId;
}

function requireWrite(role: string) {
  if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify data." });
}

export const goatsRouter = router({
  list: protectedProcedure
    .input(z.object({
      breedId: z.number().optional(),
      gender: z.string().optional(),
      ageClassId: z.number().optional(),
      healthStatus: z.string().optional(),
      camp: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(0),
      pageSize: z.number().default(20),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      return listGoats(farmId, input ?? {});
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.id, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      const [photos, healthHistory, weightHistory] = await Promise.all([
        getGoatPhotos(input.id),
        getHealthHistory(input.id),
        getWeightHistory(input.id),
      ]);
      return { ...goat, photos, healthHistory, weightHistory };
    }),

  create: protectedProcedure
    .input(z.object({
      tagNumber: z.string().min(1),
      name: z.string().optional(),
      breedId: z.number().optional(),
      ageClassId: z.number().optional(),
      productionClassId: z.number().optional(),
      gender: z.enum(["Buck", "Doe", "Wether"]),
      dateOfBirth: z.string().optional(),
      weightKg: z.number().optional(),
      damId: z.number().optional(),
      sireId: z.number().optional(),
      healthStatus: z.enum(["Healthy", "Sick", "Under_Treatment", "Quarantine", "Deceased"]).optional(),
      locationCamp: z.string().optional(),
      isRegistered: z.boolean().optional(),
      registrationNumber: z.string().optional(),
      purchasePrice: z.number().optional(),
      estimatedValue: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      // Validate unique tag
      const existing = await countGoatsByTag(input.tagNumber, farmId);
      if (existing > 0) throw new TRPCError({ code: "CONFLICT", message: "Tag number already exists in this farm" });
      return createGoat({ ...input, farmId, createdBy: ctx.user.id });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      tagNumber: z.string().min(1).optional(),
      name: z.string().optional(),
      breedId: z.number().optional(),
      ageClassId: z.number().optional(),
      productionClassId: z.number().optional(),
      gender: z.enum(["Buck", "Doe", "Wether"]).optional(),
      dateOfBirth: z.string().optional(),
      weightKg: z.number().optional(),
      damId: z.number().optional(),
      sireId: z.number().optional(),
      healthStatus: z.enum(["Healthy", "Sick", "Under_Treatment", "Quarantine", "Deceased"]).optional(),
      locationCamp: z.string().optional(),
      isRegistered: z.boolean().optional(),
      registrationNumber: z.string().optional(),
      purchasePrice: z.number().optional(),
      estimatedValue: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const { id, tagNumber, dateOfBirth, ...rest } = input;
      const goat = await getGoatById(id, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      if (tagNumber && tagNumber !== goat.tagNumber) {
        const existing = await countGoatsByTag(tagNumber, farmId, id);
        if (existing > 0) throw new TRPCError({ code: "CONFLICT", message: "Tag number already exists" });
      }
      const updateData: Record<string, unknown> = { ...rest };
      if (tagNumber) updateData.tagNumber = tagNumber;
      if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
      await updateGoat(id, farmId, updateData);
      return getGoatById(id, farmId);
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.id, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      await updateGoat(input.id, farmId, { isActive: false });
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      await updateGoat(input.id, farmId, { isActive: true });
      return { success: true };
    }),

  getPedigree: protectedProcedure
    .input(z.object({ id: z.number(), generations: z.number().default(3) }))
    .query(async ({ ctx, input }) => {
      requireFarm(ctx.user.farmId);
      return getPedigree(input.id, input.generations);
    }),

  getOffspring: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireFarm(ctx.user.farmId);
      return getGoatOffspring(input.id);
    }),

  // Get unique camps for filter dropdown
  getCamps: protectedProcedure.query(async ({ ctx }) => {
    const farmId = requireFarm(ctx.user.farmId);
    const { goats } = await listGoats(farmId, { pageSize: 1000 });
    const camps = Array.from(new Set(goats.map(g => g.locationCamp).filter(Boolean)));
    return camps;
  }),
});
