import { createFileRoute } from "@tanstack/react-router";

import { MovementScreen } from "@/components/MovementScreen";

export const Route = createFileRoute("/remove")({
  head: () => ({
    meta: [
      { title: "Remove Stock — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Quickly log gelato trays taken out of the freezers for the display cabinet at Charlie's Gelato.",
      },
      { property: "og:title", content: "Remove Stock — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Log gelato trays taken out of the freezers for the display cabinet.",
      },
    ],
  }),
  component: () => (
    <MovementScreen
      title="Remove Stock"
      subtitle="Trays out to the display cabinet"
      kind="removal"
      sign={-1}
      confirmLabel="Confirm removals"
    />
  ),
});
