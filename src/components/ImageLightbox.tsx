import React, { useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

export type ImageLightboxProps = {
  images: string[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  alt?: string;
};

const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  index,
  open,
  onClose,
  onIndexChange,
  alt = '',
}) => {
  const [zoomed, setZoomed] = React.useState(false);
  const src = images[index] ?? PRODUCT_IMAGE_PLACEHOLDER;
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasMultiple) onIndexChange(Math.max(0, index - 1));
      if (e.key === 'ArrowRight' && hasMultiple) onIndexChange(Math.min(images.length - 1, index + 1));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, index, images.length, hasMultiple, onClose, onIndexChange]);

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < images.length - 1) onIndexChange(index + 1);
  }, [index, images.length, onIndexChange]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col bg-black/92 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Image zoom"
          onClick={onClose}
        >
          <div className="flex shrink-0 items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-white/80">
              {hasMultiple ? `${index + 1} / ${images.length}` : 'Zoom'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
              >
                {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            {hasMultiple && index > 0 ? (
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 sm:left-4"
                aria-label="Previous image"
              >
                <ChevronLeft size={24} />
              </button>
            ) : null}

            <motion.img
              key={src}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: zoomed ? 1.75 : 1 }}
              transition={{ duration: 0.2 }}
              src={src}
              alt={alt}
              className={cn(
                'max-h-[min(78vh,720px)] max-w-full object-contain transition-transform duration-300',
                zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              )}
              referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
              onClick={() => setZoomed((z) => !z)}
              onError={(e) => {
                (e.target as HTMLImageElement).src = PRODUCT_IMAGE_PLACEHOLDER;
              }}
            />

            {hasMultiple && index < images.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 sm:right-4"
                aria-label="Next image"
              >
                <ChevronRight size={24} />
              </button>
            ) : null}
          </div>

          {hasMultiple ? (
            <div className="flex shrink-0 justify-center gap-2 px-4 pb-6" onClick={(e) => e.stopPropagation()}>
              {images.map((thumb, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={cn(
                    'h-14 w-11 overflow-hidden rounded-md border-2 transition',
                    i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
                  )}
                >
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ImageLightbox;
