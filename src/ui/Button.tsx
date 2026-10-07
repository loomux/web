import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

// The app's one button (build-plan §3). Built on react-aria's Button for
// press handling that works the same for mouse, touch and keyboard
// (onPress, not onClick), and data-* states the styles key on.
// `pendingLabel` replaces the label while `isPending`, so every in-flight
// state says what it's doing instead of just going grey.
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink data-[hovered]:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line data-[hovered]:bg-surface-2",
  quiet: "bg-transparent text-ink-2 data-[hovered]:bg-surface-2 data-[hovered]:text-ink",
  danger: "bg-surface text-bad border border-bad data-[hovered]:bg-bad-soft",
};

const SIZE = {
  md: "min-h-11 px-4 text-[0.9375rem] gap-2",
  sm: "min-h-9 px-3 text-sm gap-1.5 pointer-coarse:min-h-11",
};

export interface ButtonProps extends Omit<AriaButtonProps, "children" | "className"> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  pendingLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  pendingLabel,
  isPending,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      isPending={isPending}
      className={`inline-flex items-center justify-center rounded-control font-bold whitespace-nowrap transition-colors data-[disabled]:opacity-55 data-[pending]:opacity-75 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {isPending && pendingLabel ? pendingLabel : children}
    </AriaButton>
  );
}
