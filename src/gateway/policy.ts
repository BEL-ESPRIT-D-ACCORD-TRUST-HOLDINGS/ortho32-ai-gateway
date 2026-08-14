import type { ModelDescriptor } from "./catalog";
import type { ORTHOModelProvider } from "../providers/base";

export type RoutingPolicy = {
  localOnly?: boolean;
  fallback?: "error" | "fallback";
};

export class PolicyEngine {
  // Enforces routing rules. Throws on violation (never silent).
  enforce(descriptor: ModelDescriptor, provider: ORTHOModelProvider, policy: RoutingPolicy): void {
    if (policy.localOnly && !provider.isLocal) {
      throw Object.assign(new Error(`local-only policy violation: provider ${provider.name} is not local`), { statusCode: 403 });
    }
    if (descriptor.availability === "unavailable" || descriptor.availability === "deprecated") {
      if (policy.fallback === "error" || !policy.fallback) {
        throw Object.assign(new Error(`model ${descriptor.canonicalID} is ${descriptor.availability}`), { statusCode: 503 });
      }
    }
  }

  shouldFallback(descriptor: ModelDescriptor, policy: RoutingPolicy): boolean {
    if (descriptor.availability !== "available") {
      return policy.fallback === "fallback";
    }
    return false;
  }

  // Find fallback within same alias family or same provider local alternative — never silent cross-boundary
  findFallback(descriptor: ModelDescriptor, catalog: ModelDescriptor[], providers: Map<string, ORTHOModelProvider>, policy: RoutingPolicy): ModelDescriptor | null {
    if (policy.fallback !== "fallback") return null;
    if (policy.localOnly) {
      // only local candidates
      const localCandidates = catalog.filter((m) => m.provider === "local" && m.availability === "available");
      return localCandidates[0] || null;
    }
    // otherwise any available model from same provider
    const sameProvider = catalog.filter((m) => m.provider === descriptor.provider && m.availability === "available" && m.canonicalID !== descriptor.canonicalID);
    if (sameProvider.length) return sameProvider[0];
    return catalog.find((m) => m.availability === "available") || null;
  }
}
