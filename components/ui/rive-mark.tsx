"use client";

import { useRive } from "@rive-app/react-canvas";
import { useReducedMotion } from "motion/react";
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
  const reducedMotion = useReducedMotion();
  const { RiveComponent } = useRive({
    src,
    stateMachines,
    autoplay: reducedMotion ? false : autoplay,
    automaticallyHandleEvents: true,
  });

  return <RiveComponent className={frame} />;
}
