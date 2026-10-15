// @vitest-environment jsdom
// Component test for the boundary — same env convention as modal-focus.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlobalError from "@/app/error";
import NotFound from "@/app/not-found";

/**
 * Issue #26 — no error.tsx existed: a thrown render error hit Next's
 * bare default page. The boundary renders the app's own EmptyState with
 * a working retry.
 */
afterEach(cleanup);

describe("error.tsx — the designed boundary", () => {
  it("renders the app's visual system + a retry button", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    expect(screen.getByText(/Something broke on this page/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("not-found.tsx — the designed 404", () => {
  it("renders the EmptyState + a way home", () => {
    render(<NotFound />);
    expect(screen.getByText(/does not exist/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to earnly/i })).toBeTruthy();
  });
});
