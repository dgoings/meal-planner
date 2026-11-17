import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("uses the trimmed name when there is one", () => {
    expect(displayName({ name: " Ana ", email: "a@b.co" })).toBe("Ana");
  });

  it("falls back to the part of the email before the @", () => {
    expect(displayName({ name: "", email: "ana.lopez@example.com" })).toBe("ana.lopez");
    expect(displayName({ name: "   ", email: "ana.lopez@example.com" })).toBe("ana.lopez");
    expect(displayName({ email: "cook@example.com" })).toBe("cook");
  });

  it("greets an unknown user generically", () => {
    expect(displayName(null)).toBe("there");
    expect(displayName(undefined)).toBe("there");
    expect(displayName({})).toBe("there");
    expect(displayName({ email: "@example.com" })).toBe("there");
  });
});
