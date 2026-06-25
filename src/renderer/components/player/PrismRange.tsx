import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface PrismRangeProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type'> {
  variant?: 'seek' | 'volume';
  bufferedPercent?: number;
  previewFormatter?: (value: number) => string;
  railClassName?: string;
  railBind?: {
    onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

export function PrismRange({
  variant = 'seek',
  bufferedPercent,
  previewFormatter,
  className,
  railClassName,
  railBind,
  disabled,
  min = 0,
  max = 1,
  step = 0.01,
  value,
  onChange,
  onInput,
  onKeyUp,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  'aria-label': ariaLabel,
  ...rest
}: PrismRangeProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const trackbedRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hoverPreview, setHoverPreview] = useState<{ percent: number; value: number } | null>(null);
  const [active, setActive] = useState(false);

  const numericMin = Number(min);
  const numericMax = Number(max) || 1;
  const numericStep = Number(step) || 0.01;
  const numericValue = Number(value ?? numericMin);
  const span = numericMax - numericMin;
  const fillPercent = span > 0 ? ((numericValue - numericMin) / span) * 100 : 0;
  const bufferEnd = bufferedPercent ?? 0;
  const showBuffer = variant === 'seek' && bufferEnd > fillPercent + 0.5;
  const isVolume = variant === 'volume';

  const valueFromClientX = useCallback((clientX: number) => {
    const bed = isVolume ? trackbedRef.current : railRef.current;
    if (!bed) return numericValue;
    const rect = bed.getBoundingClientRect();
    if (rect.width <= 0) return numericValue;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return numericMin + ratio * span;
  }, [isVolume, numericMin, numericValue, span]);

  const emitChange = useCallback((next: number) => {
    if (!onChange) return;
    const clamped = Math.min(numericMax, Math.max(numericMin, next));
    const synthetic = {
      target: { value: String(clamped) },
      currentTarget: { value: String(clamped) },
    } as ChangeEvent<HTMLInputElement>;
    onChange(synthetic);
  }, [numericMax, numericMin, onChange]);

  const updateHover = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || variant !== 'seek' || !previewFormatter) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / event.currentTarget.clientWidth));
    setHoverPreview({ percent: ratio * 100, value: numericMin + ratio * span });
  }, [disabled, numericMin, previewFormatter, span, variant]);

  const clearHover = useCallback(() => {
    setHoverPreview(null);
  }, []);

  const handleVolumePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || !isVolume) return;
    emitChange(valueFromClientX(event.clientX));
  }, [disabled, emitChange, isVolume, valueFromClientX]);

  const handleVolumeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !isVolume) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      emitChange(numericValue + numericStep);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      emitChange(numericValue - numericStep);
    }
  }, [disabled, emitChange, isVolume, numericStep, numericValue]);

  const rootClass = [
    'prism-range',
    `prism-range--${variant}`,
    hoverPreview ? 'is-hovering' : '',
    active ? 'is-active' : '',
    disabled ? 'is-disabled' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const railClass = ['prism-range__rail', railClassName ?? ''].filter(Boolean).join(' ');

  const {
    onLostPointerCapture: seekLostPointerCapture,
    ...seekRest
  } = rest;

  const seekInput = (
    <input
      type="range"
      className="prism-range__input"
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        setActive(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setActive(false);
        clearHover();
        onPointerUp?.(event);
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        setActive(false);
        clearHover();
        onPointerLeave?.(event);
      }}
      onInput={onInput}
      onChange={onChange}
      onKeyUp={onKeyUp}
      onLostPointerCapture={seekLostPointerCapture}
      {...seekRest}
    />
  );

  return (
    <div className={rootClass}>
      <div
        ref={railRef}
        className={railClass}
        onPointerDown={(event) => {
          if (disabled || isVolume) return;
          setActive(true);
          railBind?.onPointerDown?.(event);
        }}
        onPointerMove={(event) => {
          updateHover(event);
          if (isVolume || disabled) return;
          railBind?.onPointerMove?.(event);
          onPointerMove?.(event as unknown as ReactPointerEvent<HTMLInputElement>);
        }}
        onPointerUp={(event) => {
          if (isVolume || disabled) return;
          setActive(false);
          clearHover();
          railBind?.onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          if (isVolume || disabled) return;
          setActive(false);
          clearHover();
          railBind?.onPointerCancel?.(event);
        }}
        onPointerLeave={(event) => {
          clearHover();
          if (!isVolume) onPointerLeave?.(event as unknown as ReactPointerEvent<HTMLInputElement>);
        }}
      >
        {isVolume ? (
          <div
            ref={trackbedRef}
            className="prism-range__trackbed"
            role="slider"
            aria-label={ariaLabel}
            aria-valuemin={numericMin}
            aria-valuemax={numericMax}
            aria-valuenow={numericValue}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleVolumeKeyDown}
            onPointerDown={(event) => {
              if (disabled) return;
              draggingRef.current = true;
              setActive(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              handleVolumePointer(event);
            }}
            onPointerMove={(event) => {
              if (!draggingRef.current) return;
              handleVolumePointer(event);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
              setActive(false);
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
              setActive(false);
            }}
          >
            <div className="prism-range__track" aria-hidden />
            <div className="prism-range__fill" style={{ width: `${fillPercent}%` }} aria-hidden />
          </div>
        ) : (
          <>
            <div className="prism-range__track" aria-hidden />
            {showBuffer && (
              <div className="prism-range__buffer" style={{ width: `${bufferEnd}%` }} aria-hidden />
            )}
            <div className="prism-range__fill" style={{ width: `${fillPercent}%` }} aria-hidden />
            {hoverPreview && previewFormatter && (
              <>
                <div
                  className="prism-range__hover-fill"
                  style={{
                    left: `${Math.min(fillPercent, hoverPreview.percent)}%`,
                    width: `${Math.max(0, hoverPreview.percent - fillPercent)}%`,
                  }}
                  aria-hidden
                />
                <div
                  className="prism-range__hover-mark"
                  style={{ left: `${hoverPreview.percent}%` }}
                  aria-hidden
                />
                <div
                  className="prism-range__tooltip"
                  style={{ left: `${hoverPreview.percent}%` }}
                  aria-hidden
                >
                  {previewFormatter(hoverPreview.value)}
                </div>
              </>
            )}
            {seekInput}
          </>
        )}
      </div>
    </div>
  );
}
