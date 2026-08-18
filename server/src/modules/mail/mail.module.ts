import { Global, Module } from '@nestjs/common';
import { MailService } from '@/modules/mail/mail.service';

// Makes the mail service available everywhere.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
