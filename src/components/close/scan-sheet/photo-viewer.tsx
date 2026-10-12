"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Full-size view of the scanned photo. Pinch to zoom, then pan. */
export function PhotoViewer({ src, open, onOpenChange }: { src: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1rem)] p-2 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Scanned sheet</DialogTitle>
          <DialogDescription>Full-size photo of the ticker sheet. Pinch to zoom.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[78dvh] overflow-auto overscroll-contain" style={{ touchAction: "pinch-zoom" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Scanned ticker sheet" className="h-auto w-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
