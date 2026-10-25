import type { Meta, StoryObj } from "@storybook/react-vite";

import { ColorTable, ContrastTable, IconSizes, MotionDemo, ShapeDemo, SpaceTable, ThemePreview, TypeSpecimen } from "../../.storybook/blocks";

// Renders the documentation blocks as stories so the accessibility checks run on them in both themes.
const meta = {
  title: "Fundamenty/Kontrola tokenów",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Kolor: Story = { render: () => <ColorTable /> };
export const Kontrast: Story = { render: () => <ContrastTable /> };
export const Typografia: Story = { render: () => <TypeSpecimen /> };
export const Odstepy: Story = { render: () => <SpaceTable /> };
export const KsztaltIGlebia: Story = { render: () => <ShapeDemo /> };
export const Ruch: Story = { render: () => <MotionDemo /> };
export const Ikony: Story = { render: () => <IconSizes /> };
export const Motywy: Story = { render: () => <ThemePreview /> };
