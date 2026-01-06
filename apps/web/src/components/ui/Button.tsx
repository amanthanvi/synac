import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';

import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'ghost';
type ButtonSize = 'md' | 'sm';

function cx(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ');
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = 'ghost',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        styles.button,
        variant === 'primary' ? styles.primary : styles.ghost,
        size === 'sm' ? styles.sm : undefined,
        className
      )}
    />
  );
}

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, 'className'> & {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  className,
  variant = 'ghost',
  size = 'md',
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      {...props}
      className={cx(
        styles.button,
        variant === 'primary' ? styles.primary : styles.ghost,
        size === 'sm' ? styles.sm : undefined,
        className
      )}
    />
  );
}
