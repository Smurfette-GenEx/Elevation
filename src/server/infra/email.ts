import { config } from "../config";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmail implements EmailProvider {
  async send(msg: EmailMessage) {
    if (process.env.NODE_ENV !== "test") console.info(`[email] to=${msg.to} subject="${msg.subject}"`);
  }
}

class SmtpEmail implements EmailProvider {
  private transport = import("nodemailer").then((m) => m.default.createTransport(config().SMTP_URL));
  async send(msg: EmailMessage) {
    await (await this.transport).sendMail({ from: config().EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
  }
}

let instance: EmailProvider | null = null;
export function email(): EmailProvider {
  if (instance) return instance;
  const c = config();
  instance = c.EMAIL_DRIVER === "smtp" && c.SMTP_URL ? new SmtpEmail() : new ConsoleEmail();
  return instance;
}
