export type EmailTemplate = "registration-received" | "registration-approved" | "registration-rejected" | "password-reset" | "admin-2fa-changed" | "welcome";

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
  containsSensitiveLink?: boolean;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

export interface SafeEmailLog {
  event: "development-email";
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
}

export class ConsoleEmailAdapter implements EmailAdapter {
  constructor(private readonly write: (entry: SafeEmailLog) => void = console.info) {}

  async send(message: EmailMessage): Promise<void> {
    this.write({
      event: "development-email",
      to: message.to,
      template: message.template,
      subject: message.subject,
      text: message.containsSensitiveLink ? "[Sensitive link redacted. Open the development mailbox.]" : message.text
    });
  }
}
