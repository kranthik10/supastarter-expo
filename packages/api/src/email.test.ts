import { describe, it, expect } from 'vitest';
import { getInvitationEmailProvider, setInvitationEmailProvider } from './email';

describe('invitation email provider seam', () => {
  it('defaults to explicit not-configured delivery without blocking persistence', async () => {
    setInvitationEmailProvider(null);
    const result = await getInvitationEmailProvider().sendInvitation({
      to: 'person@example.com',
      organizationName: 'Acme',
      token: 'token-for-test',
    });
    expect(result).toEqual({ delivered: false, status: 'not_configured' });
  });

  it('reports configured provider delivery separately', async () => {
    setInvitationEmailProvider({
      sendInvitation: async () => ({ delivered: true, status: 'sent' }),
    });
    const result = await getInvitationEmailProvider().sendInvitation({
      to: 'person@example.com',
      organizationName: 'Acme',
      token: 'token-for-test',
    });
    expect(result).toEqual({ delivered: true, status: 'sent' });
    setInvitationEmailProvider(null);
  });
});
