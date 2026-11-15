import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope } from "expo-sensors";
import { useConvex, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type Props = { potId: Id<"pots">; userId: Id<"users">; allowSimulatedDemo: boolean; onClose: () => void };
type Challenge = Pick<Doc<"challenges">, "promptText" | "verificationCode" | "issuedAt" | "expiresAt">;

const getChallenge = makeFunctionReference<"query", { challengeId: Id<"challenges"> }, Challenge | null>("challenges:getChallenge");
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function LiveCamera({ potId, userId, allowSimulatedDemo, onClose }: Props) {
  const convex = useConvex();
  const issueChallenge = useMutation(api.challenges.issueCameraChallenge);
  const generateUploadUrl = useMutation(api.submissions.generateUploadUrl);
  const submitProof = useMutation(api.submissions.submitLiveProof);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const video = useRef<HTMLVideoElement>(null);
  const samples = useRef<number[]>([]);
  const generation = useRef(0);
  const [challengeId, setChallengeId] = useState<Id<"challenges"> | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submissionId, setSubmissionId] = useState<Id<"submissions"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"loading" | "live" | "simulated">(Platform.OS === "web" ? "loading" : "live");
  const [simulatedSubmission, setSimulatedSubmission] = useState(false);
  const [sensorState, setSensorState] = useState<"loading" | "live" | "unavailable">("loading");
  const [glare, setGlare] = useState(false);
  const feed = useQuery(api.submissions.listPotFeed, submissionId ? { potId } : "skip");
  const submission = feed?.find((item) => item._id === submissionId);

  const startChallenge = useCallback(async () => {
    const current = ++generation.current;
    setIssuing(true);
    setBusy(false);
    setError(null);
    setChallenge(null);
    setChallengeId(null);
    setSubmissionId(null);
    setSimulatedSubmission(false);
    samples.current = [];
    try {
      const id = await issueChallenge({ potId, userId });
      if (generation.current !== current) return;
      const details = await convex.query(getChallenge, { challengeId: id });
      if (!details) throw new Error("Challenge details are unavailable. Please retry.");
      if (generation.current !== current) return;
      setStartedAt(details.issuedAt);
      setNow(Date.now());
      setChallenge(details);
      setChallengeId(id);
    } catch (err) {
      if (generation.current === current) setError(message(err));
    } finally {
      if (generation.current === current) setIssuing(false);
    }
  }, [convex, issueChallenge, potId, userId]);

  useEffect(() => {
    void startChallenge();
    return () => { generation.current++; };
  }, [startChallenge]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || submissionId) return;
    setCameraState("loading");
    let stream: MediaStream | undefined;
    let cancelled = false;
    const open = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { acquired.getTracks().forEach((track) => track.stop()); return; }
        stream = acquired;
        if (!video.current) throw new Error("Camera preview unavailable");
        video.current.srcObject = stream;
        await video.current.play();
        if (!cancelled) setCameraState("live");
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) setCameraState("simulated");
      }
    };
    void open();
    return () => { cancelled = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [submissionId]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    void Gyroscope.isAvailableAsync().then((available) => {
      if (cancelled) return;
      if (!available) { setSensorState("unavailable"); return; }
      Gyroscope.setUpdateInterval(100);
      subscription = Gyroscope.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        if (Number.isFinite(magnitude)) {
          samples.current.push(magnitude);
          if (samples.current.length > 300) samples.current.shift();
        }
      });
      setSensorState("live");
    }).catch(() => { if (!cancelled) setSensorState("unavailable"); });
    return () => { cancelled = true; subscription?.remove(); };
  }, []);

  const expiresAt = Math.min(startedAt + 60_000, challenge?.expiresAt ?? Infinity);
  const seconds = startedAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const capture = async () => {
    if (!challengeId || busy || seconds === 0) return;
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      if (Platform.OS === "web") {
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 960;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare the camera image.");
        if (cameraState === "live" && video.current && video.current.videoWidth) {
          canvas.width = video.current.videoWidth;
          canvas.height = video.current.videoHeight;
          context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
        } else if (cameraState === "simulated" && allowSimulatedDemo) {
          context.fillStyle = "#141a19";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "#c8ff2e";
          context.font = "bold 32px sans-serif";
          context.fillText("SIMULATED CAMERA", 50, 440);
          context.fillStyle = "#ffffff";
          context.font = "24px sans-serif";
          context.fillText("No live camera available", 50, 485);
        } else throw new Error("The camera is still starting. Try again.");
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not capture an image.")), "image/jpeg", 0.85));
      } else {
        const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
        if (!photo?.uri) throw new Error("Could not capture an image. Check camera permission and try again.");
        const response = await fetch(photo.uri);
        if (!response.ok) throw new Error("Could not read the captured image.");
        blob = await response.blob();
      }
      const capturedAt = Date.now();
      if (capturedAt >= expiresAt) throw new Error("The capture window ended. Start a new challenge.");
      const values = samples.current;
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const gyroVariance = cameraState === "simulated" ? 0 : values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
      const uploadUrl = await generateUploadUrl({});
      if (generation.current !== current) return;
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!upload.ok) throw new Error("Upload failed. Please try again.");
      const result: { storageId?: Id<"_storage"> } = await upload.json();
      if (!result.storageId) throw new Error("Upload did not return an image ID.");
      if (generation.current !== current) return;
      const id = await submitProof({ potId, userId, challengeId, storageId: result.storageId, capturedAt, gyroVariance, screenGlareSuspected: glare });
      if (generation.current === current) {
        setSimulatedSubmission(Platform.OS === "web" && cameraState === "simulated");
        setSubmissionId(id);
      }
    } catch (err) {
      if (generation.current === current) setError(message(err));
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };

  const title = submission?.verdict === "passed" ? "Proof accepted" : submission?.verdict === "failed_spoof" ? "Spoof detected" : submission?.verdict === "failed_habit" ? "Habit not verified" : "Referee is reviewing";
  const canCapture = challengeId && challenge && seconds > 0 && !issuing && !busy && (Platform.OS === "web" ? cameraState === "live" || (cameraState === "simulated" && allowSimulatedDemo) : permission?.granted);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>LIVE PROOF</Text><Text style={styles.heading}>Show up. Prove it.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {submissionId ? (
          <View style={styles.result}>
            {simulatedSubmission && <Text style={styles.warning}>SIMULATED IMAGE · NOT LIVE CAMERA PROOF</Text>}
            {(!submission || submission.verdict === "pending") && <ActivityIndicator color="#c8ff2e" />}
            <Text style={styles.resultTitle}>{title}</Text>
            <Text style={styles.muted}>{!submission || submission.verdict === "pending" ? "Your proof is uploaded. Waiting for the referee…" : submission.roastMessage}</Text>
            {submission?.trustScore !== undefined && <><Text style={styles.score}>{Math.round(submission.trustScore)}<Text style={styles.scoreUnit}> / 100 TRUST</Text></Text><View style={styles.track}><View style={[styles.progress, { width: `${Math.max(0, Math.min(100, submission.trustScore))}%` }]} /></View></>}
            {!!submission?.spoofSignals.length && <Text style={styles.warning}>{submission.spoofSignals.join(" · ")}</Text>}
            {submission?.evaluationMode && <Text style={styles.tag}>REFEREE: {submission.evaluationMode.toUpperCase()}</Text>}
            {submission?.whopChatPostId && <Text style={styles.tag}>POSTED TO WHOP CHAT</Text>}
            {submission && submission.verdict !== "pending" && submission.verdict !== "passed" && <Pressable onPress={() => void startChallenge()} style={styles.secondary}><Text style={styles.secondaryText}>Try again</Text></Pressable>}
          </View>
        ) : (
          <>
            <View style={styles.challenge}>
              <View style={styles.row}><Text style={styles.eyebrow}>YOUR CHALLENGE</Text><Text style={styles.timer}>{issuing ? "--" : `${seconds}s`}</Text></View>
              <Text style={styles.prompt}>{challenge?.promptText ?? "Waiting for challenge…"}</Text>
              {challenge && <Text style={styles.muted}>Verification code: {challenge.verificationCode}</Text>}
              <View style={styles.track}><View style={[styles.progress, { width: `${Math.max(0, Math.min(100, seconds / 60 * 100))}%` }]} /></View>
              <Text style={styles.caption}>60-second capture window{challenge ? " · server expiry may be sooner" : " · challenge details unavailable"}</Text>
            </View>
            <View style={styles.viewfinder}>
              {Platform.OS === "web" ? createElement("video", { ref: video, muted: true, playsInline: true, style: { width: "100%", height: "100%", objectFit: "cover", display: cameraState === "live" ? "block" : "none" } }) : permission?.granted ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onMountError={(event) => setError(event.message)} /> : <View style={styles.center}><Text style={styles.previewTitle}>Camera access needed</Text><Pressable onPress={() => void requestPermission().catch((err) => setError(message(err)))} style={styles.secondary}><Text style={styles.secondaryText}>Allow camera</Text></Pressable></View>}
              {Platform.OS === "web" && cameraState !== "live" && <View style={styles.center}><Text style={styles.previewTitle}>{cameraState === "loading" ? "Starting camera…" : "SIMULATED CAMERA"}</Text><Text style={styles.muted}>{cameraState === "simulated" ? "No webcam available. Captured image is a labeled placeholder, not live proof." : "Waiting for browser permission"}</Text></View>}
              <View style={styles.liveBadge}><Text style={styles.liveText}>{cameraState === "simulated" ? "SIMULATED" : "LIVE ONLY"}</Text></View>
            </View>
            <View style={styles.telemetry}><Text style={styles.caption}>MOTION  {sensorState === "live" ? "GYROSCOPE LISTENING · ZERO IF NO SAMPLES" : sensorState === "loading" ? "CHECKING" : "UNAVAILABLE · ZERO SENT"}</Text><Pressable onPress={() => setGlare(!glare)} accessibilityRole="switch" accessibilityState={{ checked: glare }}><Text style={glare ? styles.warning : styles.caption}>GLARE TEST {glare ? "ON" : "OFF"}</Text></Pressable></View>
            {error && <Text style={styles.error}>{error}</Text>}
            {challengeId && seconds === 0 && !issuing && !busy ? <Pressable style={styles.primary} onPress={() => void startChallenge()}><Text style={styles.primaryText}>Start a new challenge</Text></Pressable> : <Pressable disabled={!canCapture} onPress={() => void capture()} style={[styles.primary, !canCapture && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Uploading proof…" : issuing ? "Preparing challenge…" : cameraState === "simulated" ? "Submit simulated image" : "Capture live proof"}</Text></Pressable>}
            {!challengeId && !issuing && <Pressable style={styles.secondary} onPress={() => void startChallenge()}><Text style={styles.secondaryText}>Retry challenge</Text></Pressable>}
            <Text style={styles.footnote}>Live capture only. No camera roll uploads.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b10" }, header: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: "#c8ff2e", fontWeight: "800", fontSize: 10, letterSpacing: 1.8 }, heading: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 5 }, close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#20242a", alignItems: "center", justifyContent: "center" }, closeText: { color: "white", fontSize: 19 }, content: { paddingHorizontal: 22, paddingBottom: 32, gap: 14 }, challenge: { backgroundColor: "#171c1b", borderColor: "#343f2a", borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, timer: { color: "#c8ff2e", fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }, prompt: { color: "white", fontSize: 19, fontWeight: "700" }, muted: { color: "#a7b0a9", fontSize: 13, lineHeight: 19 }, track: { height: 5, backgroundColor: "#30392e", borderRadius: 3, overflow: "hidden", marginTop: 4 }, progress: { height: "100%", backgroundColor: "#c8ff2e", borderRadius: 3 }, caption: { color: "#a7b0a9", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }, viewfinder: { height: 300, borderRadius: 20, overflow: "hidden", backgroundColor: "#1a211e", justifyContent: "center" }, center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }, previewTitle: { color: "white", fontSize: 17, fontWeight: "800" }, liveBadge: { position: "absolute", top: 14, left: 14, backgroundColor: "#090b10cc", borderRadius: 7, paddingVertical: 6, paddingHorizontal: 9 }, liveText: { color: "#c8ff2e", fontSize: 10, fontWeight: "800", letterSpacing: 1 }, telemetry: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, warning: { color: "#ff5771", fontSize: 11, fontWeight: "800" }, error: { color: "#ff7185", fontSize: 13, lineHeight: 19 }, primary: { backgroundColor: "#c8ff2e", borderRadius: 14, alignItems: "center", padding: 17 }, primaryText: { color: "#11170a", fontSize: 15, fontWeight: "900" }, disabled: { opacity: 0.45 }, secondary: { borderWidth: 1, borderColor: "#66734d", borderRadius: 12, alignItems: "center", padding: 12 }, secondaryText: { color: "#c8ff2e", fontWeight: "700" }, footnote: { textAlign: "center", color: "#788178", fontSize: 11 }, result: { backgroundColor: "#171c1b", borderRadius: 20, padding: 22, gap: 16 }, resultTitle: { color: "white", fontSize: 25, fontWeight: "800" }, score: { color: "#c8ff2e", fontSize: 38, fontWeight: "900" }, scoreUnit: { color: "#a7b0a9", fontSize: 11 }, tag: { alignSelf: "flex-start", color: "#c8ff2e", fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
});
