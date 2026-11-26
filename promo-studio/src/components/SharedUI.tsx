import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const COLORS = {
  bg: "#FBF9F5",
  navy: "#142B4C",
  dark: "#141518",
  gold: "#DFBB7D",
  goldBright: "#F5C842",
  red: "#DC2626",
  emerald: "#10B981",
  white: "#FFFFFF",
};

export const SpotlightCapture: React.FC<{
  src: string;
  zoomFrom?: number;
  zoomTo?: number;
  panX?: number;
  panY?: number;
  spotlight?: { x: number; y: number; w: number; h: number } | null; // percentages 0-100
}> = ({ src, zoomFrom = 1.0, zoomTo = 1.06, panX = 0, panY = 0, spotlight = null }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const scale = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo], {
    extrapolateRight: "clamp",
  });
  const tx = interpolate(enter, [0, 1], [panX * 0.4, panX]);
  const ty = interpolate(enter, [0, 1], [panY * 0.4, panY]);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark, overflow: "hidden" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
          transformOrigin: "center center",
          position: "relative",
        }}
      >
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {spotlight && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {/* Dimmed backdrop with punch-out via clip-path */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(10, 12, 16, 0.62)",
                clipPath: `polygon(0% 0%, 0% 100%, ${spotlight.x}% 100%, ${spotlight.x}% ${spotlight.y}%, ${
                  spotlight.x + spotlight.w
                }% ${spotlight.y}%, ${spotlight.x + spotlight.w}% ${spotlight.y + spotlight.h}%, ${
                  spotlight.x
                }% ${spotlight.y + spotlight.h}%, ${spotlight.x}% 100%, 100% 100%, 100% 0%)`,
              }}
            />
            {/* Gold neo-brutalist highlight frame */}
            <div
              style={{
                position: "absolute",
                left: `${spotlight.x}%`,
                top: `${spotlight.y}%`,
                width: `${spotlight.w}%`,
                height: `${spotlight.h}%`,
                border: `4px solid ${COLORS.goldBright}`,
                boxShadow: `0 0 32px rgba(245, 200, 66, 0.45)`,
              }}
            />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const StepPill: React.FC<{ stepNum: number; totalSteps: number; title: string }> = ({
  stepNum,
  totalSteps,
  title,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });

  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        left: 36,
        display: "flex",
        alignItems: "center",
        gap: 12,
        backgroundColor: COLORS.dark,
        border: `3px solid ${COLORS.gold}`,
        boxShadow: `6px 6px 0px ${COLORS.navy}`,
        padding: "10px 18px",
        transform: `translateY(${interpolate(s, [0, 1], [-24, 0])}px)`,
        opacity: s,
        zIndex: 30,
      }}
    >
      <span
        style={{
          backgroundColor: COLORS.gold,
          color: COLORS.dark,
          fontFamily: "monospace",
          fontWeight: 900,
          fontSize: 16,
          padding: "4px 10px",
          letterSpacing: 1,
        }}
      >
        STEP {stepNum}/{totalSteps}
      </span>
      <span
        style={{
          color: COLORS.white,
          fontFamily: "sans-serif",
          fontWeight: 800,
          fontSize: 20,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {title}
      </span>
    </div>
  );
};

export const CaptionBar: React.FC<{ text: string; portrait?: boolean }> = ({ text, portrait = false }) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: portrait ? 110 : 34,
        left: "50%",
        transform: "translateX(-50%)",
        width: portrait ? "88%" : "76%",
        backgroundColor: "rgba(20, 21, 24, 0.92)",
        border: `3px solid ${COLORS.gold}`,
        boxShadow: `6px 6px 0px rgba(20, 43, 76, 0.95)`,
        padding: portrait ? "16px 20px" : "14px 26px",
        textAlign: "center",
        zIndex: 40,
      }}
    >
      <p
        style={{
          margin: 0,
          color: COLORS.white,
          fontFamily: "sans-serif",
          fontWeight: 700,
          fontSize: portrait ? 28 : 24,
          lineHeight: 1.35,
          letterSpacing: 0.2,
        }}
      >
        {text}
      </p>
    </div>
  );
};

