"use client";

import { Dialog } from "@ark-ui/react/dialog";
import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";
import { css } from "styled-system/css";
import { VdcButton, VdcInput } from "@/components/ui";

const backdrop = css({
  position: "fixed",
  inset: "0",
  zIndex: "overlay",
  background: "rgba(0,0,0,.72)",
  backdropFilter: "blur(4px)",
});

const positioner = css({
  position: "fixed",
  inset: "0",
  zIndex: "modal",
  display: "grid",
  placeItems: { base: "end stretch", md: "center" },
  p: { base: "0", md: "4" },
});

const contentStyle = css({
  width: "full",
  maxW: { md: "520px" },
  p: "4",
  border: "1px solid",
  borderColor: "rgba(228,121,114,.24)",
  borderRadius: { base: "l4 l4 0 0", md: "l4" },
  background: "surface.raised",
  boxShadow: "lg",
  outline: "none",
});

const icon = css({
  display: "grid",
  placeItems: "center",
  w: "10",
  h: "10",
  mb: "3",
  borderRadius: "pill",
  background: "rgba(228,121,114,.10)",
  color: "status.danger",
});

const title = css({ fontSize: "lg", fontWeight: "900" });
const description = css({ mt: "2", color: "fg.muted", fontSize: "sm", lineHeight: "1.55", whiteSpace: "pre-line" });
const confirmField = css({ display: "grid", gap: "1.5", mt: "3", color: "fg.muted", fontSize: "xs" });
const actions = css({ display: "flex", flexDirection: { base: "column-reverse", sm: "row" }, justifyContent: "flex-end", gap: "2", mt: "4" });

export function ConfirmSubmitButton({
  children,
  message,
  className,
  requireText,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  requireText?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const canConfirm = !requireText || typed === requireText;

  function submitForm() {
    triggerRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <Dialog.Root role="alertdialog" lazyMount unmountOnExit>
      <Dialog.Trigger asChild>
        <VdcButton
          ref={triggerRef}
          type="button"
          visual="danger"
          size="sm"
          className={className}
        >
          {children}
        </VdcButton>
      </Dialog.Trigger>

      <Dialog.Backdrop className={backdrop} />
      <Dialog.Positioner className={positioner}>
        <Dialog.Content className={contentStyle}>
          <span className={icon}><AlertTriangle size={19} /></span>
          <Dialog.Title className={title}>Aktion bestätigen</Dialog.Title>
          <Dialog.Description className={description}>{message}</Dialog.Description>

          {requireText && (
            <label className={confirmField}>
              Zum Bestätigen „{requireText}“ eingeben
              <VdcInput
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                autoComplete="off"
              />
            </label>
          )}

          <div className={actions}>
            <Dialog.CloseTrigger asChild>
              <VdcButton type="button" visual="outline">Abbrechen</VdcButton>
            </Dialog.CloseTrigger>
            <Dialog.CloseTrigger asChild>
              <VdcButton
                type="button"
                visual="danger"
                disabled={!canConfirm}
                onClick={submitForm}
              >
                Bestätigen
              </VdcButton>
            </Dialog.CloseTrigger>
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
