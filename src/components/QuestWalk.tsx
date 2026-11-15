import { Ionicons } from "@expo/vector-icons";
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed";
import { Inter_400Regular } from "@expo-google-fonts/inter";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFonts } from "expo-font";
import * as Location from "expo-location";
import { Gyroscope } from "expo-sensors";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type Props = { potId: Id<"pots">; userId: Id<"users">; sidequestId: Id<"sidequests">; onClose: () => void };
type Point = { lat: number; lng: number; timestamp: number; speedMps?: number; accuracyM?: number };
const getQuest = makeFunctionReference<"query", { sidequestId: Id<"sidequests"> }, Doc<"sidequests"> | null>("sidequests:getSidequest");
const getWalk = makeFunctionReference<"query", { sidequestId: Id<"sidequests"> }, Doc<"walkSubmissions"> | null>("mapReferee:getWalkSubmissionForSidequest");
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function mapHtml(quest: Doc<"sidequests">) {
  const origin = JSON.stringify([quest.originLat, quest.originLng]);
  const destination = JSON.stringify([quest.destLat, quest.destLng]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#e9e7e0}#fallback{position:absolute;top:12px;left:12px;color:#0b1b3f;font:14px sans-serif}</style></head><body><div id="fallback">Loading map…</div><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
  if (typeof L === 'undefined') { document.getElementById('fallback').textContent = 'Map unavailable. Check your connection.'; } else {
    document.getElementById('fallback').remove();
    var origin=${origin}, destination=${destination};
    var map=L.map('map',{zoomControl:false}).fitBounds([origin,destination],{padding:[35,35],maxZoom:16});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    L.circleMarker(origin,{radius:7,color:'#0B1B3F',fillOpacity:1}).addTo(map).bindPopup('Start');
    L.circleMarker(destination,{radius:9,color:'#FF4D2E',fillOpacity:1}).addTo(map).bindPopup('Destination');
    L.circle(destination,{radius:${quest.targetRadiusMeters},color:'#13A05F',fillColor:'#13A05F',fillOpacity:0.1,weight:1}).addTo(map);
    L.polyline([origin,destination],{color:'#FF4D2E',weight:2,dashArray:'7 8',opacity:0.8}).addTo(map);
    var route=L.polyline([],{color:'#0B1B3F',weight:4}).addTo(map), current;
    function update(event){try{var data=JSON.parse(event.data);if(data.type!=='track')return;route.setLatLngs(data.points);if(data.points.length){var p=data.points[data.points.length-1];if(current)current.setLatLng(p);else current=L.circleMarker(p,{radius:7,color:'#13A05F',fillOpacity:1}).addTo(map).bindPopup('You');}}catch(e){}}
    window.addEventListener('message',update);document.addEventListener('message',update);
  }</script></body></html>`;
}

export default function QuestWalk({ potId, userId, sidequestId, onClose }: Props) {
  const [fontsLoaded] = useFonts({ BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold, Inter_400Regular });
  const styles = useMemo(() => makeStyles(fontsLoaded), [fontsLoaded]);
  const insets = useSafeAreaInsets();
  const quest = useQuery(getQuest, { sidequestId });
  const walk = useQuery(getWalk, { sidequestId });
  const uploadUrl = useMutation(api.submissions.generateUploadUrl);
  const submit = useMutation(api.mapReferee.submitWalkTrace);
  const startNow = useMutation(api.sidequests.startSidequestNow);
  const [locationPermission, requestLocation] = Location.useForegroundPermissions();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [now, setNow] = useState(Date.now());
  const [points, setPoints] = useState<Point[]>([]);
  const pointsRef = useRef<Point[]>([]);
  const [tracking, setTracking] = useState(false);
  const [trackingAttempt, setTrackingAttempt] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [webCamera, setWebCamera] = useState<"loading" | "live" | "unavailable">("loading");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [sensor, setSensor] = useState<"checking" | "live" | "unavailable">("checking");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const camera = useRef<CameraView>(null);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const webview = useRef<WebView<{}>>(null);
  const samples = useRef<number[]>([]);
  const mounted = useRef(true);
  const active = !!quest && quest.potId === potId && quest.userId === userId && quest.status === "active" && now >= quest.startsAt && now < quest.expiresAt && !walk && !submitted;
  const html = useMemo(() => quest ? mapHtml(quest) : "", [quest?.originLat, quest?.originLng, quest?.destLat, quest?.destLng, quest?.targetRadiusMeters]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { pointsRef.current = []; setPoints([]); samples.current = []; setSubmitted(false); setCameraOpen(false); setError(null); }, [sidequestId]);
  useEffect(() => { const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (cameraOpen && !busy) setCameraOpen(false); else if (!busy) onClose(); return true; }); return () => sub.remove(); }, [onClose, cameraOpen, busy]);

  const addPoint = useCallback((location: Location.LocationObject) => {
    if (!quest || location.timestamp < quest.startsAt || location.timestamp > Date.now() || location.timestamp >= quest.expiresAt) return;
    const { latitude, longitude, speed, accuracy } = location.coords;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(location.timestamp)) return;
    const previous = pointsRef.current;
    if (previous.length >= 1000 || (previous.length && location.timestamp <= previous[previous.length - 1].timestamp)) return;
    const point: Point = { lat: latitude, lng: longitude, timestamp: location.timestamp, ...(speed != null && Number.isFinite(speed) && speed >= 0 ? { speedMps: speed } : {}), ...(accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracyM: accuracy } : {}) };
    pointsRef.current = [...previous, point];
    setPoints(pointsRef.current);
  }, [quest?.startsAt, quest?.expiresAt]);

  useEffect(() => {
    if (!active || !locationPermission?.granted) { setTracking(false); return; }
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;
    setTracking(false);
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 }, addPoint).then(value => {
      if (cancelled) value.remove(); else { subscription = value; setTracking(true); }
    }).catch(() => { if (!cancelled) setError("Location tracking could not start. Check location services and try again."); });
    return () => { cancelled = true; subscription?.remove(); };
  }, [active, locationPermission?.granted, addPoint, trackingAttempt]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    void Gyroscope.isAvailableAsync().then(available => {
      if (cancelled) return;
      if (!available) { setSensor("unavailable"); return; }
      Gyroscope.setUpdateInterval(100);
      subscription = Gyroscope.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        if (Number.isFinite(magnitude)) { samples.current.push(magnitude); if (samples.current.length > 300) samples.current.shift(); }
      });
      setSensor("live");
    }).catch(() => { if (!cancelled) setSensor("unavailable"); });
    return () => { cancelled = true; subscription?.remove(); };
  }, [active]);

  useEffect(() => {
    if (Platform.OS !== "web" || !cameraOpen || !active) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    setWebCamera("loading");
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        if (!video.current) throw new Error("Camera preview unavailable");
        video.current.srcObject = stream;
        await video.current.play();
        if (!cancelled) setWebCamera("live");
      } catch { stream?.getTracks().forEach(track => track.stop()); if (!cancelled) setWebCamera("unavailable"); }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [cameraOpen, active, cameraAttempt]);

  useEffect(() => {
    if (!mapReady) return;
    const data = JSON.stringify({ type: "track", points: points.map(p => [p.lat, p.lng]) });
    if (Platform.OS === "web") frame.current?.contentWindow?.postMessage(data, "*");
    else webview.current?.postMessage(data);
  }, [points, mapReady]);

  const allowLocation = async () => {
    setError(null);
    try {
      if (locationPermission && !locationPermission.canAskAgain) { await Linking.openSettings(); return; }
      const result = await requestLocation();
      if (!result.granted) setError("Location permission is required to record your walk.");
    } catch { setError("Could not request location permission. Check your device settings."); }
  };
  const startWarningNow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await startNow({ sidequestId }); }
    catch (err) { if (mounted.current) setError(errorMessage(err)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const openCamera = async () => {
    setError(null);
    try {
      if (Platform.OS !== "web" && !cameraPermission?.granted) {
        if (cameraPermission && !cameraPermission.canAskAgain) { await Linking.openSettings(); return; }
        const permission = await requestCamera();
        if (!permission.granted) { setError("Camera permission is required for live arrival proof."); return; }
      }
      setCameraReady(false);
      setCameraOpen(true);
    } catch { setError("Could not open the camera. Check your device settings."); }
  };
  const capture = async () => {
    if (!active || !quest || busy || !tracking || pointsRef.current.length < 4 || pointsRef.current.length >= 1000) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      let capturedAt: number;
      if (Platform.OS === "web") {
        if (webCamera !== "live" || !video.current?.videoWidth) throw new Error("The live camera is not ready.");
        const canvas = document.createElement("canvas");
        canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not capture the camera image.");
        context.drawImage(video.current, 0, 0);
        capturedAt = Date.now();
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not capture the camera image.")), "image/jpeg", 0.85));
      } else {
        const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
        capturedAt = Date.now();
        if (!photo?.uri) throw new Error("Could not capture the camera image.");
        const response = await fetch(photo.uri);
        if (!response.ok) throw new Error("Could not read the camera image.");
        blob = await response.blob();
      }
      if (capturedAt >= quest.expiresAt) throw new Error("The walk window has ended.");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GPS fix timed out. Try again outdoors.")), 10_000); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      addPoint(location);
      const trace = pointsRef.current.slice();
      if (!trace.length || Math.abs(trace[trace.length - 1].timestamp - capturedAt) > 60_000) throw new Error("A current GPS fix is required with your photo. Try again outdoors.");
      const values = samples.current;
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const gyroVariance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : undefined;
      const url = await uploadUrl({});
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!response.ok) throw new Error("Photo upload failed. Please try again.");
      const result: { storageId?: Id<"_storage"> } = await response.json();
      if (!result.storageId) throw new Error("Photo upload did not return an image ID.");
      await submit({ sidequestId, userId, points: trace, arrivalStorageId: result.storageId, arrivalCapturedAt: capturedAt, ...(gyroVariance !== undefined ? { gyroVariance } : {}) });
      if (mounted.current) { setSubmitted(true); setCameraOpen(false); }
    } catch (err) { if (mounted.current) setError(errorMessage(err)); }
    finally { if (mounted.current) setBusy(false); }
  };

  const invalidQuest = quest && (quest.potId !== potId || quest.userId !== userId);
  const last = points[points.length - 1];
  const walked = points.reduce((sum, point, index) => index ? sum + distance(points[index - 1], point) : sum, 0);
  const remaining = quest ? Math.max(0, Math.ceil(((quest.status === "warning_5m" ? quest.startsAt : quest.expiresAt) - now) / 1000)) : 0;
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const canCapture = active && tracking && points.length >= 4 && points.length < 1000 && !busy && (Platform.OS === "web" ? webCamera === "live" : cameraReady);
  const showResult = !!walk || submitted;

  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Close walk" onPress={onClose} disabled={busy} style={styles.icon}><Ionicons name="arrow-back" size={22} color="#0B1B3F" /></Pressable><Text style={styles.headerTitle}>SIDEQUEST</Text><View style={styles.icon} /></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
      {quest === undefined || walk === undefined ? <View style={styles.center}><ActivityIndicator color="#FF4D2E" /><Text style={styles.body}>Loading your sidequest…</Text></View> : !quest || invalidQuest ? <View style={styles.card}><Text style={styles.title}>Sidequest unavailable</Text><Text style={styles.body}>This quest could not be found for this player and pot.</Text></View> : showResult ? <View style={styles.card}>
        <Text style={styles.eyebrow}>THE REFEREE · VAR REVIEW</Text>
        {!walk || walk.verdict === "pending" ? <><ActivityIndicator color="#FF4D2E" /><Text style={styles.title}>CHECKING THE TAPE</Text><Text style={styles.body}>Your walk and arrival photo are being reviewed.</Text></> : <>
          <Text style={[styles.verdict, { color: walk.verdict === "passed" ? "#13A05F" : "#FF4D2E" }]}>{walk.verdict === "passed" ? "PROOF STANDS" : "OVERTURNED"}</Text>
          <Text style={styles.body}>{walk.roastMessage}</Text>
          {walk.arrivalImageUrl && <Image source={{ uri: walk.arrivalImageUrl }} accessibilityLabel="Arrival proof photo" style={styles.proofImage} />}
          <View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricValue}>{Math.round(walk.totalDistanceMeters)} m</Text><Text style={styles.label}>DISTANCE</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{Math.round(walk.durationSeconds / 60)} min</Text><Text style={styles.label}>DURATION</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{Math.round(walk.minDistanceToDestMeters)} m</Text><Text style={styles.label}>NEAREST</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{Math.round(walk.trustScore)}/100</Text><Text style={styles.label}>TRUST</Text></View></View>
          <Text style={styles.small}>Top speed {walk.maxSpeedMps.toFixed(1)} m/s · Referee {walk.evaluationMode}</Text>
          {!!walk.spoofSignals.length && <Text style={styles.warning}>{walk.spoofSignals.map(signal => signal.replace(/_/g, " ")).join(" · ")}</Text>}
        </>}
      </View> : <>
        <View style={styles.card}><View style={styles.row}><Text style={styles.eyebrow}>{quest.status === "warning_5m" ? "STARTS IN" : "TIME REMAINING"}</Text><Text style={styles.clock}>{clock}</Text></View><Text style={styles.title}>{quest.destName}</Text><Text style={styles.label}>{quest.destSource === "wikipedia" ? "WIKIPEDIA" : quest.destSource === "openstreetmap" ? "OPENSTREETMAP" : "CURATED DESTINATION"}</Text><Text style={styles.body}>{quest.instruction}</Text>{!!quest.destSummary.trim() && !quest.instruction.toLowerCase().includes(quest.destSummary.trim().toLowerCase()) && <Text style={styles.small}>{quest.destSummary}</Text>}{quest.destUrl && /^https?:\/\//i.test(quest.destUrl) && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(quest.destUrl!).catch(() => setError("Could not open the destination link.")); }}><Text style={styles.link}>READ ABOUT THIS PLACE ↗</Text></Pressable>}<View style={styles.divider} /><View style={styles.row}><Text style={styles.label}>{Math.round(quest.distanceMeters)} M · {quest.allottedMinutes} MIN</Text><Text style={styles.label}>{quest.targetRadiusMeters} M ARRIVAL RADIUS</Text></View></View>
        <View style={styles.map}>{Platform.OS === "web" ? createElement("iframe", { ref: frame, title: "Walk map", srcDoc: html, sandbox: "allow-scripts allow-same-origin", onLoad: () => setMapReady(true), style: { width: "100%", height: "100%", border: 0 } }) : <WebView<{}> ref={webview} originWhitelist={["*"]} source={{ html }} userAgent="Ante/1.0 (com.ante.habitpot)" cacheEnabled javaScriptEnabled onLoadEnd={() => setMapReady(true)} onError={() => setMapError(true)} style={styles.mapWeb} />}{mapError && <View style={styles.mapFallback}><Text style={styles.body}>Map unavailable. Check your connection.</Text></View>}</View>
        <Text style={styles.small}>OpenStreetMap · Start, destination and your recorded path. Keep this screen open while walking.</Text>
        {quest.status === "warning_5m" ? <View style={styles.notice}><Text style={styles.body}>Get ready. Tracking starts when the quest goes live.</Text><Pressable accessibilityRole="button" onPress={() => void startWarningNow()} disabled={busy} style={[styles.secondary, busy && styles.disabled]}><Text style={styles.secondaryText}>{busy ? "Starting…" : "Start now (demo)"}</Text></Pressable></View> : !active ? <View style={styles.notice}><Text style={styles.body}>{quest.status === "completed" ? "This sidequest is complete." : "This sidequest is no longer active."}</Text></View> : <>
          <View style={styles.card}><View style={styles.row}><Text style={styles.eyebrow}>LIVE WALK TRACKER</Text><Text style={[styles.status, tracking && styles.statusLive]}>{tracking ? "● TRACKING" : "● NOT TRACKING"}</Text></View><Text style={styles.body}>{last ? `${Math.round(distance(last, { lat: quest.destLat, lng: quest.destLng }))} m from destination` : "Waiting for your first GPS fix."}</Text><Text style={styles.small}>{Math.round(walked)} m walked · {last?.speedMps !== undefined ? `${last.speedMps.toFixed(1)} m/s` : "Speed unavailable"}</Text><Text style={styles.small}>{points.length} GPS points · Motion {sensor === "live" ? "sampling" : sensor === "checking" ? "checking" : "unavailable"}</Text>{points.length < 4 && <Text style={styles.small}>At least four GPS points are needed before submitting.</Text>}{points.length >= 1000 && <Text style={styles.warning}>GPS trace is full. This walk cannot be submitted safely.</Text>}{!locationPermission?.granted && <Pressable accessibilityRole="button" onPress={() => void allowLocation()} style={styles.secondary}><Text style={styles.secondaryText}>{locationPermission && !locationPermission.canAskAgain ? "Open location settings" : "Allow location"}</Text></Pressable>}{locationPermission?.granted && !tracking && <Pressable accessibilityRole="button" onPress={() => { setError(null); setTrackingAttempt(value => value + 1); }} style={styles.secondary}><Text style={styles.secondaryText}>Retry tracking</Text></Pressable>}</View>
          {cameraOpen ? <View style={styles.card}><View style={styles.row}><Text style={styles.eyebrow}>LIVE ARRIVAL PHOTO</Text><Pressable onPress={() => setCameraOpen(false)} disabled={busy}><Text style={styles.link}>CLOSE</Text></Pressable></View><View style={styles.camera}>{Platform.OS === "web" ? createElement("video", { ref: video, muted: true, playsInline: true, style: { width: "100%", height: "100%", objectFit: "cover" } }) : <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => setError("Camera could not start. Check permission and try again.")} />}{Platform.OS === "web" && webCamera !== "live" && <View style={styles.cameraOverlay}><Text style={styles.cameraText}>{webCamera === "loading" ? "Starting camera…" : "Live camera unavailable. Check browser permission."}</Text>{webCamera === "unavailable" && <Pressable onPress={() => setCameraAttempt(value => value + 1)}><Text style={styles.cameraText}>Retry camera</Text></Pressable>}</View>}</View><Text style={styles.small}>Photograph the destination now. Camera roll uploads are not accepted.</Text><Pressable accessibilityRole="button" disabled={!canCapture} onPress={() => void capture()} style={[styles.primary, !canCapture && styles.disabled]}><Text style={styles.primaryText}>{busy ? "UPLOADING PROOF…" : "CAPTURE & SUBMIT"}</Text></Pressable></View> : <Pressable accessibilityRole="button" disabled={!tracking || points.length < 4 || points.length >= 1000} onPress={() => void openCamera()} style={[styles.primary, (!tracking || points.length < 4 || points.length >= 1000) && styles.disabled]}><Ionicons name="camera-outline" size={19} color="white" /><Text style={styles.primaryText}>TAKE ARRIVAL PHOTO</Text></Pressable>}
        </>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
    </ScrollView>
  </View>;
}

const makeStyles = (fontsLoaded: boolean) => StyleSheet.create({
  proofImage: { width: "100%", height: 200, borderRadius: 10, backgroundColor: "#F4F3EF" },
  screen: { flex: 1, backgroundColor: "#F4F3EF" }, header: { height: 62, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, icon: { width: 40, height: 40, justifyContent: "center", alignItems: "center" }, headerTitle: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_700Bold" } : {}), color: "#0B1B3F", fontSize: 15, fontWeight: "900", letterSpacing: 1.5 }, content: { paddingHorizontal: 18, gap: 12 }, center: { padding: 40, alignItems: "center", gap: 12 }, card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E3E1DA", padding: 18, gap: 10, elevation: 1 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, eyebrow: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_700Bold" } : {}), color: "#FF4D2E", fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, title: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_800ExtraBold" } : {}), color: "#0B1B3F", fontSize: 27, fontWeight: "900", letterSpacing: -0.5 }, body: { ...(fontsLoaded ? { fontFamily: "Inter_400Regular" } : {}), color: "#3A4766", fontSize: 14, lineHeight: 21 }, small: { ...(fontsLoaded ? { fontFamily: "Inter_400Regular" } : {}), color: "#737A8C", fontSize: 12, lineHeight: 18 }, label: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_700Bold" } : {}), color: "#737A8C", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }, clock: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_800ExtraBold" } : {}), color: "#0B1B3F", fontWeight: "900", fontSize: 23, fontVariant: ["tabular-nums"] }, divider: { height: 1, backgroundColor: "#ECEAE4", marginVertical: 3 }, map: { height: 280, borderRadius: 16, overflow: "hidden", backgroundColor: "#E9E7E0" }, mapWeb: { flex: 1, backgroundColor: "#E9E7E0" }, mapFallback: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#E9E7E0" }, notice: { backgroundColor: "#FFF0EC", borderRadius: 14, padding: 16 }, status: { color: "#737A8C", fontSize: 10, fontWeight: "900" }, statusLive: { color: "#13A05F" }, primary: { backgroundColor: "#0B1B3F", borderRadius: 12, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14 }, primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", letterSpacing: 0.8 }, disabled: { opacity: 0.45 }, secondary: { borderWidth: 1, borderColor: "#0B1B3F", borderRadius: 10, padding: 12, alignItems: "center" }, secondaryText: { color: "#0B1B3F", fontWeight: "800" }, link: { color: "#FF4D2E", fontWeight: "900", fontSize: 11 }, camera: { height: 260, backgroundColor: "#0B1B3F", borderRadius: 12, overflow: "hidden" }, cameraOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#0B1B3F", justifyContent: "center", alignItems: "center", padding: 20, gap: 12 }, cameraText: { color: "#FFFFFF", textAlign: "center" }, warning: { color: "#C02F19", fontSize: 12, lineHeight: 18, fontWeight: "700" }, verdict: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_800ExtraBold" } : {}), fontSize: 32, fontWeight: "900" }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 4 }, metric: { width: "46%", backgroundColor: "#F4F3EF", borderRadius: 10, padding: 12, gap: 3 }, metricValue: { ...(fontsLoaded ? { fontFamily: "BarlowCondensed_800ExtraBold" } : {}), color: "#0B1B3F", fontSize: 19, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
