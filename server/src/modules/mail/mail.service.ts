import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

// Sends transactional email, falling back to a preview inbox in development.
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  // Typed with the SMTP result so getTestMessageUrl receives a known shape.
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  private isPreviewMode = false;

  // Builds the transporter once at boot, without blocking on it.
  //
  // The transporter is created synchronously enough to serve the first send;
  // what used to hold boot up was the SMTP handshake in verify(). On a host
  // that spins down when idle, that handshake is paid on every single wake —
  // measured at 42s of cold start, of which the app's own boot was ~21s. No
  // request needs mail at boot, so the check now runs in the background and
  // still logs exactly what it did.
  onModuleInit(): void {
    void this.createTransporter();
  }

  // Creates the SMTP transporter from configuration.
  private async createTransporter() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;

    const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');

    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT ?? 587);

      this.transporter = nodemailer.createTransport({
        host,
        port,

        secure: port === 465,
        auth: { user, pass },
      });

      try {
        await this.transporter.verify();
        this.logger.log(`SMTP ready — sending through ${host} as ${user}`);
      } catch (error) {
        this.logger.error(
          `SMTP connection failed (${host}): ${error.message}. Emails will not be delivered.`,
        );
      }
      return;
    }

    await this.createPreviewTransporter();
  }

  // Creates a throwaway Ethereal transporter when SMTP is not configured.
  private async createPreviewTransporter() {
    try {
      const account = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
      this.isPreviewMode = true;

      this.logger.warn(
        'SMTP_* not configured — using an Ethereal test inbox. Emails are NOT delivered; a preview link is logged for each one.',
      );
    } catch (error) {
      this.transporter = null;
      this.logger.error(
        `Could not create a test mail account: ${error.message}`,
      );
    }
  }

  // Sends one message, logging the preview URL when using Ethereal.
  async send(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.error(
        `No mail transport — dropped "${options.subject}" to ${options.to}`,
      );
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'NEXUS <no-reply@nexus.local>',
        ...options,
      });

      if (this.isPreviewMode) {
        this.logger.log(
          `Preview "${options.subject}": ${nodemailer.getTestMessageUrl(info)}`,
        );
      } else {
        this.logger.log(`Sent "${options.subject}" to ${options.to}`);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${options.subject}" to ${options.to}: ${error.message}`,
      );
      return false;
    }
  }
}
