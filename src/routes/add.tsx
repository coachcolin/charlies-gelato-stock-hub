import { createFileRoute } from "@tanstack/react-router";

import { MovementScreen } from "@/components/MovementScreen";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Add Stock — Charlie's Gelato" },
      {
        name: "description",
        content: "Log gelato trays produced and put into the freezers at Charlie's Gelato.",
      },
      { property: "og:title", content: "Add Stock — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Log gelato trays produced and put into the freezers.",
      },
    ],
  }),
  component: () => (
    <MovementScreen
      title="Add Stock"
      subtitle="Trays produced and put in the freezer"
      kind="addition"
      sign={1}
      confirmLabel="Confirm additions"
    />
  ),
});
