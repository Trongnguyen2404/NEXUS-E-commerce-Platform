import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Sends transactional email.
 *
 * Provider-agnostic on purpose: fill in the four SMTP_* variables for Gmail,
 * Resend, Brevo, whatever. Leave them blank and it falls back to an Ethereal
 * test inbox — so a fresh clone can exercise the password-reset flow with no
 * signup, and each message is logged with a preview URL instead of delivered.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  /** True when mail goes to a throwaway inbox rather than a real recipient. */
  private isPreviewMode = false;

  async onModuleInit() {
    await this.createTransporter();
  }

  private async createTransporter() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    // Gmail shows app passwords as "xxxx xxxx xxxx xxxx"; the spaces are for
    // reading only and must not be sent.
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');

    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT ?? 587);

      this.transporter = nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS; 587 upgrades via STARTTLS.
        secure: port === 465,
        auth: { user, pass },
      });

      try {
        await this.transporter.verify();
        this.logger.log(`SMTP ready — sending through ${host} as ${user}`);
      } catch (error) {
        // Wrong app password, blocked port, 2FA not enabled... Say so loudly at
        // boot rather than failing silently on the first password reset.
        this.logger.error(
          `SMTP connection failed (${host}): ${error.message}. Emails will not be delivered.`,
        );
      }
      return;
    }

    await this.createPreviewTransporter();
  }

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
      // No network, or Ethereal is down. The app must still boot.
      this.transporter = null;
      this.logger.error(
        `Could not create a test mail account: ${error.message}`,
      );
    }
  }

  /**
   * Never throws: a failed email must not roll back the action that triggered
   * it. A user whose order succeeded should not see an error because our SMTP
   * host was down.
   */
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
