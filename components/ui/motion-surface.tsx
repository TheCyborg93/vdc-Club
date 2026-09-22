"use client";

import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { css } from "styled-system/css";

const surface = css({
  willChange: "transform, opacity",
});

export function MotionSurface(props: ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      className={[surface, props.className].filter(Boolean).join(" ")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      {...props}
    />
  );
}
