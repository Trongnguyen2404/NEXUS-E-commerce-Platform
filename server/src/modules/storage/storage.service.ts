import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';

export const UPLOAD_FOLDERS = ['products', 'categories', 'variants'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

const MAX_EDGE = 1600;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface StoredImage {
  url: string;
}

// Decodes a percent-encoded credential and strips any pasted angle brackets.
const readCredential = (raw: string): string =>
  decodeURIComponent(raw).replace(/^<|>$/g, '').trim();

// Stores uploaded images on Cloudinary, or on local disk when it is not configured.
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private useCloudinary = false;

  private readonly localDir = resolvePath(process.env.UPLOAD_DIR || 'uploads');

  // Picks the storage backend at boot and logs which one won.
  onModuleInit() {
    const url = process.env.CLOUDINARY_URL;

    if (url && this.configureCloudinary(url)) return;

    this.logger.warn(
      `Uploads are written to ${this.localDir} and served by this process. ` +
        'Fine locally, but on an ephemeral host every deploy wipes them.',
    );
  }

  // Parses CLOUDINARY_URL by hand because the SDK reads it before .env is loaded.
  private configureCloudinary(url: string): boolean {
    try {
      const parsed = new URL(url);

      const apiKey = readCredential(parsed.username);
      const apiSecret = readCredential(parsed.password);
      const cloudName = readCredential(parsed.hostname);

      if (!apiKey || !apiSecret || !cloudName) {
        throw new Error('missing one of api_key, api_secret or cloud_name');
      }

      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });

      this.useCloudinary = true;

      this.logger.log(`Uploads go to Cloudinary (cloud "${cloudName}")`);
      return true;
    } catch {
      this.logger.error(
        'CLOUDINARY_URL is malformed. Expected cloudinary://<api_key>:<api_secret>@<cloud_name>. Falling back to local storage.',
      );
      return false;
    }
  }

  // Validates, crops and resizes an image, then stores it and returns its URL.
  async saveImage(
    buffer: Buffer,
    folder: UploadFolder,
    aspect?: number,
  ): Promise<StoredImage> {
    const image = await this.normalise(buffer, aspect);

    return this.useCloudinary
      ? this.toCloudinary(image, folder)
      : this.toDisk(image, folder);
  }

  // Decodes the image to prove it is really an image, then crops and converts to WebP.
  private async normalise(buffer: Buffer, aspect?: number): Promise<Buffer> {
    let meta: sharp.Metadata;

    try {
      meta = await sharp(buffer).metadata();
    } catch {
      throw new BadRequestException('That file is not an image we can read.');
    }

    const { format } = meta;
    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw new BadRequestException(
        `${format ?? 'That'} is not a supported image format. Use JPEG, PNG, WebP or AVIF.`,
      );
    }

    const pipeline = sharp(buffer).rotate();

    if (!aspect) {
      return await pipeline
        .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    }

    const swapped = (meta.orientation ?? 1) >= 5;
    const sourceWidth = (swapped ? meta.height : meta.width) ?? MAX_EDGE;
    const sourceHeight = (swapped ? meta.width : meta.height) ?? MAX_EDGE;

    const width = Math.round(
      Math.min(MAX_EDGE, sourceWidth, sourceHeight * aspect),
    );

    return await pipeline
      .resize(width, Math.round(width / aspect), {
        fit: 'cover',

        position: sharp.strategy.attention,
      })
      .webp({ quality: 82 })
      .toBuffer();
  }

  // Writes the image to the local uploads directory.
  private async toDisk(
    image: Buffer,
    folder: UploadFolder,
  ): Promise<StoredImage> {
    const dir = join(this.localDir, folder);
    await mkdir(dir, { recursive: true });

    const name = `${randomUUID()}.webp`;
    await writeFile(join(dir, name), image);

    return { url: `${this.publicBase()}/uploads/${folder}/${name}` };
  }

  // Uploads the image to Cloudinary.
  private toCloudinary(
    image: Buffer,
    folder: UploadFolder,
  ): Promise<StoredImage> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder: `nexus/${folder}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary upload failed: ${error?.message}`);
            return reject(
              new BadRequestException(
                'Could not store the image. Please try again.',
              ),
            );
          }

          resolve({ url: result.secure_url });
        },
      );

      upload.end(image);
    });
  }

  // Returns the public base URL used to build local image links.
  private publicBase(): string {
    const base =
      process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 3000}`;

    return base.replace(/\/+$/, '');
  }
}
