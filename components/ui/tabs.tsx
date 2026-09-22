"use client";

import { Tabs } from "@ark-ui/react/tabs";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

const list = css({
  display: "grid",
  gridAutoFlow: { base: "row", sm: "column" },
  gridAutoColumns: { sm: "minmax(0,1fr)" },
  gap: "1",
  p: "1",
  background: "surface.bg",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
});

const trigger = css({
  minH: "9",
  px: "3",
  borderRadius: "l1",
  color: "fg.muted",
  fontSize: "sm",
  fontWeight: "800",
  cursor: "pointer",
  transitionDuration: "normal",
  transitionProperty: "background, color",
  _selected: {
    background: "brand.subtle",
    color: "brand.hover",
  },
  _focusVisible: { boxShadow: "focus", outline: "none" },
});

const content = css({ pt: "4", outline: "none" });

export function VdcTabs({
  defaultValue,
  items,
}: {
  defaultValue: string;
  items: Array<{ value: string; label: string; content: ReactNode }>;
}) {
  return (
    <Tabs.Root defaultValue={defaultValue}>
      <Tabs.List className={list}>
        {items.map((item) => (
          <Tabs.Trigger className={trigger} key={item.value} value={item.value}>
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {items.map((item) => (
        <Tabs.Content className={content} key={item.value} value={item.value}>
          {item.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
