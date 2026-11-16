import { Share } from "react-native";
import type { AnteSnapshot } from "../services/types";
import { money } from "./money";

export function inviteMessage(data: AnteSnapshot) {
  return `Join ${data.group.name} on Ante. ${money(data.stakeCents)} into the weekly pot, one surprise sidequest a day, most stamps by Sunday takes it. ante://join/${data.group.inviteCode}`;
}

export const shareInvite = (data: AnteSnapshot) => Share.share({ message: inviteMessage(data) }).catch(() => undefined);
