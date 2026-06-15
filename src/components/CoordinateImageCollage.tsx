import React from 'react';
import { cn } from '../lib/utils';
import { isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER, sanitizeImageSrc } from '../lib/productImages';

export type CoordinateImageCollageProps = {
  images: string[];
  className?: string;
  variant?: 'card' | 'detail';
  onImageClick?: (index: number) => void;
};

function CollageCell({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const safeSrc = sanitizeImageSrc(src);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden bg-neutral-100',
        onClick && 'cursor-zoom-in transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-catchy',
        className
      )}
    >
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy={isRemoteImageUrl(safeSrc) ? 'no-referrer' : undefined}
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src.includes('product-placeholder.svg')) return;
            el.onerror = null;
            el.src = PRODUCT_IMAGE_PLACEHOLDER;
          }}
        />
      ) : null}
    </Tag>
  );
}

const CoordinateImageCollage: React.FC<CoordinateImageCollageProps> = ({
  images,
  className,
  variant = 'card',
  onImageClick,
}) => {
  const gap = variant === 'detail' ? 'gap-1' : 'gap-px';
  const imgs = (images.length > 0 ? images.slice(0, 4) : [])
    .map((url) => sanitizeImageSrc(url))
    .filter((url): url is string => Boolean(url));
  const displayImgs = imgs.length > 0 ? imgs : [PRODUCT_IMAGE_PLACEHOLDER];
  const click = (i: number) => onImageClick?.(i);

  if (displayImgs.length === 1) {
    return (
      <div className={cn('aspect-[5/6] overflow-hidden rounded-md bg-white', className)}>
        <CollageCell src={displayImgs[0]!} alt="" className="h-full w-full" onClick={onImageClick ? () => click(0) : undefined} />
      </div>
    );
  }

  if (displayImgs.length === 2) {
    return (
      <div className={cn('grid aspect-[5/6] grid-cols-2 overflow-hidden rounded-md bg-white', gap, className)}>
        {displayImgs.map((src, i) => (
          <CollageCell key={i} src={src} alt="" className="h-full min-h-0" onClick={onImageClick ? () => click(i) : undefined} />
        ))}
      </div>
    );
  }

  if (displayImgs.length === 3) {
    return (
      <div className={cn('grid aspect-[5/6] grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-white', gap, className)}>
        <CollageCell src={displayImgs[0]!} alt="" className="row-span-2 h-full min-h-0" onClick={onImageClick ? () => click(0) : undefined} />
        <CollageCell src={displayImgs[1]!} alt="" className="h-full min-h-0" onClick={onImageClick ? () => click(1) : undefined} />
        <CollageCell src={displayImgs[2]!} alt="" className="h-full min-h-0" onClick={onImageClick ? () => click(2) : undefined} />
      </div>
    );
  }

  return (
    <div className={cn('grid aspect-[5/6] grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-white', gap, className)}>
      {displayImgs.map((src, i) => (
        <CollageCell key={i} src={src} alt="" className="h-full min-h-0" onClick={onImageClick ? () => click(i) : undefined} />
      ))}
    </div>
  );
};

export default CoordinateImageCollage;
