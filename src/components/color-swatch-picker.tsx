import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const SWATCH_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#a78bfa",
  "#ef4444",
  "#0ea5e9",
  "#f472b6",
  "#22c55e",
];

type Props = {
  value?: string;
  onChange: (v: string | undefined) => void;
  /** Size of the swatch trigger in px. */
  size?: number;
  allowClear?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function ColorSwatchPicker({
  value,
  onChange,
  size = 20,
  allowClear = true,
  className,
  ariaLabel = "Pick color",
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-block shrink-0 rounded-md border border-border/60 ${className ?? ""}`}
          style={{
            width: size,
            height: size,
            background:
              value ??
              "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 50% / 6px 6px",
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-4 gap-2">
          {SWATCH_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`h-7 w-full rounded-md border ${
                value === c ? "border-foreground" : "border-border/60"
              }`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="color"
            value={value ?? "#3b82f6"}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-14 cursor-pointer p-1"
          />
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder="#hex"
            className="h-8 flex-1"
          />
        </div>
        {allowClear && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={() => onChange(undefined)}
          >
            Reset
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
