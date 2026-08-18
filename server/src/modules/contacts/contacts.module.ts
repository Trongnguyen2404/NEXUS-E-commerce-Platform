import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

// Contact form feature module.
@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
