import type { ReactNode } from "react";
import { css } from "styled-system/css";

const root = css({
  display: "flex",
  flexDirection: { base: "column", sm: "row" },
  alignItems: { base: "stretch", sm: "center" },
  justifyContent: "space-between",
  gap: "2",
  p: "2",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
});
const start = css({ display: "flex", gap: "2", flexWrap: "wrap", minW: "0" });
const end = css({ display: "flex", gap: "2", flexWrap: "wrap", justifyContent: { sm: "flex-end" } });

export function VdcActionBar({ start: startContent, end: endContent }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <div className={root}>
      <div className={start}>{startContent}</div>
      <div className={end}>{endContent}</div>
    </div>
  );
}
