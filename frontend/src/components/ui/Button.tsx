import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary hover:bg-primary-hover text-white',
  secondary: 'bg-secondary hover:bg-secondary-hover text-black',
  danger: 'bg-red-700 hover:bg-red-800 text-white',
  ghost: 'bg-transparent hover:bg-white/10 text-white border border-white/20',
};

const sizeClasses: Record<Size, string> = {
  md: 'h-12 px-4 text-base',
  lg: 'h-14 px-6 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(
        clsx(
          'rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
        ),
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
