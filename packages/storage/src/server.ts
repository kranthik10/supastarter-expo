import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageProvider = {
  configured: boolean;
  createPresignedUpload(input: { key: string; contentType: string; expiresInSeconds: number }): Promise<{
    uploadUrl: string;
    expiresAt: Date;
    headers: Record<string, string>;
  }>;
  headObject(input: { key: string }): Promise<{ exists: boolean; size: number | null; contentType: string | null }>;
  deleteObject(input: { key: string }): Promise<void>;
  createPresignedDownload(input: { key: string; expiresInSeconds: number }): Promise<{ downloadUrl: string; expiresAt: Date }>;
};

export type StorageConfiguration = {
  provider: 'r2' | 's3';
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
};

type Environment = Record<string, string | undefined>;

function readEnvironment(): Environment {
  return (globalThis as unknown as { process?: { env: Environment } }).process?.env ?? {};
}

export function createStorageConfiguration(env: Environment = readEnvironment()): StorageConfiguration | null {
  const r2Endpoint = env.R2_ENDPOINT ?? (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  if (r2Endpoint && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return {
      provider: 'r2',
      endpoint: r2Endpoint,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    };
  }

  if (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return {
      provider: 's3',
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    };
  }

  return null;
}

export class StorageProviderError extends Error {
  constructor(public readonly code: 'STORAGE_NOT_CONFIGURED' | 'STORAGE_HEAD_FAILED' | 'STORAGE_DELETE_FAILED' | 'STORAGE_PRESIGN_FAILED') {
    super(code);
    this.name = 'StorageProviderError';
  }
}

export class NotConfiguredStorageProvider implements StorageProvider {
  configured = false as const;

  async createPresignedUpload(_input: { key: string; contentType: string; expiresInSeconds: number }): Promise<never> {
    throw new StorageProviderError('STORAGE_NOT_CONFIGURED');
  }

  async headObject(_input: { key: string }): Promise<never> {
    throw new StorageProviderError('STORAGE_NOT_CONFIGURED');
  }

  async deleteObject(_input: { key: string }): Promise<never> {
    throw new StorageProviderError('STORAGE_NOT_CONFIGURED');
  }

  async createPresignedDownload(_input: { key: string; expiresInSeconds: number }): Promise<never> {
    throw new StorageProviderError('STORAGE_NOT_CONFIGURED');
  }
}

export class S3CompatibleStorageProvider implements StorageProvider {
  configured = true as const;
  private readonly client: S3Client;

  constructor(private readonly configuration: StorageConfiguration) {
    this.client = new S3Client({
      region: configuration.provider === 'r2' ? 'auto' : 'us-east-1',
      endpoint: configuration.endpoint,
      forcePathStyle: configuration.provider === 's3',
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(input: { key: string; contentType: string; expiresInSeconds: number }) {
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1_000);
    try {
      const uploadUrl = await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket: this.configuration.bucket, Key: input.key, ContentType: input.contentType }),
        { expiresIn: input.expiresInSeconds }
      );
      return { uploadUrl, expiresAt, headers: { 'Content-Type': input.contentType } };
    } catch {
      throw new StorageProviderError('STORAGE_PRESIGN_FAILED');
    }
  }

  async headObject(input: { key: string }) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.configuration.bucket, Key: input.key }));
      return { exists: true, size: result.ContentLength ?? null, contentType: result.ContentType ?? null };
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (statusCode === 404 || name === 'NotFound' || name === 'NoSuchKey') {
        return { exists: false, size: null, contentType: null };
      }
      throw new StorageProviderError('STORAGE_HEAD_FAILED');
    }
  }

  async deleteObject(input: { key: string }) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.configuration.bucket, Key: input.key }));
    } catch {
      throw new StorageProviderError('STORAGE_DELETE_FAILED');
    }
  }

  async createPresignedDownload(input: { key: string; expiresInSeconds: number }) {
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1_000);
    try {
      const downloadUrl = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.configuration.bucket, Key: input.key }),
        { expiresIn: input.expiresInSeconds }
      );
      return { downloadUrl, expiresAt };
    } catch {
      throw new StorageProviderError('STORAGE_PRESIGN_FAILED');
    }
  }
}

let testProvider: StorageProvider | undefined;

export function setStorageProviderForTests(provider: StorageProvider): void {
  testProvider = provider;
}

export function resetStorageProviderForTests(): void {
  testProvider = undefined;
}

export function getStorageProvider(env: Environment = readEnvironment()): StorageProvider {
  if (testProvider) return testProvider;
  const configuration = createStorageConfiguration(env);
  return configuration ? new S3CompatibleStorageProvider(configuration) : new NotConfiguredStorageProvider();
}
