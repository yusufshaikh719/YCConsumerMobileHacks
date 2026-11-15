import { Arrived } from "../src/screens/Arrived";
import { Failed } from "../src/screens/Failed";
import { Ping } from "../src/screens/Ping";
import { QuestLive } from "../src/screens/QuestLive";
import { Verified } from "../src/screens/Verified";
import { Verifying } from "../src/screens/Verifying";
import { Waiting } from "../src/screens/Waiting";
import { useAnte } from "../src/state/AnteProvider";

export default function Home() {
  const { phase } = useAnte();
  switch (phase.name) {
    case "waiting":
      return <Waiting preview={phase.preview} />;
    case "ping":
      return <Ping key={phase.quest.id} quest={phase.quest} />;
    case "live":
      return <QuestLive key={phase.quest.id} quest={phase.quest} />;
    case "arrived":
      return <Arrived key={phase.quest.id} quest={phase.quest} />;
    case "verifying":
      return <Verifying quest={phase.quest} photoUri={phase.photoUri} />;
    case "verified":
      return <Verified result={phase.result} />;
    case "failed":
      return <Failed quest={phase.quest} reason={phase.reason} />;
  }
}
