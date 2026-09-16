export const UX_FUNNEL_EVENTS = [
  "guest_started",
  "guest_ready",
  "starter_egg_viewed",
  "pet_hatched",
  "home_next_action_viewed",
  "activity_started",
  "question_answered",
  "activity_completed",
  "reward_claimed",
  "review_opened",
  "locked_cta_clicked",
] as const;

export type UxFunnelEvent = (typeof UX_FUNNEL_EVENTS)[number];
export type ViewportGroup = "mobile_small" | "mobile" | "mobile_large" | "desktop";
export type LearnerState = "guest_setup" | "no_pet" | "active_pet" | "unknown";

export type UxFunnelProps = {
  route: string;
  viewport_group: ViewportGroup;
  user_state: LearnerState;
  activity?: "hatch" | "practice" | "mission" | "adventure" | "raid" | "friend" | "pvp" | "boss_raid";
  source?: string;
  outcome?: string;
};

export function viewportGroup(width: number): ViewportGroup {
  if (width <= 375) return "mobile_small";
  if (width <= 393) return "mobile";
  if (width <= 767) return "mobile_large";
  return "desktop";
}

export function uxFunnelProps(
  userState: LearnerState,
  extra: Omit<Partial<UxFunnelProps>, "route" | "viewport_group" | "user_state"> = {},
): UxFunnelProps {
  return {
    route: typeof window === "undefined" ? "unknown" : window.location.pathname,
    viewport_group: viewportGroup(typeof window === "undefined" ? 1024 : window.innerWidth),
    user_state: userState,
    ...extra,
  };
}

export function isUxFunnelEvent(value: string): value is UxFunnelEvent {
  return (UX_FUNNEL_EVENTS as readonly string[]).includes(value);
}

export function hasUxFunnelContext(props: Record<string, unknown>): boolean {
  return (
    typeof props.route === "string" &&
    typeof props.viewport_group === "string" &&
    typeof props.user_state === "string"
  );
}
