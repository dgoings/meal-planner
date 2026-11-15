import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Backend fetch helpers resolve hostnames before connecting; tests must not
// depend on real DNS.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

afterEach(() => cleanup());
