import { ContactResponseDto } from '@/modules/contacts/dto/contact-response.dto';
import { CreateContactDto } from '@/modules/contacts/dto/create-contact.dto';
import { QueryContactsDto } from '@/modules/contacts/dto/query-contacts.dto';
import { UpdateContactDto } from '@/modules/contacts/dto/update-contact.dto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Stores and manages contact form submissions.
@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  // Saves a new contact message.
  async create(
    createContactDto: CreateContactDto,
  ): Promise<ContactResponseDto> {
    try {
      const contact = await this.prisma.contact.create({
        data: createContactDto,
      });

      return {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        message: contact.message,
        status: contact.status,
      };
    } catch {
      throw new InternalServerErrorException('Không thể gửi tin nhắn liên hệ');
    }
  }

  // Lists messages with paging, search and status filtering.
  async findAll(queryDto: QueryContactsDto): Promise<{
    data: ContactResponseDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const { search, page = 1, limit = 10 } = queryDto;

    const where: Prisma.ContactWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.contact.count({ where });

    const contacts = await this.prisma.contact.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        message: contact.message,
        status: contact.status,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  // Loads one message by id.
  async findOne(id: string): Promise<ContactResponseDto> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  // Updates a message's status or admin notes.
  async update(
    id: string,
    updateContactDto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    const existingContact = await this.prisma.contact.findUnique({
      where: { id },
    });

    if (!existingContact) {
      throw new NotFoundException('Contact not found');
    }

    const updatedContact = await this.prisma.contact.update({
      where: { id },
      data: {
        subject: updateContactDto.subject,
        status: updateContactDto.status,
      },
    });

    return {
      id: updatedContact.id,
      name: updatedContact.name,
      email: updatedContact.email,
      subject: updatedContact.subject,
      message: updatedContact.message,
      status: updatedContact.status,
    };
  }

  // Deletes a message.
  async remove(id: string): Promise<{ message: string }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    await this.prisma.contact.delete({ where: { id } });

    return { message: 'Contact deleted successfully' };
  }
}
