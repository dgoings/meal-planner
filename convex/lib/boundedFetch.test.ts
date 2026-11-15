import { describe, expect, it } from "vitest";
import { readBodyWithLimit } from "./boundedFetch";

function streamed(chunks: number[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size));
        controller.close();
      },
    }),
  );
}

describe("bounded body reads", () => {
  it("returns the whole body when it fits", async () => {
    expect((await readBodyWithLimit(streamed([3, 4]), 10))?.byteLength).toBe(7);
    expect((await readBodyWithLimit(new Response(null), 10))?.byteLength).toBe(0);
  });

  it("stops at the limit whether or not a length was announced", async () => {
    expect(await readBodyWithLimit(streamed([6, 6]), 10)).toBeNull();
    expect(
      await readBodyWithLimit(
        new Response("ok", { headers: { "content-length": "999" } }),
        10,
      ),
    ).toBeNull();
  });
});
