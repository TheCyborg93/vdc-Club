import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { VdcCard } from "@/components/ui/card";

const label = css({ color: "fg.muted", fontSize: "xs", fontWeight: "750" });
const value = css({ mt: "1.5", color: "fg", fontSize: "[28px]", fontWeight: "950", lineHeight: "1.05" });
const note = css({ mt: "1.5", color: "fg.subtle", fontSize: "[10px]", lineHeight: "1.4" });

export function VdcStat({
  label: labelText,
  value: valueText,
  note: noteText,
  accent,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  accent?: "brand" | "danger";
}) {
  return (
    <VdcCard tone={accent === "brand" ? "brand" : accent === "danger" ? "danger" : "default"} padding="md">
      <span className={label}>{labelText}</span>
      <strong className={value}>{valueText}</strong>
      {noteText && <small className={note}>{noteText}</small>}
    </VdcCard>
  );
}

export const vdcStatGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: "repeat(4,minmax(0,1fr))" },
  gap: "3",
});
