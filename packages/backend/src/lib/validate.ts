import { zValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";
import type { Context } from "hono";

// Wraps @hono/zod-validator with a default-error response shape that matches
// the rest of the API: `{ error: <code>, message: <first issue> }`.
// The frontend's `isApiError` checks for those two keys plus `status`.
export function validate<T extends ZodSchema>(
  target: "json" | "query" | "param" | "form" | "header" | "cookie",
  schema: T,
) {
  return zValidator(target, schema, (result, c: Context) => {
    if (!result.success) {
      const first = result.error.issues[0];
      return c.json(
        { error: "invalid_input", message: first?.message ?? "invalid input" },
        400,
      );
    }
    return undefined;
  });
}
