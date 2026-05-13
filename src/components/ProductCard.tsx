import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    images?: string[];
    image?: string;
    category: string;
    stock: number;
  };
  variant?: 'default' | 'hero' | 'compact';
  autoPlay?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, variant = 'default', autoPlay = false }) => {
  const isHero = variant === 'hero';
  const isCompact = variant === 'compact';

  const images = React.useMemo(() => {
    const list = coerceProductImages(product);
    if (list.length === 0) {
      return [PRODUCT_IMAGE_PLACEHOLDER];
    }
    return list;
  }, [product]);

  const displayImages = React.useMemo(() => {
    if (images.length === 0) return [PRODUCT_IMAGE_PLACEHOLDER];
    if (!isHero) {
      if (images.length === 1) return images;
      return [images[images.length - 1], ...images, images[0]];
    }
    // For hero, repeat for continuous loop
    return [...images, ...images, ...images].slice(0, 10);
  }, [images, isHero]);
  
  const [currentIndex, setCurrentIndex] = useState(!isHero && images.length > 1 ? 1 : 0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  React.useEffect(() => {
    setCurrentIndex(!isHero && images.length > 1 ? 1 : 0);
    setIsTransitioning(false);
  }, [images, isHero]);

  React.useEffect(() => {
    if (!autoPlay || images.length <= 1 || isHero) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setCurrentIndex((prev) => prev + 1);
    }, 3000); 
    return () => clearInterval(interval);
  }, [autoPlay, images.length, isHero]);

  const onAnimationComplete = () => {
    if (isHero || images.length <= 1) return;
    if (currentIndex >= displayImages.length - 1) {
      setIsTransitioning(false);
      setCurrentIndex(1);
    } else if (currentIndex <= 0) {
      setIsTransitioning(false);
      setCurrentIndex(displayImages.length - 2);
    } else {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="group">
      <Link to={`/product/${product.id}`} className="block">
        <div className={cn(
          "relative aspect-[3/4] overflow-hidden bg-neutral-100",
          isHero && "rounded-2xl mb-4 bg-neutral-900/50 border border-white/10 shadow-xl backdrop-blur-sm",
          isCompact && "mb-2.5 rounded-xl ring-1 ring-black/[0.04]",
          !isHero && !isCompact && "mb-4 rounded-2xl"
        )}>
          <div className="absolute inset-0 overflow-hidden">
            {isHero ? (
              <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
                <img
                  src={images[0] || PRODUCT_IMAGE_PLACEHOLDER}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  referrerPolicy={isRemoteImageUrl(images[0] || '') ? 'no-referrer' : undefined}
                  onError={(e) => {
                    const el = e.currentTarget;
                    const src = el.currentSrc || el.src;
                    if (src.startsWith('data:')) return;
                    el.onerror = null;
                    el.src = PRODUCT_IMAGE_PLACEHOLDER;
                  }}
                />
              </div>
            ) : (
              <motion.div 
                className="flex h-full w-full"
                animate={{ x: `-${currentIndex * 100}%` }}
                transition={{ duration: isTransitioning ? 0.7 : 0, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={onAnimationComplete}
              >
                {displayImages.map((img, idx) => (
                  <div key={`${product.id}-img-${idx}`} className="w-full h-full flex-shrink-0 bg-neutral-100 flex items-center justify-center">
                    <img
                      src={img}
                      alt={`${product.name} - ${idx}`}
                      className="w-full h-full object-cover"
                      referrerPolicy={isRemoteImageUrl(img) ? 'no-referrer' : undefined}
                      onError={(e) => {
                        const el = e.currentTarget;
                        const src = el.currentSrc || el.src;
                        if (src.startsWith('data:')) return;
                        el.onerror = null;
                        el.src = PRODUCT_IMAGE_PLACEHOLDER;
                      }}
                    />
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          {/* Overlay Hover Effect */}
          <div className={cn(
            "absolute inset-0 pointer-events-none transition-opacity duration-500",
            isCompact ? "bg-catchy-dark/0 group-hover:bg-catchy-dark/[0.04]" : "bg-black/5 opacity-0 group-hover:opacity-100"
          )} />
          
        </div>
      </Link>
      <div className={cn(
        "space-y-1",
        isHero ? "px-1 text-center" : isCompact ? "px-0" : "px-1"
      )}>
        <h3 className={cn(
          "font-sans transition-colors",
          isHero && "text-xs font-medium text-white group-hover:text-catchy",
          isCompact && "text-[13px] font-semibold leading-snug tracking-tight text-catchy-dark group-hover:text-catchy md:text-sm",
          !isHero && !isCompact && "text-sm font-medium text-gray-900"
        )}>
          <Link to={`/product/${product.id}`} className={cn("block", isCompact ? "line-clamp-2" : "truncate")}>{product.name}</Link>
        </h3>
        <p className={cn(
          "font-sans tabular-nums tracking-tight",
          isHero && "text-xs font-bold text-white/60",
          isCompact && "text-xs font-bold text-catchy-dark/85",
          !isHero && !isCompact && "text-xs font-semibold text-catchy-dark"
        )}>£{product.price}</p>
      </div>
    </div>
  );
};

export default ProductCard;
