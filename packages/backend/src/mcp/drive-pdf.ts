import { Worker } from "node:worker_threads";
import { z } from "zod";
import { McpFailure } from "./errors.ts";
const pdfResult = z.object({
  total_pages: z.number().int().positive(),
  pages: z
    .array(
      z.object({
        page_number: z.number().int().positive(),
        text: z.string().max(16000),
        next_text_offset: z.number().int().nonnegative().nullable(),
        no_extractable_text: z.boolean(),
      })
    )
    .max(5),
  next_page: z.number().int().positive().nullable(),
});
let active = 0;
/** CPU-bound untrusted PDF parsing runs off the request thread with a deadline. */
export async function readPdfText(
  bytes: Uint8Array,
  firstPage: number,
  pageCount: number,
  textOffset: number
) {
  if (active >= 2)
    throw new McpFailure("service_unavailable", "PDF readers are busy. Retry shortly.", 503);
  active++;
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL("./drive-pdf-worker.mjs", import.meta.url), {
      workerData: { bytes, firstPage, pageCount, textOffset },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
    });
    const current = worker;
    return await new Promise<z.infer<typeof pdfResult>>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new McpFailure(
              "mcp_pdf_timeout",
              "PDF text extraction timed out. Use byte chunks or a smaller PDF.",
              503
            )
          ),
        15000
      );
      current.once("message", (value: unknown) => {
        clearTimeout(timer);
        const parsed = pdfResult.safeParse(value);
        if (parsed.success) resolve(parsed.data);
        else
          reject(
            new McpFailure(
              "mcp_pdf_unreadable",
              "PDF text is unavailable or the page is out of range. Encrypted/malformed PDFs are unsupported; scanned pages may need OCR.",
              400
            )
          );
      });
      current.once("error", () => {
        clearTimeout(timer);
        reject(
          new McpFailure(
            "mcp_pdf_unreadable",
            "Could not extract PDF text. Try byte chunks or another document.",
            400
          )
        );
      });
      current.once("exit", () => {
        clearTimeout(timer);
        reject(
          new McpFailure("mcp_pdf_unreadable", "PDF reader stopped before returning text.", 400)
        );
      });
    });
  } finally {
    await worker?.terminate();
    active--;
  }
}
