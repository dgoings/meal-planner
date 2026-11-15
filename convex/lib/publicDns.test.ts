import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { assertPublicResolution, isPublicAddress } from "./publicDns";

describe("public DNS resolution", () => {
  it("separates public addresses from loopback, private, and metadata ranges", () => {
    expect(isPublicAddress("93.184.216.34", 4)).toBe(true);
    expect(isPublicAddress("2606:2800:220:1:248:1893:25c8:1946", 6)).toBe(true);
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0"]) {
      expect(isPublicAddress(address, 4)).toBe(false);
    }
    for (const address of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(address, 6)).toBe(false);
    }
  });

  it("rejects names that resolve to a private address or do not resolve", async () => {
    await expect(assertPublicResolution("example.com")).resolves.toBeUndefined();

    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(assertPublicResolution("rebind.example.com")).rejects.toThrow(
      /public address/,
    );

    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertPublicResolution("missing.example.com")).rejects.toThrow(
      /Could not resolve/,
    );
  });
});
