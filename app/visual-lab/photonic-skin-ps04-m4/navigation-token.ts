/**
 * One semantic navigation token per screen change. Raw observed node,
 * magnetic candidate and committed node share this token; they must not
 * each create an actor request.
 */

import { graphDistance, type ScreenNodeId } from "./topology";
import type { ScrollMode } from "./scroll-controller";

export type NavigationOrigin =
  | "user-adjacent"
  | "user-coalesced"
  | "magnetic"
  | "programmatic"
  | "restore";

export interface NavigationToken {
  token: number;
  targetNodeId: ScreenNodeId;
  origin: NavigationOrigin;
  rawObservedNodeId: ScreenNodeId;
  magneticCandidateId: ScreenNodeId | null;
  committedNodeId: ScreenNodeId;
  actorEligible: boolean;
  projectedTargetNodeId: ScreenNodeId | null;
  fastSkip: boolean;
}

export interface NavigationObserveArgs {
  nowMs: number;
  rawObservedNodeId: ScreenNodeId;
  committedNodeId: ScreenNodeId;
  magneticCandidateId: ScreenNodeId | null;
  mode: ScrollMode;
  fastGesture: boolean;
  displayedNodeId: ScreenNodeId;
  inputIdle?: boolean;
}

const STABLE_INTENT_MS = 48;
const FAST_SKIP_DISTANCE = 2;

export class NavigationDirector {
  private token = 0;
  private issuedTarget: ScreenNodeId | null = null;
  private issuedOrigin: NavigationOrigin | null = null;
  private projected: ScreenNodeId | null = null;
  private stableSince = 0;
  private lastRaw: ScreenNodeId | null = null;
  private coalescing = false;

  lastIssuedTarget() {
    return this.issuedTarget;
  }

  lastToken() {
    return this.token;
  }

  commitActorTarget(nodeId: ScreenNodeId, origin: NavigationOrigin) {
    this.issuedTarget = nodeId;
    this.issuedOrigin = origin;
    if (origin !== "user-coalesced") this.coalescing = false;
  }

  observe(args: NavigationObserveArgs): { token: NavigationToken; shouldRequestActor: boolean } {
    const distanceFromDisplayed = graphDistance(args.displayedNodeId, args.rawObservedNodeId);
    const skip = args.fastGesture || distanceFromDisplayed >= FAST_SKIP_DISTANCE;
    let origin: NavigationOrigin;
    let actorTarget: ScreenNodeId;
    let actorEligible = false;
    let projected: ScreenNodeId | null = args.rawObservedNodeId;

    if (args.mode === "programmatic") {
      origin = "programmatic";
      actorTarget = args.committedNodeId;
      actorEligible = true;
      this.coalescing = false;
    } else if (args.mode === "restore") {
      origin = "restore";
      actorTarget = args.committedNodeId;
      actorEligible = true;
      this.coalescing = false;
    } else if (args.mode === "magnetic") {
      origin = "magnetic";
      actorTarget = args.magneticCandidateId ?? args.committedNodeId;
      actorEligible = true;
      projected = actorTarget;
    } else if (args.mode === "user") {
      projected = args.rawObservedNodeId;
      if (skip) {
        this.coalescing = true;
        origin = "user-coalesced";
        actorTarget = args.inputIdle ? args.rawObservedNodeId : (this.issuedTarget ?? args.displayedNodeId);
        actorEligible = Boolean(args.inputIdle);
      } else {
        origin = "user-adjacent";
        actorTarget = args.rawObservedNodeId;
        if (this.lastRaw !== args.rawObservedNodeId) {
          this.stableSince = args.nowMs;
          this.lastRaw = args.rawObservedNodeId;
        }
        const stable = args.nowMs - this.stableSince >= STABLE_INTENT_MS;
        actorEligible = stable || Boolean(args.inputIdle);
      }
    } else {
      origin = this.issuedOrigin === "user-coalesced" ? "user-coalesced" : "user-adjacent";
      actorTarget = this.issuedTarget ?? args.committedNodeId;
      actorEligible = false;
      if (this.coalescing) {
        actorTarget = args.rawObservedNodeId;
        origin = "user-coalesced";
        actorEligible = true;
      } else if (args.committedNodeId !== args.displayedNodeId
        && args.committedNodeId !== this.issuedTarget) {
        origin = "programmatic";
        actorTarget = args.committedNodeId;
        actorEligible = true;
      }
    }

    this.projected = projected;
    const sameTarget = this.issuedTarget === actorTarget;
    const token: NavigationToken = {
      token: sameTarget && this.token > 0 ? this.token : this.token + (actorEligible && !sameTarget ? 1 : 0),
      targetNodeId: actorTarget,
      origin,
      rawObservedNodeId: args.rawObservedNodeId,
      magneticCandidateId: args.magneticCandidateId,
      committedNodeId: args.committedNodeId,
      actorEligible,
      projectedTargetNodeId: projected,
      fastSkip: skip,
    };

    const shouldRequestActor = actorEligible && !sameTarget && actorTarget !== args.displayedNodeId;
    if (shouldRequestActor) {
      this.token = token.token || this.token + 1;
      token.token = this.token;
    } else {
      token.token = this.token;
    }
    return { token, shouldRequestActor };
  }

  reset() {
    this.token = 0;
    this.issuedTarget = null;
    this.issuedOrigin = null;
    this.projected = null;
    this.stableSince = 0;
    this.lastRaw = null;
    this.coalescing = false;
  }
}

export function rawNodeMustNotRequestActor(token: NavigationToken) {
  return token.rawObservedNodeId !== token.targetNodeId || !token.actorEligible;
}
