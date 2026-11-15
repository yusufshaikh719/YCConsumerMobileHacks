import type { Member, Postcard, Standing } from "./types";

export function rankStandings(members: Member[], postcards: Postcard[]): Standing[] {
  const rows = members.map(member => {
    const mine = postcards.filter(p => p.memberId === member.id);
    return { member, completed: mine.length, minutes: mine.reduce((sum, p) => sum + p.minutesTaken, 0) };
  });
  rows.sort((a, b) => b.completed - a.completed || a.minutes - b.minutes || a.member.name.localeCompare(b.member.name));
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export function passedMembers(before: Standing[], after: Standing[], meId: string): Member[] {
  const oldRank = before.find(s => s.member.id === meId)?.rank ?? Infinity;
  const newRank = after.find(s => s.member.id === meId)?.rank ?? Infinity;
  return before.filter(s => s.member.id !== meId && s.rank < oldRank && s.rank >= newRank).map(s => s.member);
}

export function payoutPreview(standings: Standing[], potCents: number, meId: string) {
  const top = standings[0]?.completed ?? 0;
  const leaders = standings.filter(s => s.completed === top && top > 0);
  const leading = leaders.some(s => s.member.id === meId);
  return { leading, shareCents: leading ? Math.floor(potCents / leaders.length) : 0, leaders: leaders.length };
}
