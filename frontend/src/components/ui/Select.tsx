import { type SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm text-white/80">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={twMerge(
              clsx(
                'h-12 w-full appearance-none rounded-lg bg-bg-elevated px-3 pr-10 text-white',
                'border border-white/10 focus:border-primary focus:outline-none',
              ),
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
          />
        </div>
      </div>
    );
  },
);
Select.displayName = 'Select';
