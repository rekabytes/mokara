export type RasterImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export function isRasterImageType(type: string): type is RasterImageType {
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type);
}

/** Recognize passive image signatures, never SVG/HTML or caller-supplied MIME.
 * This is type classification, not full decoding, sanitization or malware scanning. */
export function detectImageType(bytes: Uint8Array): RasterImageType | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString())) return "image/gif";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  return null;
}

/** Shared upload policy for task/comment attachments and mDrive. */
export function detectFileType(bytes: Uint8Array): RasterImageType | "application/pdf" | null {
  const image = detectImageType(bytes);
  if (image) return image;
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return b.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : null;
}
