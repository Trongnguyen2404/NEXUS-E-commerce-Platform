import { ContactStatus } from "@prisma/client";

export class ContactResponseDto {
    id: string;

    name: string;

    email: string;

    subject: string;

    message: string;

    status: ContactStatus;
}