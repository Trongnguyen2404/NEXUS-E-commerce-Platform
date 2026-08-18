import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body accepted from the public contact form.
export class CreateContactDto {
  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Question for product' })
  @IsNotEmpty()
  @IsString()
  subject: string;

  @ApiProperty({ example: 'I would like to ask about the warranty policy...' })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  message: string;
}
