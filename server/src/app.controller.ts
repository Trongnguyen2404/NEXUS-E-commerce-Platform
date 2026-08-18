import { Controller, Get } from '@nestjs/common';
import { AppService } from '@/app.service';

// Root controller, kept only as a liveness ping.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Returns the API greeting string.
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
