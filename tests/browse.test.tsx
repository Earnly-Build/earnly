// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Opportunity } from "@/lib/types";
import { Browse } from "@/components/Browse";

const fixtures = vi.hoisted(() => {
  const opportunities: Opportunity[] = [
    { id: "alpha", title: "Alpha website", category: "Web Development", mode: "Remote", amount: 20, match: 99, age: 4 },
    { id: "bravo", title: "Bravo design", category: "Design", mode: "Local", amount: 40, match: 92, age: 2 },
    { id: "charlie", title: "Charlie design", category: "Design", mode: "Remote", amount: 80, match: 85, age: 6 },
    { id: "delta", title: "Delta writing", category: "Writing", mode: "Hybrid", amount: 120, match: 78, age: 1 },
    { id: "echo", title: "Echo website", category: "Web Development", mode: "On campus", amount: 30, match: 71, age: 3 },
    { id: "foxtrot", title: "Foxtrot design", category: "Design", mode: "Local", amount: 60, match: 64, age: 0 },
    { id: "golf", title: "Golf writing", category: "Writing", mode: "Remote", amount: 150, match: 57, age: 5 },
    { id: "hotel", title: "Hotel design", category: "Design", mode: "Hybrid", amount: 10, match: 50, age: 7 },
  ].map((listing) => ({
    id: listing.id,
    title: listing.title,
    category: listing.category as Opportunity["category"],
    mode: listing.mode as Opportunity["mode"],
    kind: "task",
    org: "Synthetic campus group",
    orgKind: "University",
    summary: `Synthetic ${listing.title} opportunity`,
    description: "Local component-test fixture only.",
    pay: { amount: listing.amount, unit: "fixed" },
    location: "Synthetic campus",
    skills: ["Testing"],
    postedDaysAgo: listing.age,
    deadlineDays: 10,
    match: listing.match,
    matchReasons: ["Synthetic match"],
  }));

  return {
    opportunities,
    app: {
      saved: ["alpha", "charlie", "hotel"],
      applications: [],
      toggleSaved: vi.fn(),
    },
  };
});

vi.mock("@/lib/data", () => ({
  CATEGORIES: ["Web Development", "Design", "Writing"],
  OPPORTUNITIES: fixtures.opportunities,
}));

vi.mock("@/lib/store", () => ({ useApp: () => fixtures.app }));

afterEach(cleanup);

function renderBrowse() {
  render(<Browse kind="task" title="Synthetic tasks" intro="Browse local test listings." />);
}

function listingTitles() {
  return screen.queryAllByRole("heading", { level: 3 })
    .filter((heading) => heading.closest('a[href^="/app/tasks/"]'))
    .map((heading) => heading.textContent);
}

// Mode and category both have an "All" button. Scope to their respective
// control rows rather than accidentally exercising the first matching name.
function modeControls() {
  return within(screen.getByRole("button", { name: "Remote" }).parentElement!);
}

function categoryControls() {
  return within(screen.getByRole("button", { name: "Design" }).parentElement!);
}

function allChoice(controls: ReturnType<typeof within>, name: string) {
  return controls.queryByRole("button", { name })
    ?? controls.getByRole("button", { name: "All" });
}

function payChoice(amount: number) {
  const label = amount === 0 ? "Any" : `${amount}+`;
  const name = amount === 0 ? "Any minimum pay" : `Minimum pay ${label}`;
  return screen.queryByRole("button", { name })
    ?? screen.getByRole("button", { name: label });
}

const firstPage = [
  "Alpha website", "Bravo design", "Charlie design", "Delta writing", "Echo website", "Foxtrot design",
];

