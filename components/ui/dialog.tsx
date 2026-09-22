"use client";

import { Dialog } from "@ark-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { VdcButton } from "@/components/ui/button";

const backdrop = css({
  position: "fixed",
  inset: "0",
  background: "rgba(0,0,0,.72)",
  backdropFilter: "blur(4px)",
  zIndex: "overlay",
});

const positioner = css({
  position: "fixed",
  inset: "0",
  zIndex: "modal",
  display: "grid",
  placeItems: { base: "end stretch", md: "center" },
  p: { base: "0", md: "4" },
});

const content = css({
  width: "full",
  maxW: { base: "full", md: "640px" },
  maxH: { base: "92dvh", md: "min(82dvh, 760px)" },
  overflow: "auto",
  background: "surface.raised",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: { base: "l4 l4 0 0", md: "l4" },
  boxShadow: "lg",
  outline: "none",
});

const header = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: "4",
  p: "4",
  borderBottom: "1px solid",
  borderColor: "surface.border",
});

const title = css({ fontSize: "lg", fontWeight: "900", color: "fg" });
const description = css({ mt: "1", fontSize: "sm", color: "fg.muted", lineHeight: "1.5" });
const body = css({ p: "4" });

export function VdcDialog({
  trigger,
  title: titleText,
  description: descriptionText,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root lazyMount unmountOnExit>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Backdrop className={backdrop} />
      <Dialog.Positioner className={positioner}>
        <Dialog.Content className={content}>
          <div className={header}>
            <div>
              <Dialog.Title className={title}>{titleText}</Dialog.Title>
              {descriptionText && (
                <Dialog.Description className={description}>{descriptionText}</Dialog.Description>
              )}
            </div>
            <Dialog.CloseTrigger asChild>
              <VdcButton visual="ghost" size="sm" aria-label="Dialog schließen">
                <X size={17} />
              </VdcButton>
            </Dialog.CloseTrigger>
          </div>
          <div className={body}>{children}</div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
