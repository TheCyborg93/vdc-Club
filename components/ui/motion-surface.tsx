"use client";

import type { ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import { css } from "styled-system/css";

const surface = css({
  willChange: "transform, opacity",
});

export function MotionSurface(props: ComponentProps<typeof motion.div>) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={[surface, props.className].filter(Boolean).join(" ")}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={reducedMotion ? undefined : { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      {...props}
    />
  );
}
