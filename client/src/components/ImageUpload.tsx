import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import { getErrorMessage } from '../api/axiosClient';
import { uploadImage, type UploadFolder } from '../api/uploadImage';
import ImageCropper from './ImageCropper';
import { PRODUCT_PLACEHOLDER } from './productPlaceholder';

// Props for the single-image uploader.
interface Props {
  value: string;
  onChange: (url: string) => void;
  folder: UploadFolder;
  label?: string;

  aspect?: number;
}

// Uploads one image, routing it through the crop modal first.
const ImageUpload = ({ value, onChange, folder, label = 'Image', aspect = 1 }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [pending, setPending] = useState<File | null>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async (file: File) => {
    setIsUploading(true);
    try {
      onChange(await uploadImage(file, folder));
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(
        error instanceof Error && error.name === 'FileTooLargeError'
          ? error.message
          : getErrorMessage(error, 'Could not upload that image'),
      );
    } finally {
      setIsUploading(false);
      resetInput();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) setPending(file);
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
          if (file) setPending(file);
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
        JPEG, PNG, WebP or AVIF up to 5MB. Cropped to{' '}
        {aspect === 1 ? 'a square' : `${aspect.toFixed(2)}:1`}, then resized and
        converted to WebP on upload.
      </p>

      {pending && (
        <ImageCropper
          file={pending}
          aspect={aspect}
          onCancel={() => {
            setPending(null);
            resetInput();
          }}
          onCropped={(cropped) => {
            setPending(null);
            void upload(cropped);
          }}
        />
      )}
    </div>
  );
};

export default ImageUpload;
