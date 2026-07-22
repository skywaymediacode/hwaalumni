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

export interface SmtpEmailConfiguration {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string;
  password?: string;
}

export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transport;

  constructor(private readonly configuration: SmtpEmailConfiguration) {
    this.transport = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      ...(configuration.user && configuration.password ? { auth: { user: configuration.user, pass: configuration.password } } : {})
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.configuration.from, to: message.to, subject: message.subject, text: message.text });
  }
}
import nodemailer from "nodemailer";
