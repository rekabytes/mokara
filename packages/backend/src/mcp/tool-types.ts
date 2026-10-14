import type { z } from "zod";
import type { McpScope } from "./permissions.ts";
export type ToolRegistrar = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<S>,
  action: (input: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
  options?: {
    scope?: McpScope;
    destructive?: boolean;
    external?: boolean;
    readOnly?: boolean;
    image?: boolean;
  }
) => void;
