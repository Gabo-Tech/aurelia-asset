import { useCallback, useRef, useState, type RefObject } from "react";

const THRESHOLD = 72;

type Options = {
  onRefresh: () => void | Promise<void>;
  disabled?: boolean;
};

/**
 * Lightweight pull-to-refresh for a scrollable container.
 * Attach `handlers` to the scroll element and render `pulling` / `refreshing` UI as needed.
 */
export function usePullToRefresh({ onRefresh, disabled }: Options) {
  const startY = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const bindRef = useCallback((el: HTMLElement | null) => {
    containerRef.current = el;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      const el = containerRef.current;
      if (el && el.scrollTop > 0) return;
      startY.current = e.touches[0]?.clientY ?? 0;
    },
    [disabled, refreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing || !startY.current) return;
      const el = containerRef.current;
      if (el && el.scrollTop > 0) {
        setPull(0);
        return;
      }
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy > 0) setPull(Math.min(dy * 0.45, THRESHOLD * 1.4));
    },
    [disabled, refreshing],
  );

  const onTouchEnd = useCallback(async () => {
    if (disabled || refreshing) {
      setPull(0);
      startY.current = 0;
      return;
    }
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
    startY.current = 0;
  }, [disabled, refreshing, pull, onRefresh]);

  return {
    bindRef: bindRef as (el: HTMLElement | null) => void,
    containerRef: containerRef as RefObject<HTMLElement | null>,
    pull,
    refreshing,
    pulling: pull > 8,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
