import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ContactsService } from '@/modules/contacts/contacts.service';
import { ContactResponseDto } from '@/modules/contacts/dto/contact-response.dto';
import { CreateContactDto } from '@/modules/contacts/dto/create-contact.dto';
import { QueryContactsDto } from '@/modules/contacts/dto/query-contacts.dto';
import { UpdateContactDto } from '@/modules/contacts/dto/update-contact.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

// Contact form submission plus admin-only inbox management.
@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // Records a message from the public contact form.
  @Post()
  async create(
    @Body() createContactDto: CreateContactDto,
  ): Promise<ContactResponseDto> {
    return await this.contactsService.create(createContactDto);
  }

  // Lists submitted messages; admin only.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll(@Query() queryDto: QueryContactsDto) {
    return await this.contactsService.findAll(queryDto);
  }

  // Returns one message; admin only.
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findOne(@Param('id') id: string): Promise<ContactResponseDto> {
    return await this.contactsService.findOne(id);
  }

  // Updates a message's status or notes; admin only.
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return await this.contactsService.update(id, updateContactDto);
  }

  // Deletes a message; admin only.
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return await this.contactsService.remove(id);
  }
}
