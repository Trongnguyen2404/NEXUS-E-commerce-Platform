import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { PRODUCT_PLACEHOLDER } from './productPlaceholder';

/** Must match UPLOAD_FOLDERS on the server. */
type UploadFolder = 'products' | 'categories' | 'variants';

/** Same ceiling the API enforces — checked here only to fail fast. */
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  /** Current image URL, or '' for none. */
  value: string;
  onChange: (url: string) => void;
  folder: UploadFolder;
  label?: string;
}

/**
 * Drop-in replacement for the "Image URL" text box.
 *
 * The URL field is kept as a secondary option rather than removed: products
 * seeded with external images already hold links, and an admin occasionally
 * wants to point at one rather than re-host it.
 */
const ImageUpload = ({ value, onChange, folder, label = 'Image' }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const upload = async (file: File) => {
    // The server rejects this too, but a local check gives a useful message
    // instantly instead of after pushing megabytes over the wire.
    if (file.size > MAX_BYTES) {
      toast.error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`,
      );
      return;
    }

    const body = new FormData();
    body.append('file', file);

    setIsUploading(true);
    try {
      const res = await axiosClient.post<{ url: string }>(
        `/admin/uploads/image?folder=${folder}`,
        body,
        // Without this the instance's default `application/json` wins, and
        // axios quietly serialises the FormData to JSON — the file never
        // leaves the browser. Naming any other type stops that; the adapter
        // then replaces it with the real multipart header plus its boundary.
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      onChange(res.url);
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not upload that image'));
    } finally {
      setIsUploading(false);
      // Let the same file be picked again after a failure — without this the
      // input's value is unchanged and onChange never fires a second time.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-black uppercase text-gray-500 tracking-widest">
        {label}
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-3xl border-2 border-dashed transition-colors min-h-[200px] flex items-center justify-center overflow-hidden ${
          isDragging
            ? 'border-black bg-brand-soft'
            : 'border-gray-300 bg-surface-muted'
        }`}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Preview"
              className="max-w-full max-h-[220px] object-contain"
              onError={(e) => {
                e.currentTarget.src = PRODUCT_PLACEHOLDER;
              }}
            />
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="absolute top-3 right-3 p-2.5 bg-white/90 backdrop-blur text-state-danger hover:bg-state-danger hover:text-white rounded-xl shadow-sm transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <div className="text-center text-gray-400 px-6 py-8">
            <ImageIcon size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-[10px] font-black uppercase tracking-widest">No image</p>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-black" size={26} />
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Uploading
            </span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="w-full bg-black text-white px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <UploadCloud size={14} />
        {value ? 'Replace image' : 'Choose or drop an image'}
      </button>

      <details className="group">
        <summary className="text-[10px] font-bold uppercase tracking-widest text-gray-400 cursor-pointer hover:text-black transition-colors list-none">
          or paste a URL
        </summary>
        <input
          type="url"
          value={value}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
          className="mt-3 w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-3 px-4 text-sm font-medium outline-none transition-all"
        />
      </details>

      <p className="text-[11px] font-medium text-gray-400">
        JPEG, PNG, WebP or AVIF up to 5MB. Resized and converted to WebP on upload.
      </p>
    </div>
  );
};

export default ImageUpload;
