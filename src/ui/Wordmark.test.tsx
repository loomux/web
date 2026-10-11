import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WORDMARK, WORDMARK_SMALL } from "./brandPaths";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("is named Loomux for assistive tech", () => {
    render(<Wordmark height={30} />);
    expect(screen.getByRole("img", { name: "Loomux" })).toBeInTheDocument();
  });

  it("uses the small cut, without the tie, below 24 px tall", () => {
    const { rerender } = render(<Wordmark height={22} />);
    expect(screen.getByRole("img").getAttribute("viewBox")).toBe(WORDMARK_SMALL.viewBox);
    rerender(<Wordmark height={24} />);
    expect(screen.getByRole("img").getAttribute("viewBox")).toBe(WORDMARK.viewBox);
  });

  it("keeps the wordmark's proportions", () => {
    render(<Wordmark height={34} />);
    expect(Number(screen.getByRole("img").getAttribute("width"))).toBeCloseTo((34 * WORDMARK.width) / WORDMARK.height);
  });
});
