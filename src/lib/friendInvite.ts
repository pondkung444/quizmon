export const FRIEND_INVITE_COOKIE = "qmon_friend_invite";
export function invitationDestination(code: string | null | undefined): string {
  return code && /^[A-Za-z0-9]{8}$/.test(code)
    ? `/social/add-friend?code=${code.toUpperCase()}` : "/pet";
}