// Code-accurate close-up of Personal Stream Encoder Settings (app/presenter/dashboard/page.tsx)
export const StreamCredentialsCard: React.FC<{ highlightSoftware?: "butt" | "vdj" | "mixxx" | "obs" }> = ({
  highlightSoftware,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 130 } });

  const fields = [
    { label: "SERVER / HOST", value: "stream.darajadigital.com" },
    { label: "PORT", value: "8005" },
    { label: "MOUNTPOINT", value: "/live" },
    { label: "USERNAME", value: "dj_fello" },
  ];

  const guides: Record<string, { title: string; steps: string[] }> = {
    butt: {
      title: "BUTT (RECOMMENDED STANDALONE AUDIO STREAMER)",
      steps: [
        "1. Open BUTT -> Settings -> Main tab -> Add Server (Type: Icecast)",
        "2. Address: stream.darajadigital.com · Port: 8005 · Mount: /live",
        "3. User: dj_fello · Password: your gl_live_... stream key",
        "4. Audio tab: Codec MP3 · Bitrate 320k -> Click Play!",
      ],
    },
    vdj: {
      title: "VIRTUALDJ BROADCAST SETUP",
      steps: [
        "1. Settings -> Broadcast -> Broadcast to a radio server",
        "2. Protocol: Icecast2 · Server: stream.darajadigital.com:8005",
        "3. Mount: /live · Login: dj_fello · Password: gl_live_...",
        "4. Click Start Broadcast when your slot opens!",
      ],
    },
    mixxx: {
      title: "MIXXX LIVE BROADCASTING",
      steps: [
        "1. Preferences -> Live Broadcasting -> Server Type: Icecast 2",
        "2. Host: stream.darajadigital.com · Port: 8005 · Mount: /live",
        "3. Encoding: MP3 at 320 kbps, Stereo",
        "4. Press Ctrl + L (or Cmd + L) to go live!",
      ],
    },
    obs: {
      title: "OBS STUDIO AUDIO STREAM",
      steps: [
        "1. Settings -> Stream -> Service: Custom...",
        "2. Server: icecast://stream.darajadigital.com:8005/live",
        "3. Stream Key: dj_fello:gl_live_...",
        "4. Output -> Audio Track 1 Bitrate: 320 kbps",
      ],
    },
  };

  const activeGuide = highlightSoftware ? guides[highlightSoftware] : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(15, 20, 30, 0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1180,
          backgroundColor: COLORS.white,
          border: `4px solid ${COLORS.navy}`,
          boxShadow: `12px 12px 0px ${COLORS.gold}`,
          padding: 36,
          transform: `scale(${interpolate(pop, [0, 1], [0.92, 1])})`,
          opacity: pop,
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `3px solid ${COLORS.navy}`,
            paddingBottom: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.navy, textTransform: "uppercase" }}>
              PERSONAL STREAM ENCODER SETTINGS
            </div>
            <div style={{ fontSize: 15, color: "#525252", marginTop: 4 }}>
              Connect directly using VirtualDJ, Mixxx, BUTT, or OBS · MP3 320kbps Stereo (44.1 kHz)
            </div>
          </div>
          <div
            style={{
              backgroundColor: COLORS.emerald,
              color: COLORS.navy,
              border: `2px solid ${COLORS.navy}`,
              padding: "8px 16px",
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            HARBOR READY · CONNECT NOW
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          {fields.map((f) => (
            <div
              key={f.label}
              style={{
                backgroundColor: COLORS.bg,
                border: `2px solid ${COLORS.navy}`,
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#737373" }}>{f.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.navy, marginTop: 6 }}>{f.value}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            backgroundColor: COLORS.bg,
            border: `2px solid ${COLORS.navy}`,
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: activeGuide ? 22 : 0,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#737373" }}>ACTIVE STREAM KEY (SHA-256)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.navy, marginTop: 4 }}>
              gl_live_8f4a9c2e••••••••••••••••
            </div>
          </div>
          <div
            style={{
              backgroundColor: COLORS.navy,
              color: COLORS.white,
              padding: "10px 20px",
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            COPY STREAM KEY
          </div>
        </div>

        {activeGuide && (
          <div
            style={{
              backgroundColor: COLORS.dark,
              color: COLORS.white,
              border: `3px solid ${COLORS.gold}`,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.gold, marginBottom: 12 }}>
              {activeGuide.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 16 }}>
              {activeGuide.steps.map((st) => (
                <div key={st}>{st}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
