import { ark } from "@ark-ui/react/factory";
import type { ComponentProps } from "react";
import { styled } from "styled-system/jsx";
import { input } from "styled-system/recipes";

export const VdcInput = styled(ark.input, input);
export type VdcInputProps = ComponentProps<typeof VdcInput>;
