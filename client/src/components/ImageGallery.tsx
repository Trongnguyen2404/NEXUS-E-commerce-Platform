import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import { getErrorMessage } from '../api/axiosClient';
import { uploadImage, type UploadFolder } from '../api/uploadImage';
import ImageCropper from './ImageCropper';
import { PRODUCT_PLACEHOLDER } from './productPlaceholder';

// Props for the multi-image manager.
interface Props {
  
  value: string[];
  onChange: (urls: string[]) => void;
  folder: UploadFolder;
  
  max?: number;
  
  aspect?: number;
}


// Manages a product's image list: upload, reorder and remove.
const ImageGallery = ({ value, onChange, folder, max = 10, aspect = 1 }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  const [queue, setQueue] = useState<File[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);

  
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const isFull = value.length >= max;

  
  const upload = async (file: File) => {
    setUploading((n) => n + 1);
    try {
      const url = await uploadImage(file, folder);
      
      
      onChange([...valueRef.current, url]);
      valueRef.current = [...valueRef.current, url];
    } catch (error) {
      toast.error(
        error instanceof Error && error.name === 'FileTooLargeError'
          ? error.message
          : getErrorMessage(error, `Could not upload ${file.name}`),
      );
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const enqueue = (files: File[]) => {
    const room = max - value.length - queue.length;
    if (room <= 0) {
      toast.error(`A product can have at most ${max} images.`);
      return;
    }

    
    
    const accepted = files.slice(0, room);
    if (files.length > room) {
      toast.warn(`Only ${room} more image${room === 1 ? '' : 's'} fit — the rest were skipped.`);
    }

    setQueue(accepted);
    setQueueTotal(accepted.length);
  };

  const advance = () => setQueue((rest) => rest.slice(1));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;

    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  const pick = (list: FileList | null) => {
    if (list?.length) enqueue([...list]);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <label className="block text-[10px] font-black uppercase text-gray-500 tracking-widest">
          Images
        </label>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {value.length} / {max}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`rounded-3xl border-2 border-dashed p-4 transition-colors ${
          isDragging ? 'border-black bg-brand-soft' : 'border-gray-300 bg-surface-muted'
        }`}
      >
        {value.length === 0 && uploading === 0 ? (
          <div className="text-center text-gray-400 py-10">
            <ImageIcon size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-[10px] font-black uppercase tracking-widest">No images yet</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {value.map((url, index) => (
              <li
                key={`${url}-${index}`}
                className="relative group bg-white rounded-2xl border border-gray-200 overflow-hidden"
              >
                <div className="aspect-square flex items-center justify-center p-2">
                  <img
                    src={url}
                    alt={index === 0 ? 'Cover image' : `Image ${index + 1}`}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = PRODUCT_PLACEHOLDER;
                    }}
                  />
                </div>

                {index === 0 && (
                  <span className="absolute top-2 left-2 bg-black text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md">
                    Cover
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex justify-between p-1.5 bg-gradient-to-t from-black/50 to-transparent">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label={`Move image ${index + 1} earlier`}
                      className="p-1.5 bg-white/90 rounded-lg text-black hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === value.length - 1}
                      aria-label={`Move image ${index + 1} later`}
                      className="p-1.5 bg-white/90 rounded-lg text-black hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove image ${index + 1}`}
                    className="p-1.5 bg-white/90 rounded-lg text-state-danger hover:bg-state-danger hover:text-white transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}

            {Array.from({ length: uploading }, (_, i) => (
              <li
                key={`pending-${i}`}
                className="aspect-square bg-white rounded-2xl border border-gray-200 flex items-center justify-center"
              >
                <Loader2 className="animate-spin text-gray-300" size={22} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      <button
        type="button"
        disabled={queue.length > 0 || isFull}
        onClick={() => inputRef.current?.click()}
        className="w-full bg-black text-white px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <UploadCloud size={14} />
        {isFull ? `Limit of ${max} reached` : 'Add images'}
      </button>

      <p className="text-[11px] font-medium text-gray-400">
        JPEG, PNG, WebP or AVIF up to 5MB each. Every image is cropped to{' '}
        {aspect === 1 ? 'a square' : `${aspect.toFixed(2)}:1`} on upload, so the grid
        stays even. The first image is the cover — use the arrows to reorder.
      </p>

      {queue.length > 0 && (
        <ImageCropper
          key={`${queue[0].name}-${queue[0].lastModified}`}
          file={queue[0]}
          aspect={aspect}
          progressLabel={queueTotal > 1 ? `${queueTotal - queue.length + 1} of ${queueTotal}` : undefined}
          onCancel={advance}
          onCropped={(cropped) => {
            advance();
            void upload(cropped);
          }}
        />
      )}
    </div>
  );
};

export default ImageGallery;
