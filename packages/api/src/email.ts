export type InvitationEmailInput = {
  to: string;
  organizationName: string;
  token: string;
};

export type EmailDeliveryResult =
  | { delivered: true; status: 'sent' }
  | { delivered: false; status: 'not_configured' | 'failed' };

export type InvitationEmailProvider = {
  sendInvitation(input: InvitationEmailInput): Promise<EmailDeliveryResult>;
};

export type PasswordResetEmailInput = {
  to: string;
  url: string;
  token: string;
};

export type PasswordResetEmailProvider = {
  sendPasswordReset(input: PasswordResetEmailInput): Promise<EmailDeliveryResult>;
};

const noOpProvider: InvitationEmailProvider = {
  async sendInvitation(_input) {
    return { delivered: false, status: 'not_configured' };
  },
};

const noOpPasswordResetProvider: PasswordResetEmailProvider = {
  async sendPasswordReset(_input) {
    return { delivered: false, status: 'not_configured' };
  },
};

let provider: InvitationEmailProvider | null = null;
let passwordResetProvider: PasswordResetEmailProvider | null = null;

/** Safe default. A real Resend adapter can be injected server-side later. */
export function getInvitationEmailProvider(): InvitationEmailProvider {
  return provider ?? noOpProvider;
}

/** Server/test seam; mobile never imports this module. */
export function setInvitationEmailProvider(next: InvitationEmailProvider | null): void {
  provider = next;
}

/** Safe default. Better Auth still creates a one-time reset credential; external delivery is explicit. */
export function getPasswordResetEmailProvider(): PasswordResetEmailProvider {
  return passwordResetProvider ?? noOpPasswordResetProvider;
}

/** Server/test seam; reset credentials never cross into analytics or monitoring. */
export function setPasswordResetEmailProvider(next: PasswordResetEmailProvider | null): void {
  passwordResetProvider = next;
}

export function createPasswordResetEmailHandler(providerOverride?: PasswordResetEmailProvider) {
  return async (input: { user: { email: string }; url: string; token: string }): Promise<void> => {
    try {
      const emailProvider = providerOverride ?? getPasswordResetEmailProvider();
      await emailProvider.sendPasswordReset({
        to: input.user.email,
        url: input.url,
        token: input.token,
      });
    } catch {
      // Neutral by design: provider failures must never make reset-request
      // responses account-dependent or leak delivery state to the client.
    }
  };
}
