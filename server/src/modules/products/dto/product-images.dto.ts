import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

const MAX_IMAGES = 10;

// Body for replacing a product's whole image list.
export class SetProductImagesDto {
  @ApiProperty({
    description:
      'Every image URL in display order. The first becomes the cover. ' +
      'Send an empty array to clear the gallery.',
    type: [String],
    maxItems: MAX_IMAGES,
    example: [
      'https://res.cloudinary.com/demo/image/upload/v1/nexus/products/front.webp',
      'https://res.cloudinary.com/demo/image/upload/v1/nexus/products/back.webp',
    ],
  })
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES, {
    message: `A product can have at most ${MAX_IMAGES} images`,
  })
  @IsString({ each: true })
  @MaxLength(2048, { each: true, message: 'Image URL is too long' })
  urls: string[];
}
