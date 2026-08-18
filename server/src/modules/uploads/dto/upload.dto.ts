import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  UPLOAD_FOLDERS,
  type UploadFolder,
} from '@/modules/storage/storage.service';

// Query string accepted by the image upload endpoint.
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

// Upload result returned to the admin UI.
export class UploadResponseDto {
  @ApiProperty({
    description: 'Absolute URL of the stored image. Save this on the product.',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/nexus/products/6f1c.webp',
  })
  url: string;
}
