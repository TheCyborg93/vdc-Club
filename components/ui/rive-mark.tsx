"use client";

import { useRive } from "@rive-app/react-canvas";
import { css } from "styled-system/css";

const frame = css({
  width: "full",
  height: "full",
  minH: "120px",
  overflow: "hidden",
});

export function VdcRiveMark({
  src,
  stateMachines,
  autoplay = true,
}: {
  src: string;
  stateMachines?: string | string[];
  autoplay?: boolean;
}) {
  const { RiveComponent } = useRive({
    src,
    stateMachines,
    autoplay,
    automaticallyHandleEvents: true,
  });

  return <RiveComponent className={frame} />;
}
