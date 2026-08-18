import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

// Body for editing your own profile.
export class UpdateUserDto {
  @ApiProperty({
    description: 'User eamil address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    description:
      'Required only when changing the email address; re-authenticates the caller',
    example: 'CurrentP@ssw0rd!',
    required: false,
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
