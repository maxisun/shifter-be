import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { loadConfig } from '../config/config.js';
import { redactLogText } from '../logging/log-sanitizer.js';
import type { ObjectStorage } from './object-storage.js';
import { createObjectStorage } from './s3-object-storage.js';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Proves the adapter against a real bucket: put, presign, follow the
 * presigned URL over HTTPS, stream get, delete, and confirm the object is
 * gone. It prints no credentials and no signed URL.
 *
 * Run against R2 with:
 *   pnpm run storage:smoke:r2
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.storage) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          'Object storage is not configured; set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      }),
    );
    process.exitCode = 2;
    return;
  }

  const storage: ObjectStorage = createObjectStorage(config.storage);
  const key = `smoke/${randomUUID()}`;
  const payload = Buffer.from(`%PDF-1.4\nShiftPatch storage smoke ${key}\n`);
  const steps: string[] = [];

  try {
    const stored = await storage.put({
      key,
      body: payload,
      contentLength: payload.byteLength,
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="shiftpatch-smoke.pdf"',
    });
    steps.push('put');

    const signed = await storage.presignGet(key, 60);
    steps.push('presign-get');
    const presignedResponse = await fetch(signed.url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!presignedResponse.ok) {
      throw new Error(
        `Presigned GET returned HTTP ${presignedResponse.status}`,
      );
    }
    const presignedBytes = Buffer.from(await presignedResponse.arrayBuffer());
    if (!presignedBytes.equals(payload)) {
      throw new Error('Presigned GET body did not match the uploaded bytes');
    }
    steps.push('presigned-fetch');

    const object = await storage.get(key);
    const streamedBytes = await readAll(object.body);
    if (!streamedBytes.equals(payload)) {
      throw new Error('Streaming GET body did not match the uploaded bytes');
    }
    steps.push('get');

    await storage.delete(key);
    steps.push('delete');

    let deleteVerified = false;
    try {
      await storage.get(key);
    } catch {
      deleteVerified = true;
    }
    if (!deleteVerified) {
      throw new Error('Object was still readable after delete');
    }
    steps.push('delete-verified');

    console.log(
      JSON.stringify({
        ok: true,
        bucket: config.storage.bucket,
        key,
        steps,
        bytes: payload.byteLength,
        presignedStatus: presignedResponse.status,
        etag: stored.etag,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        step: steps.at(-1) ?? 'put',
        error: redactLogText(
          error instanceof Error ? error.message : String(error),
        ),
      }),
    );
    process.exitCode = 1;
  }
}

await main();
