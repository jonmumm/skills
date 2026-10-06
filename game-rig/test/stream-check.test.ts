import { expect, test } from "vitest";
import { receiverUrl, tvUrlFromJoin } from "../src/stream-check.ts";

test("the TV URL comes from the host redirect's join link: /join/CODE?tv=TOKEN → /tv/CODE?t=TOKEN&stream=1", () => {
  expect(tvUrlFromJoin("https://game.example", new URL("https://game.example/join/ABCD?tv=uuid-1"))).toBe("https://game.example/tv/ABCD?t=uuid-1&stream=1");
});
test("a join link without a TV token is an error, not a TV that never connects", () => {
  expect(() => tvUrlFromJoin("https://g", new URL("https://g/join/ABCD"))).toThrow(/tv token/);
});
test("receiver URL carries the stream server and the view", () => {
  const u = new URL(receiverUrl("/tmp/receiver.html", "https://api/stream", "https://g/tv/A?t=1&stream=1"));
  expect(u.protocol).toBe("file:");
  expect(u.searchParams.get("streamServerUrl")).toBe("https://api/stream");
  expect(u.searchParams.get("viewUrl")).toBe("https://g/tv/A?t=1&stream=1");
});
