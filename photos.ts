import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getGoatById,
  getGoatPhotos,
  createGoatPhoto,
  setPrimaryPhoto,
  updatePhotoLabel,
  deletePhoto,
  getPhotoById,
} from "../db";
import { storagePut } from "../storage";

function requireFarm(farmId: number | null | undefined) {
  if (!farmId) throw new TRPCError({ code: "FORBIDDEN", message: "No farm assigned." });
  return farmId;
}

function requireWrite(role: string) {
  if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify data." });
}

export const photosRouter = router({
  getPhotos: protectedProcedure
    .input(z.object({ goatId: z.number() }))
    .query(async ({ ctx, input }) => {
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });
      return getGoatPhotos(input.goatId);
    }),

  uploadPhoto: protectedProcedure
    .input(z.object({
      goatId: z.number(),
      imageBase64: z.string(), // base64 encoded image
      mimeType: z.string().default("image/jpeg"),
      label: z.enum(["Left_Side", "Right_Side", "Face", "Full_Body", "Ear_Tag", "General"]).default("General"),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "NOT_FOUND", message: "Goat not found" });

      // Convert base64 to buffer and upload
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `goats/${farmId}/${input.goatId}/${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      // Check if this should be primary (first photo)
      const existingPhotos = await getGoatPhotos(input.goatId);
      const isPrimary = existingPhotos.length === 0;

      const photo = await createGoatPhoto({
        goatId: input.goatId,
        imageUrl: url,
        thumbnailUrl: url,
        label: input.label,
        isPrimary,
        uploadedBy: ctx.user.id,
      });
      return photo;
    }),

  setPrimary: protectedProcedure
    .input(z.object({ photoId: z.number(), goatId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized" });
      await setPrimaryPhoto(input.photoId, input.goatId);
      return { success: true };
    }),

  updateLabel: protectedProcedure
    .input(z.object({
      photoId: z.number(),
      goatId: z.number(),
      label: z.enum(["Left_Side", "Right_Side", "Face", "Full_Body", "Ear_Tag", "General"]),
    }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized" });
      await updatePhotoLabel(input.photoId, input.label);
      return { success: true };
    }),

  deletePhoto: protectedProcedure
    .input(z.object({ photoId: z.number(), goatId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireWrite(ctx.user.role);
      const farmId = requireFarm(ctx.user.farmId);
      const goat = await getGoatById(input.goatId, farmId);
      if (!goat) throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized" });
      const photo = await getPhotoById(input.photoId);
      if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
      await deletePhoto(input.photoId);
      // If deleted was primary, set next as primary
      if (photo.isPrimary) {
        const remaining = await getGoatPhotos(input.goatId);
        if (remaining.length > 0 && remaining[0]) {
          await setPrimaryPhoto(remaining[0].id, input.goatId);
        }
      }
      return { success: true };
    }),
});
