import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';

/**
 * Folders an upload may be filed under.
 *
 * A fixed list rather than free text: the local driver turns this straight into
 * a path, so "../../" in a query string would otherwise let an admin write
 * outside the upload directory.
 */
export const UPLOAD_FOLDERS = ['products', 'categories', 'variants'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** Formats we are willing to decode. Anything else is refused. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

/** Longest edge in pixels — a product photo has no use for more. */
const MAX_EDGE = 1600;

/** Rejected by multer before a byte reaches sharp. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface StoredImage {
  /** Absolute URL, ready to drop into an <img src>. */
  url: string;
}

/**
 * Reads one field out of a parsed CLOUDINARY_URL.
 *
 * Two things have to be undone. `URL` hands back the userinfo percent-encoded,
 * so a secret containing anything outside the unreserved set arrives mangled
 * and authentication fails for no visible reason. And Cloudinary's own
 * documentation writes the template as
 *   cloudinary://<api_key>:<api_secret>@<cloud_name>
 * so the angle brackets get pasted along with the values often enough to be
 * worth handling — they are punctuation in the docs, not part of the
 * credential. Same reasoning as MailService stripping the spaces Gmail shows
 * inside an app password.
 */
const readCredential = (raw: string): string =>
  decodeURIComponent(raw).replace(/^<|>$/g, '').trim();

/**
 * Stores uploaded images.
 *
 * Same shape as MailService: fill in CLOUDINARY_URL and images go to
 * Cloudinary; leave it blank and they are written to a local directory, so a
 * fresh clone works offline with no signup. Callers cannot tell the difference.
 *
 * The local driver is for development only. Every host worth deploying to has
 * an ephemeral filesystem — Render, Vercel and Fly (without a volume) all
 * discard it on redeploy — so anything written there is lost on the next push.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private useCloudinary = false;
  private readonly localDir = resolvePath(process.env.UPLOAD_DIR ?? 'uploads');

  onModuleInit() {
    const url = process.env.CLOUDINARY_URL;

    if (url && this.configureCloudinary(url)) return;

    this.logger.warn(
      `Uploads are written to ${this.localDir} and served by this process. ` +
        'Fine locally, but on an ephemeral host every deploy wipes them.',
    );
  }

  /**
   * Hands the SDK its credentials, parsed here rather than by the SDK itself.
   *
   * Cloudinary does read CLOUDINARY_URL from the environment — but only once,
   * as the package is imported. Nest's ConfigModule loads .env during module
   * initialisation, which is after every import has already run, so by the time
   * the variable exists the SDK has long since given up on it and cloud_name
   * stays undefined. Every upload then fails with "Must supply cloud_name".
   *
   * @returns whether Cloudinary is usable; false falls back to local storage.
   */
  private configureCloudinary(url: string): boolean {
    try {
      // cloudinary://<api_key>:<api_secret>@<cloud_name>
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
      // The cloud name is safe to print; the rest of that URL is a credential.
      this.logger.log(`Uploads go to Cloudinary (cloud "${cloudName}")`);
      return true;
    } catch {
      // Complain loudly, then carry on with local storage — an image uploader
      // is not worth refusing to boot over.
      this.logger.error(
        'CLOUDINARY_URL is malformed. Expected cloudinary://<api_key>:<api_secret>@<cloud_name>. Falling back to local storage.',
      );
      return false;
    }
  }

  async saveImage(buffer: Buffer, folder: UploadFolder): Promise<StoredImage> {
    const image = await this.normalise(buffer);

    return this.useCloudinary
      ? this.toCloudinary(image, folder)
      : this.toDisk(image, folder);
  }

  /**
   * Decodes, shrinks and re-encodes the upload.
   *
   * This doubles as the content check, and it is the only one worth trusting:
   * the browser's Content-Type header and the file extension are both chosen by
   * whoever is uploading, so neither is evidence of anything. Renaming
   * `shell.php` to `shell.png` is the classic bypass. sharp actually decodes the
   * bytes, so that file fails here instead of landing somewhere we serve.
   *
   * Re-encoding also drops EXIF — which on a photo taken with a phone carries
   * the GPS coordinates of wherever it was taken.
   */
  private async normalise(buffer: Buffer): Promise<Buffer> {
    let format: string | undefined;

    try {
      // Reads the header only, so this is cheap despite the second decode below.
      ({ format } = await sharp(buffer).metadata());
    } catch {
      throw new BadRequestException('That file is not an image we can read.');
    }

    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw new BadRequestException(
        `${format ?? 'That'} is not a supported image format. Use JPEG, PNG, WebP or AVIF.`,
      );
    }

    return sharp(buffer)
      // Applies the EXIF orientation flag before the metadata is discarded,
      // otherwise portrait phone photos come out on their side.
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  }

  private async toDisk(image: Buffer, folder: UploadFolder): Promise<StoredImage> {
    const dir = join(this.localDir, folder);
    await mkdir(dir, { recursive: true });

    // The uploader's own filename is never reused. It is the usual path
    // traversal vector, and it leaks whatever the file happened to be called on
    // their desktop.
    const name = `${randomUUID()}.webp`;
    await writeFile(join(dir, name), image);

    return { url: `${this.publicBase()}/uploads/${folder}/${name}` };
  }

  private toCloudinary(image: Buffer, folder: UploadFolder): Promise<StoredImage> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder: `nexus/${folder}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            // Quota, revoked key, network. Log the real reason, tell the admin
            // something they can act on.
            this.logger.error(`Cloudinary upload failed: ${error?.message}`);
            return reject(
              new BadRequestException('Could not store the image. Please try again.'),
            );
          }

          resolve({ url: result.secure_url });
        },
      );

      upload.end(image);
    });
  }

  /**
   * Where a browser can reach this API.
   *
   * Has to be absolute. The frontend is served from a different origin (5173
   * against the API's 3000 in development, two different hosts in production),
   * so a relative "/uploads/x.webp" would resolve against the frontend and 404.
   */
  private publicBase(): string {
    const base =
      process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

    return base.replace(/\/+$/, '');
  }
}
