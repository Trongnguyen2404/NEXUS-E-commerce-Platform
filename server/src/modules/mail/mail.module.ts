import { Global, Module } from '@nestjs/common';
import { MailService } from '@/modules/mail/mail.service';

/**
 * Global so auth, orders and payments can all inject MailService without each
 * importing MailModule — there is only ever one transporter.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
