import axiosClient from './axiosClient';

// The upload buckets the API will accept.
export type UploadFolder = 'products' | 'categories' | 'variants';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Thrown when a file is rejected before it ever leaves the browser.
export class FileTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `That image is ${(bytes / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`,
    );
    this.name = 'FileTooLargeError';
  }
}

// Uploads one image and returns the stored URL.
export const uploadImage = async (
  file: File,
  folder: UploadFolder,
): Promise<string> => {
  if (file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError(file.size);

  const body = new FormData();
  body.append('file', file);

  const res = await axiosClient.post<{ url: string }>(
    `/admin/uploads/image?folder=${folder}`,
    body,

    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return res.url;
};
