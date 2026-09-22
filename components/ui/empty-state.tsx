import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { css } from "styled-system/css";

const root = css({
  display: "grid",
  placeItems: "center",
  minH: "[160px]",
  p: "5",
  textAlign: "center",
  border: "1px dashed",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.bg",
});
const icon = css({
  display: "grid",
  placeItems: "center",
  w: "10",
  h: "10",
  mb: "3",
  borderRadius: "pill",
  background: "surface.raised",
  color: "fg.muted",
});
const title = css({ fontSize: "sm", fontWeight: "850" });
const copy = css({ mt: "1", color: "fg.muted", fontSize: "xs", lineHeight: "1.5" });
const actions = css({ display: "flex", justifyContent: "center", gap: "2", mt: "3", flexWrap: "wrap" });

export function VdcEmptyState({
  title: titleText,
  description,
  actions: actionContent,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={root}>
      <div>
        <span className={icon}><Inbox size={18} /></span>
        <strong className={title}>{titleText}</strong>
        {description && <p className={copy}>{description}</p>}
        {actionContent && <div className={actions}>{actionContent}</div>}
      </div>
    </div>
  );
}
