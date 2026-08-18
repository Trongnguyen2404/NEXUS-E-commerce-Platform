import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Check, Loader2, RotateCw, X, ZoomIn } from 'lucide-react';

// Props for the crop modal.
interface Props {
  
  file: File;
  
  aspect: number;
  
  maxEdge?: number;
  onCancel: () => void;
  onCropped: (file: File) => void;
  
  progressLabel?: string;
}


// Draws the chosen crop onto a canvas and returns it as a file.
const renderCrop = (
  image: HTMLImageElement,
  crop: Area,
  rotation: number,
  maxEdge: number,
  name: string,
): Promise<File> => {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is unavailable'));

  
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (rotation) {
    
    const radians = (rotation * Math.PI) / 180;
    const box = document.createElement('canvas');
    const diagonal = Math.hypot(image.naturalWidth, image.naturalHeight);
    box.width = diagonal;
    box.height = diagonal;

    const boxCtx = box.getContext('2d');
    if (!boxCtx) return Promise.reject(new Error('Canvas is unavailable'));

    boxCtx.translate(diagonal / 2, diagonal / 2);
    boxCtx.rotate(radians);
    boxCtx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    const offsetX = (diagonal - image.naturalWidth) / 2;
    const offsetY = (diagonal - image.naturalHeight) / 2;
    ctx.drawImage(
      box,
      crop.x + offsetX, crop.y + offsetY, crop.width, crop.height,
      0, 0, width, height,
    );
  } else {
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Could not export the crop'));
        resolve(new File([blob], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  });
};


// Modal that crops an image to a fixed aspect before it is uploaded.
const ImageCropper = ({
  file,
  aspect,
  maxEdge = 1600,
  onCancel,
  onCropped,
  progressLabel,
}: Props) => {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const areaRef = useRef<Area | null>(null);

  
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setSrc(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, isSaving]);

  const handleComplete = useCallback((_: Area, pixels: Area) => {
    areaRef.current = pixels;
  }, []);

  const apply = async () => {
    if (!src || !areaRef.current) return;

    setIsSaving(true);
    try {
      const image = new Image();
      image.src = src;
      await image.decode();
      onCropped(await renderCrop(image, areaRef.current, rotation, maxEdge, file.name));
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crop image"
        className="relative z-10 bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-8 py-6 border-b border-gray-200 bg-surface-muted flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Crop image</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mt-1">
              {progressLabel ? `${progressLabel} · ` : ''}
              {aspect === 1 ? 'Square' : `${aspect.toFixed(2)} : 1`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="Cancel crop"
            className="p-2 bg-gray-200 hover:bg-state-danger hover:text-white rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative h-[380px] bg-black">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleComplete}
              showGrid
            />
          )}
        </div>

        <div className="px-8 py-6 space-y-5">
          <div className="flex items-center gap-4">
            <ZoomIn size={16} className="text-gray-400 shrink-0" aria-hidden />
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              aria-label="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-black"
            />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate 90 degrees"
              title="Rotate"
              className="p-2.5 bg-surface-muted hover:bg-black hover:text-white rounded-xl transition-colors shrink-0"
            >
              <RotateCw size={16} />
            </button>
          </div>

          <p className="text-[11px] font-medium text-gray-400">
            Drag to reposition. Everything outside the frame is discarded, so every
            product photo ends up the same shape.
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-6 py-3 bg-surface-muted text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-surface-sunken transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={isSaving}
              className="px-8 py-3 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
              Use this crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;
