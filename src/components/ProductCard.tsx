import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS } from '../constants';
import { cn } from '../lib/utils';

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
  variant?: 'default' | 'hero';
  autoPlay?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, variant = 'default', autoPlay = false }) => {
  const isHero = variant === 'hero';
  const { isRTL } = useLanguage();

  const images = React.useMemo(() => {
    const list = Array.isArray(product.images) && product.images.length > 0 
      ? product.images 
      : (product.image ? [product.image] : []);
    
    if (list.length === 0) {
      return ['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000'];
    }
    return list;
  }, [product.images, product.image]);

  const displayImages = React.useMemo(() => {
    if (images.length === 0) return ['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000'];
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
          "relative aspect-[3/4] rounded-2xl overflow-hidden mb-4 bg-neutral-100",
          isHero && "bg-neutral-900/50 border border-white/10 shadow-xl backdrop-blur-sm"
        )}>
          <div className="absolute inset-0 overflow-hidden">
            {isHero ? (
              <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
                <img
                  src={images[0] || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600';
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
                      src={img || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}
                      alt={`${product.name} - ${idx}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600';
                      }}
                    />
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          {/* Overlay Hover Effect */}
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
        </div>
      </Link>
      <div className={cn("px-1 space-y-1", isHero ? "text-center" : "")}>
        <h3 className={cn(
          "font-sans text-sm font-medium transition-colors",
          isHero ? "text-white text-xs group-hover:text-catchy" : "text-gray-900"
        )}>
          <Link to={`/product/${product.id}`} className="truncate block">{product.name}</Link>
        </h3>
        <p className={cn(
          "font-sans text-xs",
          isHero ? "text-white/60 font-bold" : "text-gray-500"
        )}>${product.price}</p>
      </div>
    </div>
  );
};

export default ProductCard;
