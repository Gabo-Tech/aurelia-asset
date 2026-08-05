import { useIsMobile } from "@/hooks/use-mobile";
import { Toaster } from "@/components/ui/sonner";

export function ResponsiveToaster() {
  const isMobile = useIsMobile();
  return (
    <Toaster
      position={isMobile ? "bottom-center" : "top-right"}
      richColors
      offset={isMobile ? 88 : undefined}
    />
  );
}
