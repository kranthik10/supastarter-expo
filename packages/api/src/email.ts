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

const noOpProvider: InvitationEmailProvider = {
  async sendInvitation(_input) {
    return { delivered: false, status: 'not_configured' };
  },
};

let provider: InvitationEmailProvider | null = null;

/** Safe default. A real Resend adapter can be injected server-side later. */
export function getInvitationEmailProvider(): InvitationEmailProvider {
  return provider ?? noOpProvider;
}

/** Server/test seam; mobile never imports this module. */
export function setInvitationEmailProvider(next: InvitationEmailProvider | null): void {
  provider = next;
}
