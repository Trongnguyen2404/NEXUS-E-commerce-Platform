import { Module } from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { UsersController } from '@/modules/users/users.controller';

// User account feature module.
@Module({
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
