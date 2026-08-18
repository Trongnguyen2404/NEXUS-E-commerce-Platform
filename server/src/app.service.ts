import { Injectable } from '@nestjs/common';

// Trivial service backing the root ping route.
@Injectable()
export class AppService {
  // Returns the API greeting string.
  getHello(): string {
    return 'Hello World!';
  }
}
