"use client";

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        checked ? "border-gold bg-amber" : "border-border bg-track"
      } ${disabled ? "opacity-40" : "active:scale-95"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
