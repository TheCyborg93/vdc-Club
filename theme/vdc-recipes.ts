import { defineRecipe } from "@pandacss/dev";

export const button = defineRecipe({
  className: "vdc-button",
  base: {
    alignItems: "center",
    borderRadius: "l1",
    cursor: "pointer",
    display: "inline-flex",
    fontWeight: "850",
    gap: "2",
    justifyContent: "center",
    lineHeight: "1",
    outline: "none",
    transitionDuration: "normal",
    transitionProperty: "background, border-color, color, transform, box-shadow",
    transitionTimingFunction: "standard",
    _focusVisible: { boxShadow: "focus" },
    _disabled: { cursor: "not-allowed", opacity: 0.45 },
  },
  variants: {
    visual: {
      solid: {
        background: "brand.solid",
        borderColor: "brand.solid",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "warmWhite",
        boxShadow: "sm",
        _hover: { background: "brand.hover", transform: "translateY(-1px)" },
      },
      outline: {
        background: "surface.raised",
        borderColor: "surface.border",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "fg",
        _hover: { background: "surface.hover", borderColor: "brand.border" },
      },
      ghost: {
        background: "transparent",
        borderColor: "transparent",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "fg.muted",
        _hover: { background: "surface.hover", color: "fg" },
      },
      danger: {
        background: "rgba(228,121,114,.10)",
        borderColor: "rgba(228,121,114,.22)",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "status.danger",
        _hover: { background: "rgba(228,121,114,.16)" },
      },
    },
    size: {
      sm: { fontSize: "xs", h: "8", px: "3" },
      md: { fontSize: "sm", h: "10", px: "4" },
      lg: { fontSize: "md", h: "12", px: "5" },
    },
    fullWidth: {
      true: { width: "full" },
    },
  },
  defaultVariants: { visual: "solid", size: "md" },
});

export const card = defineRecipe({
  className: "vdc-card",
  base: {
    background: "surface.bg",
    borderColor: "surface.border",
    borderRadius: "l3",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "xs",
  },
  variants: {
    tone: {
      default: {},
      raised: { background: "surface.raised", boxShadow: "sm" },
      brand: { background: "brand.subtle", borderColor: "brand.border" },
      danger: { background: "rgba(228,121,114,.05)", borderColor: "rgba(228,121,114,.22)" },
    },
    padding: {
      none: { p: "0" },
      sm: { p: "3" },
      md: { p: "4" },
      lg: { p: "5" },
    },
  },
  defaultVariants: { tone: "default", padding: "md" },
});

export const badge = defineRecipe({
  className: "vdc-badge",
  base: {
    alignItems: "center",
    borderRadius: "pill",
    display: "inline-flex",
    fontSize: "xs",
    fontWeight: "800",
    gap: "1.5",
    lineHeight: "1",
    px: "2.5",
    py: "1.5",
    width: "fit-content",
  },
  variants: {
    tone: {
      neutral: { background: "surface.hover", color: "fg.muted" },
      brand: { background: "brand.subtle", color: "brand.hover" },
      success: { background: "rgba(143,198,162,.10)", color: "status.success" },
      warning: { background: "rgba(228,191,112,.10)", color: "status.warning" },
      danger: { background: "rgba(228,121,114,.10)", color: "status.danger" },
      info: { background: "rgba(134,188,232,.10)", color: "status.info" },
    },
  },
  defaultVariants: { tone: "neutral" },
});

export const input = defineRecipe({
  className: "vdc-input",
  base: {
    background: "surface.bg",
    borderColor: "surface.border",
    borderRadius: "l1",
    borderStyle: "solid",
    borderWidth: "1px",
    color: "fg",
    fontSize: "sm",
    h: "10",
    outline: "none",
    px: "3",
    transitionDuration: "normal",
    transitionProperty: "border-color, box-shadow, background",
    _placeholder: { color: "fg.subtle" },
    _focus: { borderColor: "brand.solid", boxShadow: "focus" },
    _disabled: { cursor: "not-allowed", opacity: 0.5 },
  },
});
