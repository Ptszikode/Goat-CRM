import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { referenceRouter } from "./routers/reference";
import { farmRouter } from "./routers/farm";
import { goatsRouter } from "./routers/goats";
import { healthRouter } from "./routers/health";
import { weightRouter } from "./routers/weight";
import { breedingRouter } from "./routers/breeding";
import { transactionsRouter } from "./routers/transactions";
import { photosRouter } from "./routers/photos";
import { notificationsRouter } from "./routers/notifications";
import { reportsRouter } from "./routers/reports";
import { aiRouter } from "./routers/ai";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  reference: referenceRouter,
  farm: farmRouter,
  goats: goatsRouter,
  health: healthRouter,
  weight: weightRouter,
  breeding: breedingRouter,
  transactions: transactionsRouter,
  photos: photosRouter,
  notifications: notificationsRouter,
  reports: reportsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
