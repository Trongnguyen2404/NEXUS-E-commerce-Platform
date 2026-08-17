import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  UPLOAD_FOLDERS,
  type UploadFolder,
} from '@/modules/storage/storage.service';

export class UploadImageQueryDto {
  @ApiPropertyOptional({
    enum: UPLOAD_FOLDERS,
    default: 'products',
    description: 'Which folder to file the image under.',
  })
  @IsOptional()
  @IsIn(UPLOAD_FOLDERS)
  folder?: UploadFolder;
}

export class UploadResponseDto {
  @ApiProperty({
    description: 'Absolute URL of the stored image. Save this on the product.',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/nexus/products/6f1c.webp',
  })
  url: string;
}
