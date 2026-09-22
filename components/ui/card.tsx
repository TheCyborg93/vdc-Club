import { ark } from "@ark-ui/react/factory";
import type { ComponentProps } from "react";
import { styled } from "styled-system/jsx";
import { card } from "styled-system/recipes";

export const VdcCard = styled(ark.div, card);
export type VdcCardProps = ComponentProps<typeof VdcCard>;
