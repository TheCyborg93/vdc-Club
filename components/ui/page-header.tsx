import type { ReactNode } from "react";
import { css } from "styled-system/css";

const root = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  alignItems: { base: "stretch", md: "end" },
  justifyContent: "space-between",
  gap: "4",
});

const copy = css({ minW: "0" });
const eyebrow = css({
  color: "brand.hover",
  fontSize: "[9px]",
  fontWeight: "900",
  letterSpacing: "0.13em",
  textTransform: "uppercase",
});
const title = css({
  mt: "1.5",
  color: "fg",
  fontSize: { base: "[30px]", md: "[38px]" },
  fontWeight: "950",
  letterSpacing: "-0.045em",
  lineHeight: "1.05",
});
const description = css({
  maxW: "[720px]",
  mt: "2",
  color: "fg.muted",
  fontSize: "sm",
  lineHeight: "1.6",
});
const actions = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });

export function VdcPageHeader({
  eyebrow: eyebrowText,
  title: titleText,
  description: descriptionText,
  actions: actionContent,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={root}>
      <div className={copy}>
        {eyebrowText && <span className={eyebrow}>{eyebrowText}</span>}
        <h1 className={title}>{titleText}</h1>
        {descriptionText && <p className={description}>{descriptionText}</p>}
      </div>
      {actionContent && <div className={actions}>{actionContent}</div>}
    </header>
  );
}
