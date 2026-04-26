import { z } from "zod";
import { getAgeClasses, getBreeds, getProductionClasses, createBreed, getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { breeds, ageClasses, productionClasses } from "../../drizzle/schema";

export const referenceRouter = router({
  getBreeds: publicProcedure.query(() => getBreeds()),
  getAgeClasses: publicProcedure.query(() => getAgeClasses()),
  getProductionClasses: publicProcedure.query(() => getProductionClasses()),

  createBreed: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      standardWeightKg: z.number().optional(),
      originCountry: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      return createBreed(input);
    }),

  seedReferenceData: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Admin only");
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Seed breeds
    const existingBreeds = await getBreeds();
    if (existingBreeds.length === 0) {
      await db.insert(breeds).values([
        { name: "Boer", description: "South African meat breed", standardWeightKg: 90, originCountry: "South Africa" },
        { name: "Kalahari Red", description: "Hardy meat breed from Kalahari", standardWeightKg: 75, originCountry: "South Africa" },
        { name: "Savanna", description: "White meat goat breed", standardWeightKg: 80, originCountry: "South Africa" },
        { name: "Angora", description: "Mohair producing breed", standardWeightKg: 45, originCountry: "Turkey" },
        { name: "Nubian", description: "Dual purpose dairy/meat breed", standardWeightKg: 65, originCountry: "Africa" },
        { name: "Alpine", description: "Dairy breed", standardWeightKg: 60, originCountry: "France" },
        { name: "Saanen", description: "High-yield dairy breed", standardWeightKg: 65, originCountry: "Switzerland" },
        { name: "Pygmy", description: "Small compact breed", standardWeightKg: 25, originCountry: "West Africa" },
      ]);
    }

    // Seed age classes
    const existingAgeClasses = await getAgeClasses();
    if (existingAgeClasses.length === 0) {
      await db.insert(ageClasses).values([
        { label: "Kid", minMonths: 0, maxMonths: 3 },
        { label: "Weaner", minMonths: 3, maxMonths: 6 },
        { label: "Yearling", minMonths: 6, maxMonths: 18 },
        { label: "Adult", minMonths: 18, maxMonths: 84 },
        { label: "Senior", minMonths: 84, maxMonths: null },
      ]);
    }

    // Seed production classes
    const existingProdClasses = await getProductionClasses();
    if (existingProdClasses.length === 0) {
      await db.insert(productionClasses).values([
        { label: "Stud", description: "Registered stud animals" },
        { label: "Commercial", description: "Commercial production animals" },
        { label: "Show", description: "Show quality animals" },
        { label: "Breeding Doe", description: "Breeding female" },
        { label: "Wether", description: "Castrated male" },
      ]);
    }

    return { success: true };
  }),
});
