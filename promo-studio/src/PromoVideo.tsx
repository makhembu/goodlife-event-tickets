import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import timelines from "../audio/timelines.json";
import { COLORS, CaptionBar, SpotlightCapture, StreamCredentialsCard } from "./components/SharedUI";

export type PromoId = "promo1" | "promo2" | "promo3";

const BeatBadge: React.FC<{ label: string; portrait?: boolean }> = ({ label, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  // Beat pulse at 120 BPM (every 15 frames at 30fps)
  const beat = Math.abs(Math.sin((frame / 15) * Math.PI));
  const pulse = 1 + beat * 0.025;

  return (
    <div
      style={{
        position: "absolute",
        top: portrait ? 80 : 34,
        left: 36,
        backgroundColor: COLORS.dark,
        border: `3px solid ${COLORS.gold}`,
        boxShadow: `6px 6px 0px ${COLORS.navy}`,
        padding: portrait ? "12px 18px" : "10px 20px",
        transform: `scale(${pulse}) translateY(${interpolate(s, [0, 1], [-18, 0])}px)`,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          backgroundColor: COLORS.red,
          boxShadow: `0 0 12px ${COLORS.red}`,
        }}
      />
      <span
        style={{
          color: COLORS.gold,
          fontFamily: "monospace",
          fontWeight: 900,
          fontSize: portrait ? 20 : 18,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
};

const OutroCard: React.FC<{ title: string; subtitle: string; cta: string; portrait?: boolean }> = ({
  title,
  subtitle,
  cta,
  portrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.dark,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        textAlign: "center",
      }}
    >
      <div
        style={{
          border: `5px solid ${COLORS.gold}`,
          backgroundColor: COLORS.navy,
          boxShadow: `14px 14px 0px ${COLORS.gold}`,
          padding: portrait ? "44px 32px" : "48px 64px",
          transform: `scale(${interpolate(s, [0, 1], [0.88, 1])})`,
          opacity: s,
          maxWidth: portrait ? 920 : 1100,
        }}
      >
        <div
          style={{
            color: COLORS.gold,
            fontFamily: "monospace",
            fontWeight: 900,
            fontSize: portrait ? 22 : 20,
            letterSpacing: 3,
            marginBottom: 14,
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            color: COLORS.white,
            fontFamily: "sans-serif",
            fontWeight: 900,
            fontSize: portrait ? 68 : 78,
            lineHeight: 1.05,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "inline-block",
            backgroundColor: COLORS.gold,
            color: COLORS.dark,
            fontFamily: "monospace",
            fontWeight: 900,
            fontSize: portrait ? 26 : 24,
            padding: "14px 28px",
            border: `3px solid ${COLORS.dark}`,
          }}
        >
          {cta}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PromoVideo: React.FC<{ promoId: PromoId; portrait?: boolean }> = ({
  promoId,
  portrait = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = timelines[promoId];
  const currentSec = frame / fps;

  const activeCaption = tl.captions.find((c) => currentSec >= c.startSec && currentSec <= c.endSec);

  const renderScene = (sceneId: string) => {
    if (promoId === "promo1") {
      switch (sceneId) {
        case "hook":
          return (
            <SpotlightCapture
              src={staticFile(portrait ? "captures/radio_hero_9x16.png" : "captures/radio_hero_16x9.png")}
              zoomFrom={1.12}
              zoomTo={1.0}
            />
          );
        case "deck":
          return (
            <SpotlightCapture
              src={staticFile(portrait ? "captures/radio_hero_9x16.png" : "captures/radio_hero_16x9.png")}
              zoomFrom={1.0}
              zoomTo={1.08}
              spotlight={portrait ? null : { x: 10, y: 18, w: 80, h: 42 }}
            />
          );
        case "playlists":
          return (
            <SpotlightCapture
              src={staticFile("captures/radio_playlists_16x9.png")}
              zoomFrom={1.02}
              zoomTo={1.1}
            />
          );
        case "booth":
          return (
            <SpotlightCapture
              src={staticFile(portrait ? "captures/radio_booth_9x16.png" : "captures/radio_booth_16x9.png")}
              zoomFrom={1.0}
              zoomTo={1.07}
              spotlight={portrait ? null : { x: 50, y: 12, w: 42, h: 72 }}
            />
          );
        case "takeover":
          return (
            <SpotlightCapture
              src={staticFile("captures/admin_studio_16x9.png")}
              zoomFrom={1.06}
              zoomTo={1.0}
            />
          );
        default:
          return (
            <OutroCard
              title="GOODLIFE RADIO 254"
              subtitle="NAIROBI LIVE FESTIVAL AIRWAVE"
              cta="GOODLIFE.SMWHR.SPACE/RADIO"
              portrait={portrait}
            />
          );
      }
    }

    if (promoId === "promo2") {
      switch (sceneId) {
        case "hook":
          return (
            <SpotlightCapture
              src={staticFile("captures/presenter_golive_16x9.png")}
              zoomFrom={1.08}
              zoomTo={1.0}
            />
          );
        case "creds":
          return <StreamCredentialsCard />;
        case "software":
          return <StreamCredentialsCard highlightSoftware="mixxx" />;
        case "live":
          return (
            <SpotlightCapture
              src={staticFile(portrait ? "captures/radio_hero_9x16.png" : "captures/radio_hero_16x9.png")}
              zoomFrom={1.0}
              zoomTo={1.08}
            />
          );
        default:
          return (
            <OutroCard
              title="TAKE OVER THE AIRWAVE"
              subtitle="RESIDENT DJ & PRESENTER STUDIO"
              cta="GOODLIFE.SMWHR.SPACE/RADIO/APPLY"
              portrait={portrait}
            />
          );
      }
    }

    // promo3
    switch (sceneId) {
      case "cockpit":
        return (
          <SpotlightCapture
            src={staticFile("captures/admin_studio_16x9.png")}
            zoomFrom={1.0}
            zoomTo={1.07}
          />
        );
      case "drops":
        return (
          <SpotlightCapture
            src={staticFile("captures/admin_studio_16x9.png")}
            zoomFrom={1.05}
            zoomTo={1.12}
            spotlight={{ x: 8, y: 55, w: 46, h: 42 }}
          />
        );
      case "radar":
        return (
          <SpotlightCapture
            src={staticFile("captures/admin_telemetry_16x9.png")}
            zoomFrom={1.0}
            zoomTo={1.06}
          />
        );
      default:
        return (
          <OutroCard
            title="THE STUDIO COCKPIT"
            subtitle="24/7 AI PLAYOUT & LIVE HARBOR"
            cta="GOODLIFE RADIO 254"
            portrait={portrait}
          />
        );
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark }}>
      <Audio src={staticFile(`audio/mix/${promoId}_mix.mp3`)} />
      {tl.scenes.map((sc) => {
        const from = Math.round(sc.startSec * fps);
        const durationInFrames = Math.max(1, Math.round((sc.endSec - sc.startSec) * fps));
        return (
          <Sequence key={sc.id} from={from} durationInFrames={durationInFrames}>
            {renderScene(sc.id)}
            {sc.id !== "outro" && <BeatBadge label={sc.label} portrait={portrait} />}
          </Sequence>
        );
      })}
      {activeCaption && <CaptionBar text={activeCaption.text} portrait={portrait} />}
    </AbsoluteFill>
  );
};