describe("Browse filter behavior", () => {
  it("distinguishes the ambiguous All, Any and pay choices by accessible name", () => {
    renderBrowse();
    for (const name of [
      "All work modes", "All categories", "Any minimum pay",
      "Minimum pay 25+", "Minimum pay 50+", "Minimum pay 100+",
    ]) {
      expect(screen.getByRole("button", { name })).toBeDefined();
    }
  });

  it("keeps the mode's pressed state consistent with listings when switching and returning to All", () => {
    renderBrowse();
    const modes = modeControls();
    const all = allChoice(modes, "All work modes");
    const remote = modes.getByRole("button", { name: "Remote" });
    const local = modes.getByRole("button", { name: "Local" });

    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(remote.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(remote);
    expect(listingTitles()).toEqual(["Alpha website", "Charlie design", "Golf writing"]);
    expect(remote.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(local);
    expect(listingTitles()).toEqual(["Bravo design", "Foxtrot design"]);
    expect(local.getAttribute("aria-pressed")).toBe("true");
    expect(remote.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(all);
    expect(listingTitles()).toEqual(firstPage);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(local.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the category's independent All choice and pressed states in sync with its results", () => {
    renderBrowse();
    const categories = categoryControls();
    const all = allChoice(categories, "All categories");
    const design = categories.getByRole("button", { name: "Design" });
    const writing = categories.getByRole("button", { name: "Writing" });

    fireEvent.click(design);
    expect(listingTitles()).toEqual(["Bravo design", "Charlie design", "Foxtrot design", "Hotel design"]);
    expect(design.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(allChoice(modeControls(), "All work modes").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(writing);
    expect(listingTitles()).toEqual(["Delta writing", "Golf writing"]);
    expect(writing.getAttribute("aria-pressed")).toBe("true");
    expect(design.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(all);
    expect(listingTitles()).toEqual(firstPage);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(writing.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches minimum-pay choices and restores Any without stale pressed states or results", () => {
    renderBrowse();
    const any = payChoice(0);
    const fifty = payChoice(50);
    const hundred = payChoice(100);

    fireEvent.click(hundred);
    expect(listingTitles()).toEqual(["Delta writing", "Golf writing"]);
    expect(hundred.getAttribute("aria-pressed")).toBe("true");
    expect(any.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(fifty);
    expect(listingTitles()).toEqual(["Charlie design", "Delta writing", "Foxtrot design", "Golf writing"]);
    expect(fifty.getAttribute("aria-pressed")).toBe("true");
    expect(hundred.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(any);
    expect(listingTitles()).toEqual(firstPage);
    expect(any.getAttribute("aria-pressed")).toBe("true");
    expect(fifty.getAttribute("aria-pressed")).toBe("false");
  });

  it("clears search, category, mode, pay, saved-only and sorting so the default listings return", () => {
    renderBrowse();
    const search = screen.getByPlaceholderText("Search by role, skill or who posted it") as HTMLInputElement;
    const sort = screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement;
    const saved = screen.getByRole("button", { name: "Saved" });

    fireEvent.change(sort, { target: { value: "newest" } });
    fireEvent.click(saved);
    expect(listingTitles()).toEqual(["Alpha website", "Charlie design", "Hotel design"]);
    fireEvent.change(search, { target: { value: "no fixture matches this" } });
    fireEvent.click(categoryControls().getByRole("button", { name: "Design" }));
    fireEvent.click(modeControls().getByRole("button", { name: "Local" }));
    fireEvent.click(payChoice(100));
    expect(screen.getByText("Nothing matches those filters", { exact: true })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect.soft(search.value).toBe("");
    expect.soft(sort.value).toBe("match");
    expect.soft(saved.getAttribute("aria-pressed")).toBe("false");
    expect.soft(allChoice(modeControls(), "All work modes").getAttribute("aria-pressed")).toBe("true");
    expect.soft(allChoice(categoryControls(), "All categories").getAttribute("aria-pressed")).toBe("true");
    expect.soft(payChoice(0).getAttribute("aria-pressed")).toBe("true");
    expect(listingTitles()).toEqual(firstPage);
  });

  it("restores the first page after Show more and a no-results filter are cleared", () => {
    renderBrowse();
    fireEvent.click(screen.getByRole("button", { name: "Show more (2 left)" }));
    expect(listingTitles()).toEqual([...firstPage, "Golf writing", "Hotel design"]);

    // These chip changes do not use the search input, so an unrelated search
    // handler cannot accidentally reset the expanded page for Clear filters.
    fireEvent.click(modeControls().getByRole("button", { name: "Local" }));
    fireEvent.click(categoryControls().getByRole("button", { name: "Writing" }));
    expect(listingTitles()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(listingTitles()).toEqual(firstPage);
    fireEvent.click(screen.getByRole("button", { name: "Show more (2 left)" }));
    expect(listingTitles()).toEqual([...firstPage, "Golf writing", "Hotel design"]);
  });
});
