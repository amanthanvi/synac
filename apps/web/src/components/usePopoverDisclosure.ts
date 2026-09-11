'use client';

import { useCallback, useEffect, useId, useState } from 'react';

type PopoverDisclosure = {
  open: boolean;
  panelId: string;
  /** Callback ref for the element that wraps trigger + panel. */
  setContainer: (element: HTMLElement | null) => void;
  /** Callback ref for the trigger, so Escape can restore focus to it. */
  setTrigger: (element: HTMLButtonElement | null) => void;
  toggle: () => void;
};

/**
 * Button-driven popover state: Escape closes and returns focus to the trigger,
 * a pointer press outside closes without stealing focus.
 *
 * Deliberately not hover-only: hover reveals are unreachable by keyboard and
 * on touch, which is what made the old citation/preview tooltips inaccessible.
 *
 * Elements are tracked as state via callback refs rather than `useRef` so the
 * effect re-subscribes when the node changes, and so nothing ref-shaped is read
 * during render.
 */
export function usePopoverDisclosure(): PopoverDisclosure {
  const panelId = `disclosure-${useId()}`;
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open || !container) return;

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && container?.contains(event.target))
        return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [container, open, trigger]);

  return { open, panelId, setContainer, setTrigger, toggle };
}
