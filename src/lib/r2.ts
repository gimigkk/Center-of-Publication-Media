import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_PUT_TTL_SECONDS = 10 * 60;
const DEFAULT_GET_TTL_SECONDS = 5 * 60;

let client: S3Client | null = null;

function getR2Config() {
  const configuredEndpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!configuredEndpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Konfigurasi Cloudflare R2 belum lengkap');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(configuredEndpoint);
  } catch {
    throw new Error('R2_ENDPOINT tidak valid');
  }

  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') {
    throw new Error('R2_ENDPOINT harus menggunakan HTTPS');
  }

  const endpointPath = endpoint.pathname.replace(/^\/+|\/+$/g, '');
  if (endpointPath && endpointPath !== bucket) {
    throw new Error('Path R2_ENDPOINT harus sesuai dengan R2_BUCKET');
  }

  return {
    endpoint: endpoint.origin,
    bucket,
    accessKeyId,
    secretAccessKey,
    putTtlSeconds: getTtl('R2_PRESIGN_PUT_TTL_SECONDS', DEFAULT_PUT_TTL_SECONDS),
    getTtlSeconds: getTtl('R2_PRESIGN_GET_TTL_SECONDS', DEFAULT_GET_TTL_SECONDS),
  };
}

function getTtl(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getClient(endpoint: string, accessKeyId: string, secretAccessKey: string) {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return client;
}

export function createDeliverableKey(jobId: string, uploadId: string): string {
  return `jobs/${jobId}/deliverables/${uploadId}.jpg`;
}

export function isDeliverableKeyForJob(key: string, jobId: string): boolean {
  return new RegExp(`^jobs/${escapeRegExp(jobId)}/deliverables/[0-9a-f-]{36}\\.jpe?g$`, 'i').test(key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createDeliverableUploadUrl(key: string): Promise<string> {
  const config = getR2Config();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: 'image/jpeg',
  });

  return getSignedUrl(getClient(config.endpoint, config.accessKeyId, config.secretAccessKey), command, {
    expiresIn: config.putTtlSeconds,
  });
}

export async function inspectDeliverable(key: string) {
  const config = getR2Config();
  const r2 = getClient(config.endpoint, config.accessKeyId, config.secretAccessKey);
  const head = await r2.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  const firstBytes = await r2.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Range: 'bytes=0-2',
    })
  );
  const bytes = firstBytes.Body ? await firstBytes.Body.transformToByteArray() : new Uint8Array();

  return {
    sizeBytes: head.ContentLength || 0,
    contentType: head.ContentType || '',
    isJpeg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  };
}

export async function createDeliverableDownloadUrl(key: string, filename: string): Promise<string> {
  const config = getR2Config();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'deliverable.jpg';
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentType: 'image/jpeg',
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });

  return getSignedUrl(getClient(config.endpoint, config.accessKeyId, config.secretAccessKey), command, {
    expiresIn: config.getTtlSeconds,
  });
}

export async function createDeliverablePreviewUrl(key: string): Promise<string> {
  const config = getR2Config();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentType: 'image/jpeg',
    ResponseContentDisposition: 'inline',
  });

  return getSignedUrl(getClient(config.endpoint, config.accessKeyId, config.secretAccessKey), command, {
    expiresIn: config.getTtlSeconds,
  });
}

export async function deleteDeliverableObject(key: string): Promise<void> {
  const config = getR2Config();
  await getClient(config.endpoint, config.accessKeyId, config.secretAccessKey).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
  );
}
