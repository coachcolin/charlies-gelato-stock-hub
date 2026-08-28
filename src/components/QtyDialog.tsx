import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function QtyDialog({
  open,
  title,
  description,
  initial = 1,
  confirmLabel = "Add",
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  initial?: number;
  confirmLabel?: string;
  onConfirm: (qty: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [qty, setQty] = useState(initial);

  useEffect(() => {
    if (open) setQty(initial);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </DialogHeader>

        <div className="flex items-center justify-center gap-4 py-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-14 rounded-full"
            aria-label="Decrease"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Minus className="size-6" />
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className="h-20 w-28 rounded-2xl text-center font-display text-4xl"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-14 rounded-full"
            aria-label="Increase"
            onClick={() => setQty((q) => q + 1)}
          >
            <Plus className="size-6" />
          </Button>
        </div>

        <div className="flex justify-center gap-2">
          {[1, 2, 5, 10].map((n) => (
            <Button
              key={n}
              type="button"
              variant="secondary"
              className="h-10 min-w-14 rounded-full"
              onClick={() => setQty(n)}
            >
              {n}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="h-14 w-full rounded-2xl text-base"
            onClick={() => onConfirm(qty)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
