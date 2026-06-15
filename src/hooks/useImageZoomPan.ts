import { useCallback, useRef, useState, type WheelEvent, type PointerEvent, type TouchEvent, type MouseEvent } from 'react';

type Point = { x: number; y: number };

type ZoomPanState = {
  scale: number;
  x: number;
  y: number;
};

type UseImageZoomPanOptions = {
  minScale?: number;
  maxScale?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(t1: Touch, t2: Touch) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

export function useImageZoomPan(options: UseImageZoomPanOptions = {}) {
  const minScale = options.minScale ?? 1;
  const maxScale = options.maxScale ?? 5;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [{ scale, x, y }, setState] = useState<ZoomPanState>({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const touchPanRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const lastTapRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const clampPosition = useCallback(
    (nextX: number, nextY: number, nextScale: number): Point => {
      const el = viewportRef.current;
      if (!el) return { x: nextX, y: nextY };
      const maxX = ((nextScale - 1) * el.clientWidth) / 2;
      const maxY = ((nextScale - 1) * el.clientHeight) / 2;
      return {
        x: clamp(nextX, -maxX, maxX),
        y: clamp(nextY, -maxY, maxY),
      };
    },
    []
  );

  const applyZoomAt = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const focalX = clientX - rect.left - rect.width / 2;
      const focalY = clientY - rect.top - rect.height / 2;
      const clampedScale = clamp(nextScale, minScale, maxScale);

      setState((prev) => {
        const ratio = clampedScale / prev.scale;
        const next = clampPosition(
          focalX - (focalX - prev.x) * ratio,
          focalY - (focalY - prev.y) * ratio,
          clampedScale
        );
        return { scale: clampedScale, ...next };
      });
    },
    [clampPosition, minScale, maxScale]
  );

  const reset = useCallback(() => {
    setState({ scale: 1, x: 0, y: 0 });
    dragRef.current = null;
    pinchRef.current = null;
    setIsDragging(false);
    touchPanRef.current = null;
  }, []);

  const zoomIn = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * 1.35);
  }, [applyZoomAt, scale]);

  const zoomOut = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale / 1.35);
  }, [applyZoomAt, scale]);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -0.18 : 0.18;
      applyZoomAt(event.clientX, event.clientY, scale + delta);
    },
    [applyZoomAt, scale]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (pinchRef.current) return;
      if (scale <= 1) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: x,
        originY: y,
      };
      setIsDragging(true);
    },
    [scale, x, y]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = clampPosition(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
        scale
      );
      setState((prev) => ({ ...prev, ...next }));
    },
    [clampPosition, scale]
  );

  const onPointerUp = useCallback((event: PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length === 2) {
        dragRef.current = null;
        touchPanRef.current = null;
        const [t1, t2] = [event.touches[0]!, event.touches[1]!];
        const center = touchCenter(t1, t2);
        pinchRef.current = {
          startDistance: touchDistance(t1, t2),
          startScale: scale,
          startX: x,
          startY: y,
          centerX: center.x,
          centerY: center.y,
        };
        return;
      }
      if (event.touches.length === 1 && scale > 1) {
        const touch = event.touches[0]!;
        touchPanRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          originX: x,
          originY: y,
        };
        setIsDragging(true);
      }
    },
    [scale, x, y]
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        const [t1, t2] = [event.touches[0]!, event.touches[1]!];
        const distance = touchDistance(t1, t2);
        if (pinch.startDistance <= 0) return;
        const nextScale = clamp((pinch.startScale * distance) / pinch.startDistance, minScale, maxScale);
        applyZoomAt(pinch.centerX, pinch.centerY, nextScale);
        return;
      }

      const pan = touchPanRef.current;
      if (pan && event.touches.length === 1 && scale > 1) {
        event.preventDefault();
        const touch = event.touches[0]!;
        const next = clampPosition(
          pan.originX + (touch.clientX - pan.startX),
          pan.originY + (touch.clientY - pan.startY),
          scale
        );
        setState((prev) => ({ ...prev, ...next }));
      }
    },
    [applyZoomAt, clampPosition, maxScale, minScale, scale]
  );

  const onTouchEnd = useCallback(() => {
    if (pinchRef.current) pinchRef.current = null;
    touchPanRef.current = null;
    setIsDragging(false);
  }, []);

  const onDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      if (scale > 1.05) {
        reset();
        return;
      }
      applyZoomAt(event.clientX, event.clientY, 2.75);
    },
    [applyZoomAt, reset, scale]
  );

  const onClick = useCallback(
    (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        event.preventDefault();
        if (scale > 1.05) {
          reset();
        } else {
          applyZoomAt(event.clientX, event.clientY, 2.75);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    },
    [applyZoomAt, reset, scale]
  );

  const viewportHandlers = {
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  };

  return {
    viewportRef,
    scale,
    x,
    y,
    reset,
    zoomIn,
    zoomOut,
    viewportHandlers,
    onDoubleClick,
    onClick,
    isZoomed: scale > 1.02,
    isDragging,
  };
}
