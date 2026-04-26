import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

export const aiRouter = router({
  ask: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({ messages: input.messages });
      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : (Array.isArray(rawContent) ? (rawContent as { type: string; text?: string }[]).filter(c => c.type === "text").map(c => c.text ?? "").join("") : "I'm sorry, I could not generate a response.");
      return { content };
    }),
});
