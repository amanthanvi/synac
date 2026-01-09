'use client';

import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/Button';

type FocusSearchButtonProps = Omit<ButtonProps, 'type' | 'onClick' | 'children'> & {
  children?: ReactNode;
};

export function FocusSearchButton({ children = 'Search', ...props }: FocusSearchButtonProps) {
  return (
    <Button
      {...props}
      type="button"
      onClick={() => {
        const input = document.getElementById('site-search') as HTMLInputElement | null;
        if (!input) return;
        input.focus();
        input.select();
      }}
    >
      {children}
    </Button>
  );
}

