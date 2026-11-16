import { router, useLocalSearchParams } from "expo-router";
import { Onboarding } from "../src/screens/Onboarding";

export default function OnboardingRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Onboarding inviteCode={code} onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
