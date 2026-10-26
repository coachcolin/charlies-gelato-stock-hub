import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  Database,
  FileSpreadsheet,
  IceCreamCone,
  Minus,
  PencilRuler,
  Plus,
  Snowflake,
} from "lucide-react";

import logo from "@/assets/charlies-logo.png";
import { fetchFlavours, fetchFreezers, fetchOrders } from "@/lib/gelato";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Charlie's Gelato — Freezer Stock Manager" },
      {
        name: "description",
        content:
          "Log gelato trays in and out of the freezers, import wholesale orders and generate the weekly production report for Charlie's Gelato.",
      },
      { property: "og:title", content: "Charlie's Gelato — Freezer Stock Manager" },
      {
        property: "og:description",
        content:
          "Track freezer stock, wholesale orders and weekly production for Charlie's Gelato in Matakana.",
      },
    ],
  }),
  component: Home,
});

const TILES = [
  {
    to: "/remove",
    label: "Remove Stock",
    hint: "Trays out to the cabinet",
    icon: Minus,
    tone: "primary" as const,
  },
  {
    to: "/add",
    label: "Add Stock",
    hint: "Trays made & put away",
    icon: Plus,
    tone: "sky" as const,
  },
  {
    to: "/soft-freezer",
    label: "Soft Freezer Order",
    hint: "Top up the display freezers",
    icon: IceCreamCone,
    tone: "cream" as const,
  },
  {
    to: "/move",
    label: "Move Stock",
    hint: "Between freezers",
    icon: ArrowLeftRight,
    tone: "cream" as const,
  },
  {
    to: "/stock",
    label: "Current Stock Levels",
    hint: "What's in the freezers now",
    icon: Snowflake,
    tone: "cream" as const,
  },
  {
    to: "/production",
    label: "Production Report",
    hint: "What to make this week",
    icon: ClipboardList,
    tone: "cream" as const,
  },
  {
    to: "/wholesale",
    label: "Wholesale Orders",
    hint: "Import & complete orders",
    icon: FileSpreadsheet,
    tone: "cream" as const,
  },
  {
    to: "/reports",
    label: "Sales Reports",
    hint: "Where trays & tubs are going",
    icon: BarChart3,
    tone: "cream" as const,
  },
  {
    to: "/edit-stock",
    label: "Edit Stock Levels",
    hint: "Stock take & variances",
    icon: PencilRuler,
    tone: "cream" as const,
  },
  {
    to: "/data",
    label: "Data Management",
    hint: "Flavours, minimums & priorities",
    icon: Database,
    tone: "cream" as const,
  },
];

function Home() {
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const orders = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  const totalTrays = (flavours.data ?? []).reduce((s, f) => s + f.stock_qty, 0);
  const capacity = (freezers.data ?? []).reduce((s, f) => s + f.capacity_trays, 0);
  const activeOrders = (orders.data ?? []).filter((o) => o.status === "active").length;
  const used = (flavours.data ?? []).reduce((s, f) => s + f.stock_qty + (f.tub_qty ?? 0) / 5, 0);
  const fullness = capacity > 0 ? Math.round((used / capacity) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-6">
          <img
            src={logo}
            alt="Charlie's Gelato"
            className="size-16 rounded-full bg-card shadow-pop"
          />
          <div>
            <h1 className="font-display text-2xl leading-tight sm:text-3xl">Freezer Stock</h1>
            <p className="text-sm opacity-85">Charlie's Gelato · Matakana</p>
          </div>
        </div>
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-2 px-4 pb-5">
          <Stat label="Trays in stock" value={totalTrays} />
          <Stat label="Freezer full" value={`${fullness}%`} />
          <Stat label="Active orders" value={activeOrders} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">
        <div className="grid grid-cols-2 gap-3">
          {TILES.map((t, i) => (
            <Link
              key={t.to}
              to={t.to}
              className={[
                "surface flex min-h-32 flex-col justify-between p-4 transition-transform active:scale-[0.97]",
                i < 2 ? "col-span-1 min-h-40" : "",
                t.tone === "primary" ? "bg-primary text-primary-foreground" : "",
                t.tone === "sky" ? "bg-sky text-sky-foreground" : "",
              ].join(" ")}
            >
              <t.icon className="size-8" />
              <span>
                <span className="block font-display text-lg leading-tight">{t.label}</span>
                <span className="block text-xs opacity-75">{t.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-primary-foreground/12 px-3 py-2 text-center">
      <p className="font-display text-2xl leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
