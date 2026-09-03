import { describe, expect, it } from 'vitest';
import { appRouter } from './router';

const authedContext = (overrides: Record<string, unknown> = {}) => ({
  db: {} as any,
  user: { id: 'user-1', email: 'user@example.com', emailVerified: true, name: 'User', image: null } as any,
  sessionId: 'session-1',
  headers: {},
  ...overrides,
});

/** Fake DB whose membership lookup resolves to the given rows. */
const dbWithMembers = (members: unknown[]) => ({
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => members,
        orderBy: () => ({ limit: async () => [] }),
      }),
      orderBy: () => ({ limit: async () => [] }),
    }),
  }),
}) as any;

describe('notes API contract', () => {
  it('exposes the protected note lifecycle procedures', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('notes.list');
    expect(procedures).toHaveProperty('notes.get');
    expect(procedures).toHaveProperty('notes.create');
    expect(procedures).toHaveProperty('notes.update');
    expect(procedures).toHaveProperty('notes.delete');
  });

  it('rejects unauthenticated note access', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.notes.list({ organizationId: 'org-1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.notes.get({ organizationId: 'org-1', noteId: 'note-1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.notes.create({ organizationId: 'org-1', title: 'Hello' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.notes.update({ organizationId: 'org-1', noteId: 'note-1', title: 'Hi' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.notes.delete({ organizationId: 'org-1', noteId: 'note-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects note access for non-members without touching note rows', async () => {
    const db = {
      ...dbWithMembers([]),
      insert: () => {
        throw new Error('insert should not happen');
      },
    } as any;
    const caller = appRouter.createCaller(authedContext({ db }));
    await expect(caller.notes.list({ organizationId: 'org-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.notes.create({ organizationId: 'org-1', title: 'Hello' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects empty and overlong titles before any database write', async () => {
    let writes = 0;
    const db = {
      ...dbWithMembers([{ role: 'owner' }]),
      insert: () => {
        writes += 1;
        throw new Error('insert should not happen');
      },
    } as any;
    const caller = appRouter.createCaller(authedContext({ db }));
    await expect(caller.notes.create({ organizationId: 'org-1', title: '  ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.notes.create({ organizationId: 'org-1', title: 'x'.repeat(121) })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.notes.create({ organizationId: 'org-1', title: 'Ok', body: 'x'.repeat(4001) })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.notes.list({ organizationId: 'org-1', cursor: 'not-a-cursor' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(writes).toBe(0);
  });

  it('forbids note deletion for members while allowing owners', async () => {
    const memberCaller = appRouter.createCaller(authedContext({ db: dbWithMembers([{ role: 'member' }]) }));
    await expect(memberCaller.notes.delete({ organizationId: 'org-1', noteId: 'note-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const ownerCaller = appRouter.createCaller(
      authedContext({
        db: {
          ...dbWithMembers([{ role: 'owner' }]),
          delete: () => ({
            where: () => ({ returning: async () => [{ id: 'note-1' }] }),
          }),
        } as any,
      })
    );
    await expect(ownerCaller.notes.delete({ organizationId: 'org-1', noteId: 'note-1' })).resolves.toMatchObject({ ok: true });
  });

  it('creates a note scoped to the organization and current user', async () => {
    const created = {
      id: 'note-1',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Hello',
      body: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = {
      ...dbWithMembers([{ role: 'member' }]),
      insert: () => ({
        values: (values: unknown) => {
          expect(values).toMatchObject({ organizationId: 'org-1', userId: 'user-1', title: 'Hello', body: null });
          return { returning: async () => [created] };
        },
      }),
    } as any;
    const caller = appRouter.createCaller(authedContext({ db }));
    await expect(caller.notes.create({ organizationId: 'org-1', title: '  Hello  ' })).resolves.toMatchObject({
      note: { id: 'note-1', title: 'Hello' },
    });
  });

  it('normalizes an empty body to null on update and scopes the write to the organization', async () => {
    let seenWhere: unknown = null;
    const updated = {
      id: 'note-1',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Hi',
      body: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = {
      ...dbWithMembers([{ role: 'member' }]),
      update: () => ({
        set: (patch: unknown) => {
          expect(patch).toMatchObject({ title: 'Hi', body: null });
          return {
            where: (where: unknown) => {
              seenWhere = where;
              return { returning: async () => [updated] };
            },
          };
        },
      }),
    } as any;
    const caller = appRouter.createCaller(authedContext({ db }));
    await expect(
      caller.notes.update({ organizationId: 'org-1', noteId: 'note-1', title: 'Hi', body: '' })
    ).resolves.toMatchObject({ note: { id: 'note-1', body: null } });
    expect(seenWhere).not.toBeNull();
  });
});
