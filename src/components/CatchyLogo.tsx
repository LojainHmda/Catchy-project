import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

type CatchyLogoProps = {
  className?: string;
  to?: string;
};

const CatchyLogo: React.FC<CatchyLogoProps> = ({ className, to = '/' }) => {
  return (
    <Link
      to={to}
      dir="ltr"
      aria-label="Catchy"
      className={cn('catchy-logo pointer-events-auto inline-flex shrink-0 items-center', className)}
    >
      <span className="catchy-logo-mark" aria-hidden="true">
        c
      </span>
      <span className="catchy-logo-word">ATCHY</span>
    </Link>
  );
};

export default CatchyLogo;
