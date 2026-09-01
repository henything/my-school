import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-[var(--brand-yellow)] text-[var(--foreground)] shadow-sm hover:bg-[#ffd447]",
        secondary: "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--blue-soft)]",
        danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger-strong)]",
        ghost: "text-[var(--foreground)] hover:bg-[var(--blue-soft)]"
      },
      size: {
        default: "min-h-11 px-4",
        icon: "h-11 w-11 min-w-[44px] px-0",
        sm: "min-h-10 px-3 text-xs"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
