import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createFarm,
  getFarmById,
  getFarmUsers,
  getUserById,
  removeUserFromFarm,
  updateFarm,
  updateUserRole,
  getDb,
} from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const farmRouter = router({
  // Get current farm info
  getFarm: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.farmId) return null;
    return getFarmById(ctx.user.farmId);
  }),

  // Create or update farm
  upsertFarm: protectedProcedure
    .input(z.object({
      farmName: z.string().min(1),
      ownerName: z.string().optional(),
      location: z.string().optional(),
      contactNumber: z.string().optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.farmId) {
        if (ctx.user.role !== "admin") throw new Error("Only admin can update farm");
        await updateFarm(ctx.user.farmId, input);
        return getFarmById(ctx.user.farmId);
      } else {
        // Create new farm and assign to user
        await createFarm(input);
        const db = await getDb();
        if (!db) throw new Error("DB not available");
        const farm = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        // Get the newly created farm
        const allFarms = await db.execute(`SELECT id FROM farms ORDER BY created_at DESC LIMIT 1`);
        const farmId = ((allFarms as unknown) as { id: number }[])[0]?.id;
        if (farmId) {
          await db.update(users).set({ farmId, role: "admin" }).where(eq(users.id, ctx.user.id));
        }
        return farmId ? getFarmById(farmId) : null;
      }
    }),

  // List farm users
  getUsers: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.farmId) return [];
    return getFarmUsers(ctx.user.farmId);
  }),

  // Update user role (admin only)
  updateUserRole: protectedProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["admin", "farmer", "viewer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      if (input.userId === ctx.user.id) throw new Error("Cannot change your own role");
      const targetUser = await getUserById(input.userId);
      if (!targetUser || targetUser.farmId !== ctx.user.farmId) throw new Error("User not found in your farm");
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  // Remove user from farm (admin only)
  removeUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      if (input.userId === ctx.user.id) throw new Error("Cannot remove yourself");
      const targetUser = await getUserById(input.userId);
      if (!targetUser || targetUser.farmId !== ctx.user.farmId) throw new Error("User not found in your farm");
      await removeUserFromFarm(input.userId);
      return { success: true };
    }),

  // Ensure user has a farm (auto-create if first login)
  ensureFarm: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.farmId) return { farmId: ctx.user.farmId };
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    // Create default farm for this user
    await createFarm({ farmName: `${ctx.user.name ?? "My"} Farm`, ownerName: ctx.user.name ?? undefined });
    const result = await db.execute(`SELECT id FROM farms ORDER BY created_at DESC LIMIT 1`);
    const farmId = ((result as unknown) as { id: number }[])[0]?.id;
    if (farmId) {
      await db.update(users).set({ farmId, role: "admin" }).where(eq(users.id, ctx.user.id));
    }
    return { farmId };
  }),
});
