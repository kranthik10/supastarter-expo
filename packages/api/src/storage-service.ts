import { files, organizations } from '@repo/database';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { StorageProvider } from '@repo/storage/server';

export type StorageUsage = {
  readyBytes: number;
  pendingBytes: number;
};

export async function getOrganizationStorageUsage(db: any, organizationId: string, now: Date, lock = false): Promise<StorageUsage> {
  if (lock) {
    // Lock the organization even when it has no files yet; this serializes the first reservations.
    await db.execute(sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`);
    await db.execute(sql`SELECT id FROM files WHERE organization_id = ${organizationId} AND status <> 'deleted' FOR UPDATE`);
  }
  const [usage] = await db
    .select({
      readyBytes: sql<number>`coalesce(sum(case when ${files.status} = 'ready' then coalesce(${files.size}, 0) else 0 end), 0)`,
      pendingBytes: sql<number>`coalesce(sum(case when ${files.status} = 'pending' and ${files.expiresAt} > ${now} then coalesce(${files.size}, 0) else 0 end), 0)`,
    })
    .from(files)
    .where(eq(files.organizationId, organizationId));
  return { readyBytes: Number(usage?.readyBytes ?? 0), pendingBytes: Number(usage?.pendingBytes ?? 0) };
}

export async function identifyExpiredPendingFiles(db: any, now = new Date()) {
  return db
    .select()
    .from(files)
    .where(and(eq(files.status, 'pending'), lte(files.expiresAt, now)));
}

export async function cleanupExpiredFiles(
  db: any,
  provider: StorageProvider,
  now = new Date()
): Promise<{ deleted: number; failed: number }> {
  const expired = await identifyExpiredPendingFiles(db, now);
  let deleted = 0;
  let failed = 0;
  for (const file of expired) {
    try {
      await provider.deleteObject({ key: file.key });
      const result = await db
        .update(files)
        .set({ status: 'deleted', expiresAt: null, updatedAt: new Date() })
        .where(and(eq(files.id, file.id), eq(files.status, 'pending')))
        .returning({ id: files.id });
      if (result.length > 0) deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}
