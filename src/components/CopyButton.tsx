import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
  title?: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
  iconClassName?: string;
  className?: string;
}

export function CopyButton({
  value,
  label,
  title,
  variant = "ghost",
  size = "icon",
  iconClassName = "h-4 w-4",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button variant={variant} size={size} onClick={handleCopy} title={title} className={className}>
      {copied ? (
        <Check className={`${iconClassName} text-green-500 ${label ? "mr-1" : ""}`} />
      ) : (
        <Copy className={`${iconClassName} ${label ? "mr-1" : ""}`} />
      )}
      {label}
    </Button>
  );
}