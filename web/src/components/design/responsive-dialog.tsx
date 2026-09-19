import * as React from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Show a default close button in the drawer footer when no custom footer */
  showClose?: boolean;
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  showClose = true,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const closeLabel = t("common.close", { defaultValue: "Close" });

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {/* Do not pass max-w-* className here — drawers are full-bleed. */}
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          {/* Bound with max-h, not unbounded flex-1 — flex-1 inside h-auto collapses to 0. */}
          <div className="overflow-y-auto overscroll-contain px-4 pb-2 max-h-[min(60dvh,calc(92dvh-11rem))]">
            {children}
          </div>
          {(footer || showClose) && (
            <DrawerFooter className="shrink-0 border-t border-border/50 gap-2">
              {footer}
              {showClose && !footer ? (
                <DrawerClose asChild>
                  <Button variant="outline" className="min-h-11">
                    {closeLabel}
                  </Button>
                </DrawerClose>
              ) : null}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "rounded-2xl max-h-[90dvh] flex flex-col gap-4 overflow-hidden",
          className,
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">{children}</div>
        {footer ? <DialogFooter className="shrink-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
