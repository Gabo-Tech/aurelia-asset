import { useIsMobile } from "@/hooks/use-mobile";
import { Toaster } from "@/components/ui/sonner";

export function ResponsiveToaster() {
  const isMobile = useIsMobile();
  return (
    <Toaster
      position={isMobile ? "bottom-center" : "top-right"}
      richColors
      offset={isMobile ? "calc(var(--app-tabbar-h) + 2.5rem + env(safe-area-inset-bottom, 0px))" : undefined}
    />
  );
}
