import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// Body accepted when saving a new shipping address.
export class CreateAddressDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^[+\d][\d\s().-]{5,19}$/, {
    message: 'Please provide a valid phone number',
  })
  phone: string;

  @ApiProperty({ example: '123 Le Loi' })
  @IsString()
  @IsNotEmpty({ message: 'Street address is required' })
  @MaxLength(200)
  line1: string;

  @ApiPropertyOptional({ example: 'Apartment 4B' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: 'Ho Chi Minh City' })
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional({ example: 'District 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty({ example: '700000' })
  @IsString()
  @IsNotEmpty({ message: 'Postal code is required' })
  @MaxLength(20)
  postalCode: string;

  @ApiPropertyOptional({ example: 'VN', default: 'VN' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @ApiPropertyOptional({
    description: 'Make this the default shipping address',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

// Body accepted when editing an address; every field optional.
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

// Address as returned by the API.
export class AddressResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() phone: string;
  @ApiProperty() line1: string;
  @ApiPropertyOptional({ nullable: true }) line2: string | null;
  @ApiProperty() city: string;
  @ApiPropertyOptional({ nullable: true }) state: string | null;
  @ApiProperty() postalCode: string;
  @ApiProperty() country: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ description: 'Single-line rendering, as stored on an order' })
  formatted: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
