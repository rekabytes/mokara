import { parentPort, workerData } from "node:worker_threads";
import { PDFParse } from "pdf-parse";

// Only in-memory bytes enter the parser; it cannot fetch an agent-supplied URL.
const parser = new PDFParse({
  data: new Uint8Array(workerData.bytes),
  isEvalSupported: false,
  useSystemFonts: false,
  disableFontFace: true,
  verbosity: 0,
});
try {
  const info = await parser.getInfo();
  const { firstPage, pageCount, textOffset } = workerData;
  if (firstPage > info.total) parentPort?.postMessage({ error: "page_out_of_range" });
  else {
    const lastPage = Math.min(info.total, firstPage + pageCount - 1);
    const partial = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage + i);
    const result = await parser.getText({ partial });
    const budget = Math.floor(16000 / partial.length);
    const pages = result.pages.map((page) => ({
      page_number: page.num,
      text: page.text.slice(textOffset, textOffset + budget),
      next_text_offset: page.text.length > textOffset + budget ? textOffset + budget : null,
      no_extractable_text: !page.text.trim(),
    }));
    parentPort?.postMessage({
      total_pages: info.total,
      pages,
      next_page: lastPage < info.total ? lastPage + 1 : null,
    });
  }
} catch {
  parentPort?.postMessage({ error: "pdf_unreadable" });
} finally {
  await parser.destroy();
}
