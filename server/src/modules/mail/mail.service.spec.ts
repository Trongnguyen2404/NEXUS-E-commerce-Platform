import * as nodemailer from 'nodemailer';
import { MailService } from '@/modules/mail/mail.service';

jest.mock('nodemailer');

const mockedNodemailer = jest.mocked(nodemailer);

describe('MailService', () => {
  let service: MailService;
  let verify: jest.Mock;
  let sendMail: jest.Mock;

  const ENV = { ...process.env };

  beforeEach(() => {
    verify = jest.fn().mockResolvedValue(true);
    sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });

    mockedNodemailer.createTransport.mockReturnValue({
      verify,
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'shop@example.com';
    process.env.SMTP_PASS = 'app password';

    service = new MailService();
  });

  afterEach(() => {
    process.env = { ...ENV };
    jest.clearAllMocks();
  });

  describe('boot', () => {
    // The reason this change exists: on a host that spins down when idle, an
    // awaited SMTP handshake is paid on every wake, and nothing served at boot
    // needs mail.
    it('does not make Nest wait on the SMTP handshake', () => {
      const returned: unknown = service.onModuleInit();

      expect(returned).toBeUndefined();
      expect(returned).not.toBeInstanceOf(Promise);
    });

    it('still builds the transporter from the configured credentials', () => {
      service.onModuleInit();

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          auth: { user: 'shop@example.com', pass: 'apppassword' },
        }),
      );
    });

    it('strips the spaces Google puts in an app password', () => {
      service.onModuleInit();

      const [config] = mockedNodemailer.createTransport.mock.calls[0] as [
        { auth: { pass: string } },
      ];
      expect(config.auth.pass).toBe('apppassword');
    });

    it('still verifies the connection, just not on the critical path', async () => {
      service.onModuleInit();
      await Promise.resolve();

      expect(verify).toHaveBeenCalled();
    });

    it('survives an SMTP server that refuses the handshake', async () => {
      verify.mockRejectedValue(new Error('connection refused'));

      expect(() => service.onModuleInit()).not.toThrow();
      await Promise.resolve();
    });

    it('uses an implicit TLS connection only on port 465', () => {
      process.env.SMTP_PORT = '465';
      new MailService().onModuleInit();

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });
  });

  describe('send', () => {
    it('reports failure instead of throwing when no transport was built', async () => {
      delete process.env.SMTP_HOST;
      const offline = new MailService();

      await expect(
        offline.send({
          to: 'buyer@example.com',
          subject: 'Hi',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).resolves.toBe(false);
    });

    it('falls back to a default From address when none is configured', async () => {
      delete process.env.MAIL_FROM;
      service.onModuleInit();
      await Promise.resolve();

      await service.send({
        to: 'buyer@example.com',
        subject: 'Order confirmed',
        html: '<p>Thanks</p>',
        text: 'Thanks',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('@') as string,
          to: 'buyer@example.com',
          subject: 'Order confirmed',
        }),
      );
    });
  });
});
