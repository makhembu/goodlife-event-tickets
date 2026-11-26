import React from "react";
import { Composition } from "remotion";
import timelines from "../audio/timelines.json";
import { PromoVideo } from "./PromoVideo";
import { TutorialVideo } from "./TutorialVideo";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo1-16x9"
        component={PromoVideo}
        durationInFrames={timelines.promo1.totalSec * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ promoId: "promo1" as const, portrait: false }}
      />
      <Composition
        id="Promo1-9x16"
        component={PromoVideo}
        durationInFrames={timelines.promo1.totalSec * FPS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ promoId: "promo1" as const, portrait: true }}
      />
      <Composition
        id="Promo2-16x9"
        component={PromoVideo}
        durationInFrames={timelines.promo2.totalSec * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ promoId: "promo2" as const, portrait: false }}
      />
      <Composition
        id="Promo2-9x16"
        component={PromoVideo}
        durationInFrames={timelines.promo2.totalSec * FPS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ promoId: "promo2" as const, portrait: true }}
      />
      <Composition
        id="Promo3-16x9"
        component={PromoVideo}
        durationInFrames={timelines.promo3.totalSec * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ promoId: "promo3" as const, portrait: false }}
      />
      <Composition
        id="Tutorial1-DJ-Onboarding"
        component={TutorialVideo}
        durationInFrames={timelines.tut1.totalSec * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ tutorialId: "tut1" as const }}
      />
      <Composition
        id="Tutorial2-Admin-Walkthrough"
        component={TutorialVideo}
        durationInFrames={timelines.tut2.totalSec * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ tutorialId: "tut2" as const }}
      />
    </>
  );
};
