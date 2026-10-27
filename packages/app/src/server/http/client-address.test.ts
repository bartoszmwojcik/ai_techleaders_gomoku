import { describe, expect, it } from "vitest";

import { clientAddress, clientKey } from "./client-address";
import { hashOpaqueToken } from "./opaque-token";

const xff = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
} as const;

function headers(name: string, value: string) {
  return new Headers({ [name]: value });
}

describe("clientAddress", () => {
  it("returns undefined without the header", () => {
    expect(clientAddress(new Headers(), xff)).toBeUndefined();
  });

  it("takes the n-th entry from the right of x-forwarded-for", () => {
    const h = headers("x-forwarded-for", "6.6.6.6, 1.1.1.1 , 2.2.2.2");
    expect(clientAddress(h, xff)).toBe("2.2.2.2");
    expect(clientAddress(h, { ...xff, trustProxyHops: 2 })).toBe("1.1.1.1");
    expect(clientAddress(h, { ...xff, trustProxyHops: 3 })).toBe("6.6.6.6");
  });

  it("does not trust client-supplied entries to the left", () => {
    expect(
      clientAddress(headers("x-forwarded-for", "9.9.9.9, 2.2.2.2"), xff),
    ).toBe("2.2.2.2");
  });

  it("returns undefined with fewer entries than hops, or without hops configured", () => {
    const h = headers("x-forwarded-for", "2.2.2.2");
    expect(clientAddress(h, { ...xff, trustProxyHops: 2 })).toBeUndefined();
    expect(
      clientAddress(h, { ...xff, trustProxyHops: undefined }),
    ).toBeUndefined();
  });

  it("takes single-value headers as is", () => {
    for (const name of ["x-real-ip", "cf-connecting-ip"] as const) {
      const config = {
        ...xff,
        clientIpHeader: name,
        trustProxyHops: undefined,
      };
      expect(clientAddress(headers(name, " 3.3.3.3 "), config)).toBe("3.3.3.3");
    }
  });

  it("drops an IPv4 port and rejects garbage", () => {
    expect(clientAddress(headers("x-forwarded-for", "4.4.4.4:5555"), xff)).toBe(
      "4.4.4.4",
    );
    expect(
      clientAddress(headers("x-forwarded-for", "unknown"), xff),
    ).toBeUndefined();
    expect(
      clientAddress(headers("x-forwarded-for", "a:b:c"), xff),
    ).toBeUndefined();
    expect(clientAddress(headers("x-forwarded-for", ""), xff)).toBeUndefined();
  });

  it("reduces IPv6 to the /64 prefix in every notation", () => {
    const expected = "2001:db8:0:1::/64";
    for (const address of [
      "2001:db8:0:1:aaaa:bbbb:cccc:dddd",
      "2001:0DB8:0000:0001::1",
      "2001:db8:0:1::",
      "[2001:db8:0:1::5]:443",
      "2001:db8:0:1::5%eth0",
    ]) {
      expect(clientAddress(headers("x-forwarded-for", address), xff)).toBe(
        expected,
      );
    }
    expect(clientAddress(headers("x-forwarded-for", "::1"), xff)).toBe(
      "0:0:0:0::/64",
    );
    expect(clientAddress(headers("x-forwarded-for", "::"), xff)).toBe(
      "0:0:0:0::/64",
    );
    expect(clientAddress(headers("x-forwarded-for", "2001:db8::"), xff)).toBe(
      "2001:db8:0:0::/64",
    );
  });

  it("maps IPv4-mapped IPv6 to IPv4", () => {
    expect(
      clientAddress(headers("x-forwarded-for", "::ffff:5.5.5.5"), xff),
    ).toBe("5.5.5.5");
  });
});

describe("clientKey", () => {
  it("hashes the address into the key", () => {
    const key = clientKey(
      headers("x-forwarded-for", "2.2.2.2"),
      "register",
      xff,
    );
    expect(key).toBe(`register:ip:${hashOpaqueToken("2.2.2.2")}`);
    expect(key.length).toBeLessThanOrEqual(200);
  });

  it("fails closed in production when the address is unknown", () => {
    expect(() => clientKey(new Headers(), "register", xff)).toThrow(
      /unavailable/,
    );
  });

  it("falls back to a local key outside production", () => {
    expect(
      clientKey(new Headers(), "register", { ...xff, production: false }),
    ).toBe("register:ip:local");
  });
});
