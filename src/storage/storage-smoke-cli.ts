import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { loadConfig } from '../config/config.js';
import { redactLogText } from '../logging/log-sanitizer.js';
import { createS3ObjectStorage } from './adapters/s3-object-storage.js';
import { StorageService } from './services/storage.service.js';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Proves the public storage path against a real bucket: store, presign,
 * follow the signed URL, stream read, remove, and confirm the object is gone.
 * It prints no credentials and no signed URL.
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

  const storage = new StorageService(createS3ObjectStorage(config.storage));
  const key = `smoke/${randomUUID()}`;
  const payload = Buffer.from(`%PDF-1.4\nShiftPatch storage smoke ${key}\n`);
  const steps: string[] = [];

  try {
    const stored = await storage.store({
      key,
      body: payload,
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="shiftpatch-smoke.pdf"',
    });
    steps.push('put');

    const signed = await storage.createDownloadLink(key, 60);
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

    const object = await storage.read(key);
    const streamedBytes = await readAll(object.body);
    if (!streamedBytes.equals(payload)) {
      throw new Error('Streaming GET body did not match the uploaded bytes');
    }
    steps.push('get');

    await storage.remove(key);
    steps.push('delete');

    let deleteVerified = false;
    try {
      await storage.read(key);
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
