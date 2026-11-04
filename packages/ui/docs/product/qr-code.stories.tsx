import { Panel } from "@gomoku/ui/game/panel";
import { QrCode } from "@gomoku/ui/game/qr-code";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Narrow } from "../../.storybook/blocks";
import { SAMPLE_QR } from "./qr-sample";

const meta = {
  title: "Produkt/Partia/Kod QR",
  component: QrCode,
  args: {
    src: SAMPLE_QR,
    label: "Kod QR z linkiem do oglądania partii",
    caption: "Zeskanuj telefonem, żeby oglądać tę partię.",
  },
} satisfies Meta<typeof QrCode>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const BezPodpisu: Story = { args: { caption: undefined } };

export const WPaneluNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Panel title="Pokaż partię innym">
        <QrCode {...args} />
      </Panel>
    </Narrow>
  ),
};
