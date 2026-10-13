"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { LabFields } from "@/components/lab/lab-fields";
import { LabPatterns } from "@/components/lab/lab-patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDetail,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Each R2 component is shown here in every state, with fake data only. Sections are added as the work lands.
function LabSection({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="font-display text-title-2 text-brand">{title}</h2>
        {note ? <p className="mt-1 text-small text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LabGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-small text-ink-muted">{label}</h3>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function LabCanvas() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [destructiveOpen, setDestructiveOpen] = useState(false);

  return (
    <div className="space-y-10 p-4 sm:p-6">
      <LabSection id="lab-buttons" title="Buttons" note="One solid brand action per view. Sizes: sm 36 on desk (44 on touch), md 44, lg 48.">
        <LabGroup label="Variants, md">
          <Button>Complete day</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="ghost">View recap</Button>
          <Button variant="destructive">Delete item</Button>
          <Button variant="link">Open Daily close</Button>
          <span className="inline-flex rounded-full bg-brand p-1"><Button variant="inverse">Undo · 7 s</Button></span>
        </LabGroup>
        <LabGroup label="Sizes, primary">
          <Button size="sm">Small</Button>
          <Button size="default">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Previous day">‹</Button>
        </LabGroup>
        <LabGroup label="Loading and disabled">
          <Button loading>Saving…</Button>
          <Button variant="secondary" loading>Saving draft…</Button>
          <Button disabled>Complete day</Button>
        </LabGroup>
      </LabSection>

      <LabSection id="lab-inputs" title="Inputs" note="Border is line-input (3.15:1). Inputs are 16 px on touch so iOS does not zoom.">
        <div className="grid max-w-md gap-3">
          <Input placeholder="Type to find…" aria-label="Find an item" />
          <Input defaultValue="Chicken Nanban" aria-label="Item name" />
          <Input defaultValue="1.500" disabled aria-label="Disabled example" />
          <Input defaultValue="Use digits" aria-invalid="true" aria-label="Invalid example" />
        </div>
      </LabSection>

      <LabSection id="lab-fields" title="Fields" note="Money, portions, material quantities, dates and periods. Shorthand money is read back on blur.">
        <LabFields />
      </LabSection>

      <LabSection id="lab-patterns" title="Patterns" note="Chips, stats, tabs, banners, states, dialogs, tables and charts.">
        <LabPatterns />
      </LabSection>

      <LabSection id="lab-sheets" title="Sheets and dialogs" note="Sheets are 680 px on tablet and desk, full screen on phone. Confirmations are AlertDialogs.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <Button onClick={() => setConfirmOpen(true)}>Open confirmation</Button>
          <Button variant="destructive" onClick={() => setDestructiveOpen(true)}>Open destructive confirmation</Button>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent aria-describedby="lab-sheet-desc">
            <SheetHeader>
              <SheetTitle>Scan review</SheetTitle>
              <SheetDescription id="lab-sheet-desc">Check each line, then save. Nothing is saved until you confirm.</SheetDescription>
            </SheetHeader>
            <Separator />
            <p className="text-body text-ink-muted">Sheet body: fake content for review.</p>
            <SheetFooter>
              <SheetClose asChild><Button variant="secondary">Stay</Button></SheetClose>
              <Button>Save review</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete Tuesday, 13 Oct?</AlertDialogTitle>
              <AlertDialogDescription>Stock will update from the portions you entered.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogDetail>101 portions · Rp 3.215.000</AlertDialogDetail>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction>Complete day</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={destructiveOpen} onOpenChange={setDestructiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel PO-1013-02?</AlertDialogTitle>
              <AlertDialogDescription>The order is marked cancelled. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {/* Destructive: focus lands on the safe choice. */}
              <AlertDialogCancel autoFocus>Keep order</AlertDialogCancel>
              <AlertDialogAction className="bg-danger-solid hover:bg-danger">Cancel order</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </LabSection>

      <LabSection id="lab-toasts" title="Toasts" note="Tone shows only in the icon disc. Errors stay until dismissed (import toast from lib/toast).">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast.success("Day saved")}>Success</Button>
          <Button variant="secondary" onClick={() => toast.info("Sheet read in 3 seconds")}>Info</Button>
          <Button variant="secondary" onClick={() => toast.warning("Three lines need a match")}>Warning</Button>
          <Button variant="secondary" onClick={() => toast.error("Couldn't save. Your draft is kept.")}>Error</Button>
        </div>
      </LabSection>
    </div>
  );
}
