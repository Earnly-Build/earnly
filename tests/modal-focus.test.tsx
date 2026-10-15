// @vitest-environment jsdom
// ^ the suite is env:node; this file needs a DOM — per-file env comment,
//   documented in the PR per the issue's instruction.
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@/components/ui";

/**
 * Issue #14 — focus was never moved into the dialog, Tab escaped into
 * the page behind the overlay, nothing restored on close, and the
 * backdrop was a stray tab stop.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="behind">behind-the-modal button</button>
      <button data-testid="trigger" onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Test dialog">
        <input data-testid="first" placeholder="first field" />
        <button data-testid="inside">inside</button>
      </Modal>
    </div>
  );
}

afterEach(cleanup);

describe("Modal focus management", () => {
  it("opens with focus inside, traps Tab, restores on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByTestId("trigger");
    await user.click(trigger);                          // open
    expect(await screen.findByRole("dialog")).toBeTruthy();
    // focus moved into the dialog — the first focusable child
    expect(document.activeElement).toBe(screen.getByTestId("first"));

    // Tab cycles INSIDE: input → button → (wraps) input
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId("inside"));
    await user.tab();                                   // wraps to first
    expect(document.activeElement).toBe(screen.getByTestId("first"));
    await user.tab({ shift: true });                    // Shift+Tab wraps back
    expect(document.activeElement).toBe(screen.getByTestId("inside"));

    await user.keyboard("{Escape}");                    // close
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);       // focus restored
  });

  it("backdrop is not a tab stop", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("trigger"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    const backdrop = screen.getByLabelText("Close");
    expect(backdrop.getAttribute("tabindex")).toBe("-1");
  });
});
