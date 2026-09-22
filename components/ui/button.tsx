import { ark } from "@ark-ui/react/factory";
import type { ComponentProps } from "react";
import { styled } from "styled-system/jsx";
import { button } from "styled-system/recipes";

export const VdcButton = styled(ark.button, button);
export type VdcButtonProps = ComponentProps<typeof VdcButton>;
