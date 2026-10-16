// Transport allowance for multipart boundaries/headers in addition to ONE file.
// Product file limits remain in plans.ts and are supplied by the workspace owner.
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type UploadDenial = { status: 400 | 413; error: string; message: string };
const tooLarge: UploadDenial = {
  status: 413,
  error: "payload_too_large",
  message: "The upload request exceeds the allowed size.",
};
const invalid: UploadDenial = {
  status: 400,
  error: "invalid_input",
  message: "Choose one non-empty file in a valid upload request.",
};

/** Call only after authentication, workspace authorization and owner lookup.
 * Count real bytes before the multipart parser can buffer them. A length header
 * is only a preflight hint, never an exemption from checking streamed bytes. */
export async function readUploadFile(
  request: Request,
  maxFileBytes: number
): Promise<File | UploadDenial> {
  if (maxFileBytes !== Infinity && (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0))
    throw new Error("Invalid upload limit");
  const maxBodyBytes = maxFileBytes + MULTIPART_OVERHEAD_BYTES;
  // Cleanup is best-effort and must not wait for an untrusted source's cancel
  // promise before returning a rejection. No provider/body detail is logged.
  const cancel = (body: ReadableStream<Uint8Array> | null): void => {
    if (body && !body.locked) void body.cancel().catch(() => {});
  };
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
      cancel(request.body);
      return invalid;
    }
    if (Number(length) > maxBodyBytes) {
      cancel(request.body);
      return tooLarge;
    }
  }
  if (
    request.signal.aborted ||
    !request.body ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "multipart/form-data"
  ) {
    cancel(request.body);
    return invalid;
  }

  let size = 0;
  let exceeded = false;
  const bounded = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > maxBodyBytes) {
          exceeded = true;
          throw new Error("Upload request limit exceeded");
        }
        controller.enqueue(chunk);
      },
    }),
    { signal: request.signal }
  );
  try {
    const form = await new Response(bounded, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    if (request.signal.aborted) return invalid;
    const files = form.getAll("file");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File) || file.size === 0) return invalid;
    for (const [name, value] of form.entries())
      if (name !== "file" && value instanceof File) return invalid;
    if (size - file.size > MULTIPART_OVERHEAD_BYTES) return tooLarge;
    if (file.size > maxFileBytes)
      return {
        status: 400,
        error: "file_too_large",
        message: "That file exceeds this account's per-file limit.",
      };
    return file;
  } catch {
    // Multipart/stream errors can contain request data. Keep the normal public
    // error envelope, and distinguish an actual byte limit from malformed data.
    return exceeded ? tooLarge : invalid;
  } finally {
    cancel(bounded);
  }
}
