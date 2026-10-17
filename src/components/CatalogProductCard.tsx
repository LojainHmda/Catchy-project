import React from 'react';
import { Link } from 'react-router-dom';
import { Barcode, Edit2, QrCode, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { type CatalogColorSwatch, type CatalogListProduct } from '../lib/catalogProductList';
import { isRemoteImageUrl, sanitizeImageSrc } from '../lib/productImages';
import { cloudinaryTransform } from '../lib/cloudinaryTransform';
import { ProductSaleBadge } from './ProductPriceDisplay';

export interface CatalogProductCardProps {
  product: Pick<CatalogListProduct, 'id' | 'name' | 'price' | 'images' | 'sizes' | 'sizeStock'>;
  compareAtPrice?: number | null;
  discountPercent?: number;
  saleLabel: string;
  colorSwatches?: CatalogColorSwatch[];
  priority?: boolean;
  /** When provided, an admin-only edit button is overlaid on the card. */
  onEdit?: () => void;
  /** When provided, an admin-only QR code button is overlaid on the card. */
  onShowQr?: () => void;
  /** When provided, an admin-only barcode button is overlaid on the card. */
  onShowBarcode?: () => void;
  /** When provided, an admin-only permanent-delete button is overlaid on the card. */
  onDelete?: () => void;
}

const CatalogProductCard: React.FC<CatalogProductCardProps> = ({
  product,
  compareAtPrice,
  discountPercent,
  saleLabel,
  priority = false,
  onEdit,
  onShowQr,
  onShowBarcode,
  onDelete,
}) => {
  const src = sanitizeImageSrc(product.images?.[0] ?? '');
  const onSale = typeof compareAtPrice === 'number' && compareAtPrice > product.price;

  return (
    <article className="group w-full font-sans">
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-neutral-100">
          {onSale && (
            <ProductSaleBadge
              label={saleLabel}
              percent={discountPercent}
              className="left-1.5 top-1.5"
            />
          )}
          {(onEdit || onShowQr || onShowBarcode || onDelete) && (
            <div className="absolute right-1.5 top-1.5 z-10 flex flex-col gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  aria-label="Edit product"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-catchy-dark shadow-sm ring-1 ring-black/[0.06] transition hover:bg-catchy hover:text-white"
                >
                  <Edit2 className="h-3 w-3" aria-hidden />
                </button>
              )}
              {onShowQr && (
                <button
                  type="button"
                  aria-label="Show product QR code"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowQr();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-catchy-dark shadow-sm ring-1 ring-black/[0.06] transition hover:bg-catchy hover:text-white"
                >
                  <QrCode className="h-3 w-3" aria-hidden />
                </button>
              )}
              {onShowBarcode && (
                <button
                  type="button"
                  aria-label="Show product barcode"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowBarcode();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-catchy-dark shadow-sm ring-1 ring-black/[0.06] transition hover:bg-catchy hover:text-white"
                >
                  <Barcode className="h-3 w-3" aria-hidden />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  aria-label="Delete product permanently"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-catchy-dark shadow-sm ring-1 ring-black/[0.06] transition hover:bg-red-600 hover:text-white"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
          )}
          {src ? (
            <img
              src={cloudinaryTransform(src, { width: 480, height: 640 })}
              alt={product.name}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-100" aria-hidden />
          )}

          {/* Price — hidden by default, revealed as a glass overlay on hover (desktop) / tap (mobile). */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 group-active:opacity-100">
            <div className="rounded-xl border border-white/30 bg-white/15 px-4 py-2 shadow-xl backdrop-blur-md">
              <span
                className={cn(
                  'text-sm font-bold tracking-wide sm:text-base',
                  onSale ? 'text-red-200' : 'text-white'
                )}
              >
                ILS {product.price}
              </span>
              {onSale && compareAtPrice != null && (
                <span className="ms-1.5 text-xs text-white/70 line-through">ILS {compareAtPrice}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
};

export default React.memo(CatalogProductCard);
