import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it.each(["/auth", "/reset-password", "/home", "/think", "/work", "/work/932d6472-4db3-4de5-bd16-9f7e731be842", "/deliverables", "/deliverable/1d02bb1d-17db-481e-b786-b632f28adbcb", "/backlog", "/memory", "/search", "/openmind", "/settings", "/.lovable/oauth/consent"])("resolves %s to a content route with metadata", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    const leaf = matches.at(-1);
    expect(leaf?.routeId).not.toBe(rootRouteId);
    const route = leaf ? router.routesById[leaf.routeId] : undefined;
    expect(route?.options.head).toBeTypeOf("function");
  });
});
