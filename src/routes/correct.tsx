import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { MovementScreen } from "@/components/MovementScreen";

export const Route = createFileRoute("/correct")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Correct Stock — Charlie's Gelato" },
      { name: "description", content: "Fix stock mistakes at Charlie's Gelato without counting them as sales or production." },
      { property: "og:title", content: "Correct Stock — Charlie's Gelato" },
      { property: "og:description", content: "Fix stock mistakes without counting them as sales or production." },
    ],
  }),
  component: CorrectStock,
});

function CorrectStock() {
  const [dir, setDir] = useState<1 | -1>(-1);
  return (
    <div>
      <div className="mx-auto flex max-w-4xl gap-2 px-4 pt-3">
        {([[-1, "Take stock off"], [1, "Put stock back"]] as const).map(([s, label]) => (
          <button key={s} type="button" onClick={() => setDir(s)}
            className={`h-12 flex-1 rounded-2xl font-display text-base ${dir === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
      <MovementScreen
        key={dir}
        title="Correct Stock"
        subtitle={dir < 0 ? "Fix a mistake — not counted as a sale" : "Fix a mistake — not counted as production"}
        kind="adjustment"
        sign={dir}
        confirmLabel={dir < 0 ? "Confirm correction (take off)" : "Confirm correction (put back)"}
      />
    </div>
  );
}
