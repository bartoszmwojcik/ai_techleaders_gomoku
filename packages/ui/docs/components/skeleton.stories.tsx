import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Szkielet ładowania",
  component: SkeletonRegion,
  args: {
    label: "Ładowanie listy partii",
    children: (
      <>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-1/2" />
      </>
    ),
  },
} satisfies Meta<typeof SkeletonRegion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WierszeListy: Story = {
  render: (args) => (
    <SkeletonRegion {...args} className="max-w-xl gap-stack">
      {[0, 1, 2].map((row) => (
        <div className="flex items-center justify-between gap-stack" key={row}>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-target w-24" />
        </div>
      ))}
    </SkeletonRegion>
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <SkeletonRegion {...args} />
    </Narrow>
  ),
};

export const JednoOgloszenieDlaCzytnika: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("status");
    await expect(region).toHaveAttribute("aria-busy", "true");
    await expect(region).toHaveTextContent("Ładowanie listy partii");
  },
};
