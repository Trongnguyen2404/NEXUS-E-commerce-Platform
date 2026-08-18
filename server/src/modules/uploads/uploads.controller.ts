import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { ModerateThrottle } from '@/common/decorators/custom-throttler.decorator';
import {
  MAX_UPLOAD_BYTES,
  StorageService,
} from '@/modules/storage/storage.service';
import {
  UploadImageQueryDto,
  UploadResponseDto,
} from '@/modules/uploads/dto/upload.dto';

// Admin-only image upload endpoint.
@ApiTags('uploads')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  // Accepts one image file and returns the stored URL.
  @Post('image')
  @ModerateThrottle()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException('Only image files can be uploaded.'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: '[ADMIN] Upload an image',
    description:
      'Accepts JPEG, PNG, WebP or AVIF up to 5MB. The image is resized to fit ' +
      '1600px, re-encoded as WebP and stripped of EXIF, then stored. Returns ' +
      'the URL to save on the product, category or variant.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: UploadResponseDto })
  @ApiBadRequestResponse({
    description: 'Not an image, or an unsupported format',
  })
  @ApiPayloadTooLargeResponse({ description: 'Larger than 5MB' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: UploadImageQueryDto,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException(
        'No file received. Send it as the "file" field.',
      );
    }

    return await this.storage.saveImage(
      file.buffer,
      query.folder ?? 'products',
    );
  }
}
