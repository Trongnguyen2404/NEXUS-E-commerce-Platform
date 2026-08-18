import { ContactStatus } from '@prisma/client';

// Contact message as returned by the API.
export class ContactResponseDto {
  id: string;

  name: string;

  email: string;

  subject: string;

  message: string;

  status: ContactStatus;
}
