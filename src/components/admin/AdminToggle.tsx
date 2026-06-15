import React from 'react';
import { cn } from '../../lib/utils';

type AdminToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
};

const AdminToggle: React.FC<AdminToggleProps> = ({ checked, onChange, 'aria-label': ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-catchy',
      checked ? 'bg-catchy' : 'bg-gray-300'
    )}
  >
    <span
      aria-hidden
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out',
        checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
      )}
    />
  </button>
);

export default AdminToggle;
