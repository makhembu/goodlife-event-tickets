import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import timelines from "../audio/timelines.json";
import {
  COLORS,
  CaptionBar,
  SpotlightCapture,
  StepPill,
  StreamCredentialsCard,
} from "./components/SharedUI";

export type TutorialId = "tut1" | "tut2";

const TUT1_META: Record<
  string,
  {
    title: string;
    caption: string;
    render: (localSec: number) => React.ReactNode;
  }
> = {
  t1_s1_login: {
    title: "SIGN IN TO PRESENTER STUDIO",
    caption:
      "Sign in at /presenter/login with your station email and password. Set a new 8+ char password on first login.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/presenter_golive_16x9.png")}
        zoomFrom={1.04}
        zoomTo={1.0}
      />
    ),
  },
  t1_s2_profile: {
    title: "PROFILE & STANDBY STINGER",
    caption:
      "Open Edit Profile to set your DJ name, bio, cover art, and a 10–30s On-Air Standby Audio stinger.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/presenter_profile_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 18, y: 18, w: 48, h: 74 }}
      />
    ),
  },
  t1_s3_slots: {
    title: "MY AIR SLOTS (EAT TIMETABLE)",
    caption:
      "Check My Air Slots for your East Africa Time schedule, or click Request Cover DJ if you need a substitute.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/presenter_slots_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.05}
        spotlight={{ x: 18, y: 18, w: 64, h: 52 }}
      />
    ),
  },
  t1_s4_keys: {
    title: "COPY HOST, PORT 8005 & STREAM KEY",
    caption:
      "In Go Live & Stream Setup, verify HARBOR READY, then copy Host, Port 8005, Mount /live, Username & gl_live_ key.",
    render: () => <StreamCredentialsCard />,
  },
  t1_s5_software: {
    title: "CONNECT BUTT, VIRTUALDJ, MIXXX OR OBS",
    caption:
      "Enter Icecast2 credentials (MP3 320kbps Stereo). In Mixxx press Ctrl+L; in OBS use icecast://stream.darajadigital.com:8005/live.",
    render: (localSec) => {
      const sw = localSec < 4.5 ? "butt" : localSec < 9.0 ? "vdj" : localSec < 13.0 ? "mixxx" : "obs";
      return <StreamCredentialsCard highlightSoftware={sw} />;
    },
  },
  t1_s6_interact: {
    title: "SHOUTOUTS, POLLS & GIVEAWAYS",
    caption:
      "Open Shoutouts & Polls while live to read listener messages and launch live polls or pass giveaways.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/presenter_interact_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.05}
        spotlight={{ x: 18, y: 18, w: 64, h: 68 }}
      />
    ),
  },
  t1_s7_recordings: {
    title: "PREVIEW & APPROVE 320KBPS RECORDINGS",
    caption:
      "Liquidsoap auto-records your set as a Private Archive. Preview it under My Recordings, then click Approve for Public Vault.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/presenter_recordings_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 18, y: 18, w: 64, h: 48 }}
      />
    ),
  },
};

const TUT2_META: Record<
  string,
  {
    title: string;
    caption: string;
    render: () => React.ReactNode;
  }
> = {
  t2_s1_roster: {
    title: "TIMETABLE & PRESENTER ROSTER",
    caption:
      "In /admin/radio -> Timetable & Roster, review applications, add presenters, reset passwords, or issue harbor keys.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/admin_roster_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.05}
        spotlight={{ x: 8, y: 16, w: 86, h: 65 }}
      />
    ),
  },
  t2_s2_schedule: {
    title: "CREATE SHOWS & 30-DAY EAT SLOTS",
    caption:
      "Create shows with recurrence rules and generate 30-day East Africa Time slots synced to every presenter's studio.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/admin_schedule_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 8, y: 14, w: 86, h: 42 }}
      />
    ),
  },
  t2_s3_library: {
    title: "MUSIC LIBRARY & CAMELOT HARMONIZER",
    caption:
      "Upload tracks to Cloudflare R2 and use Harmonize Tracklist to sequence smooth, key-matched 24/7 playlists.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/admin_playlists_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 8, y: 14, w: 86, h: 66 }}
      />
    ),
  },
  t2_s4_cockpit: {
    title: "STUDIO COCKPIT & FISH AUDIO DROPS",
    caption:
      "Fire cartwall pads, record live talkover, or generate -14 LUFS drops in AI Drop Studio (Fish Audio s2.1-pro-free).",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/admin_studio_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 8, y: 14, w: 86, h: 72 }}
      />
    ),
  },
  t2_s5_harbor: {
    title: "ADMIN MASTER HARBOR (24/7 TAKEOVER)",
    caption:
      "Open Live DJ Decks for the Admin Master Harbor. Username 'admin' + Master Key triggers instant 24/7 takeover.",
    render: () => (
      <SpotlightCapture
        src={staticFile("captures/admin_decks_16x9.png")}
        zoomFrom={1.0}
        zoomTo={1.06}
        spotlight={{ x: 8, y: 14, w: 86, h: 76 }}
      />
    ),
  },
};

const TutorialStepView: React.FC<{
  stepNum: number;
  totalSteps: number;
  title: string;
  caption: string;
  renderContent: (localSec: number) => React.ReactNode;
}> = ({ stepNum, totalSteps, title, caption, renderContent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {renderContent(frame / fps)}
      <StepPill stepNum={stepNum} totalSteps={totalSteps} title={title} />
      <CaptionBar text={caption} />
    </AbsoluteFill>
  );
};

export const TutorialVideo: React.FC<{ tutorialId: TutorialId }> = ({ tutorialId }) => {
  const { fps } = useVideoConfig();
  const tl = timelines[tutorialId];
  const metaMap = tutorialId === "tut1" ? TUT1_META : TUT2_META;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark }}>
      <Audio src={staticFile(`audio/mix/${tutorialId}_mix.mp3`)} />
      {tl.steps.map((st, idx) => {
        const nextStart = tl.steps[idx + 1] ? tl.steps[idx + 1].startSec : tl.totalSec;
        const from = idx === 0 ? 0 : Math.round(st.startSec * fps);
        const end = Math.round(nextStart * fps);
        const durationInFrames = Math.max(1, end - from);
        const meta = metaMap[st.key];

        return (
          <Sequence key={st.key} from={from} durationInFrames={durationInFrames}>
            <TutorialStepView
              stepNum={idx + 1}
              totalSteps={tl.steps.length}
              title={meta.title}
              caption={meta.caption}
              renderContent={(localSec) =>
                tutorialId === "tut1" ? (meta as any).render(localSec) : (meta as any).render()
              }
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
