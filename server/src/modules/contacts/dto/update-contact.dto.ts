import { ContactStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body for updating a contact message's status or notes.
export class UpdateContactDto {
  @ApiProperty({ example: 'Updated subject', required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ enum: ContactStatus, required: false })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;
}
