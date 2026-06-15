import React, { useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import { useImageZoomPan } from '../hooks/useImageZoomPan';
import { useLanguage } from '../context/LanguageContext';

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
  const { t, isRTL } = useLanguage();
  const src = images[index] ?? PRODUCT_IMAGE_PLACEHOLDER;
  const hasMultiple = images.length > 1;

  const {
    viewportRef,
    scale,
    x,
    y,
    reset,
    zoomIn,
    zoomOut,
    viewportHandlers,
    onDoubleClick,
    onClick,
    isZoomed,
    isDragging,
  } = useImageZoomPan({ minScale: 1, maxScale: 5 });

  useEffect(() => {
    if (open) reset();
  }, [open, index, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isZoomed) return;
      if (e.key === 'ArrowLeft' && hasMultiple) onIndexChange(Math.max(0, index - 1));
      if (e.key === 'ArrowRight' && hasMultiple) onIndexChange(Math.min(images.length - 1, index + 1));
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, index, images.length, hasMultiple, onClose, onIndexChange, isZoomed, zoomIn, zoomOut, reset]);

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < images.length - 1) onIndexChange(index + 1);
  }, [index, images.length, onIndexChange]);

  const zoomPercent = Math.round(scale * 100);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t('product.zoomTitle')}
          onClick={() => {
            if (!isZoomed) onClose();
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90">
                {hasMultiple ? `${index + 1} / ${images.length}` : t('product.zoomTitle')}
              </p>
              <p className={cn('text-[11px] text-white/55', isRTL && 'font-arabic')}>{t('product.zoomHint')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="hidden min-w-[3rem] text-center text-xs tabular-nums text-white/70 sm:inline">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                aria-label={t('product.zoomOut')}
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 5}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                aria-label={t('product.zoomIn')}
              >
                <ZoomIn size={18} />
              </button>
              {isZoomed ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label={t('product.zoomReset')}
                >
                  <RotateCcw size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label={t('product.zoomClose')}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={cn(
              'relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden px-4 pb-4',
              isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
            )}
            onClick={(e) => e.stopPropagation()}
            {...viewportHandlers}
          >
            {hasMultiple && index > 0 && !isZoomed ? (
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 sm:left-4"
                aria-label="Previous image"
              >
                <ChevronLeft size={24} />
              </button>
            ) : null}

            <img
              key={src}
              src={src}
              alt={alt}
              draggable={false}
              decoding="async"
              className="max-h-[min(82vh,900px)] max-w-[min(96vw,1100px)] object-contain will-change-transform"
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              }}
              referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
              onDoubleClick={onDoubleClick}
              onClick={onClick}
              onError={(e) => {
                (e.target as HTMLImageElement).src = PRODUCT_IMAGE_PLACEHOLDER;
              }}
            />

            {hasMultiple && index < images.length - 1 && !isZoomed ? (
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
            <div className="flex shrink-0 justify-center gap-2 px-4 pb-5" onClick={(e) => e.stopPropagation()}>
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
                  <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          ) : (
            <p className={cn('shrink-0 pb-5 text-center text-[11px] text-white/45', isRTL && 'font-arabic')}>
              {t('product.zoomHintShort')}
            </p>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ImageLightbox;
