import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
        secondary: "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[#eef3ef]",
        danger: "bg-[var(--danger)] text-white hover:bg-[#8f1d17]",
        ghost: "text-[var(--foreground)] hover:bg-[#eef3ef]"
      },
      size: {
        default: "min-h-10 px-4",
        icon: "h-10 w-10 px-0",
        sm: "min-h-9 px-3 text-xs"
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
