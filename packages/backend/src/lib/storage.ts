import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, storageConfigured } from "../env.ts";
import { log } from "./logger.ts";

// PRD-11 Phase 1.3 — the ONLY place that talks to object storage.
//
// Both directions are PROXIED (browser → backend → bucket, and back), which is
// the fallback the PRD reserved for this step. It was not a shortcut, it was
// forced by two facts about this codebase:
//
//  1. The CSP is enforced `default-src 'self'` (PRD-07 hardening), so a
//     browser-to-bucket PUT would need `connect-src` opened to the bucket
//     origin — and that origin is a RUNTIME value, per deployment, for
//     self-hosters too.
//  2. Presigned uploads need a CORS rule on the bucket that every operator
//     would have to remember, plus a lifecycle rule to clear objects that were
//     uploaded but never confirmed.
//
// What that costs: request bodies live in memory briefly, bounded by the
// per-file caps in lib/plans.ts (25 MB → 1 GB), and downloads spend our
// bandwidth instead of the bucket's. Both are acceptable at this scale and
// reversible — the presigned upgrade needs CSP + CORS solved, nothing else.
//
// Keys are server-minted (`teams/<team>/tasks/<task>/<attachment-id>`) and the
// original filename never lives in one, so a filename can neither collide with
// nor reach outside its own prefix. It travels back on Content-Disposition.

let client: S3Client | null = null;

function s3(): S3Client {
  client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

/** Whether uploads can be accepted at all (see env.ts for the four parts). */
export function storageReady(): boolean {
  return storageConfigured;
}

/**
 * Where an attachment's bytes live, deterministic from its own row id. Scope
 * is which surface owns the file — a task or a comment — and keeps the two key
 * spaces from ever colliding.
 */
export function storageKey(input: {
  teamId: string;
  scope: "tasks" | "comments";
  scopeId: string;
  attachmentId: string;
}): string {
  return `teams/${input.teamId}/${input.scope}/${input.scopeId}/${input.attachmentId}`;
}

/** One object per workspace, overwritten in place (PRD-11 Phase 1.4). */
export function teamLogoKey(teamId: string): string {
  return `teams/${teamId}/logo`;
}

export async function putObject(input: {
  key: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  );
}

/** Reads the whole object back. Bounded by the per-file cap of the plan. */
export async function getObjectBytes(
  key: string
): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string }> {
  const res = await s3().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!res.Body) throw new Error("object has no body");
  // Re-wrapped because the SDK types its byte array over ArrayBufferLike
  // (which admits SharedArrayBuffer) while Hono's body type asks for a plain
  // ArrayBuffer view. Copying is also where we stop holding the SDK's stream.
  const bytes = new Uint8Array(await res.Body.transformToByteArray());
  return { body: bytes, contentType: res.ContentType ?? "application/octet-stream" };
}

/**
 * Best-effort removal: the row is already gone, and a leftover object is a
 * billing leak, not a correctness bug — so a failure logs and moves on rather
 * than failing the user's delete.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (e) {
    log.error(`could not delete stored object ${key}`, e);
  }
}
