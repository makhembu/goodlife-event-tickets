"use client";

import { useState, useRef, useCallback } from "react";

export const MAX_RECORDING_SECONDS = 120;

export interface AudioRecorderState {
  isRecording: boolean;
  recordingDuration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  resetRecording: () => void;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];
    setRecordingDuration(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone recording is not supported in this browser or context (HTTPS required).");
      }

      let stream: MediaStream;
      try {
        // First try studio vocal constraints (without strict sampleRate to prevent OverconstrainedError)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (constraintErr: any) {
        // If specific constraints are rejected by the hardware, fall back to default audio
        if (constraintErr?.name === "OverconstrainedError" || constraintErr?.name === "ConstraintNotSatisfiedError") {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw constraintErr;
        }
      }

      // Prefer WebM opus, fall back to MP4 on iOS Safari
      let mimeType = "audio/webm;codecs=opus";
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            mimeType = "audio/webm";
          } else {
            mimeType = "";
          }
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // 100ms slices
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            // Auto-stop: prevents accidentally recording excessive duration
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error("[useAudioRecorder] Failed to start recording:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone permission was denied. Click the site settings icon (left of the address bar) to allow microphone access, then try again.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No microphone found on your device. Please connect a microphone or headset.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setError("Microphone is currently in use by another app. Please close other audio apps and try again.");
      } else {
        setError(err.message || "Failed to access microphone.");
      }
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      setIsRecording(false);
      return null;
    }

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current!;
      recorder.addEventListener(
        "stop",
        () => {
          setIsRecording(false);
          const mimeType = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          resolve(blob);
        },
        { once: true }
      );
      recorder.stop();
    });
  }, []);

  const resetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setIsRecording(false);
    setRecordingDuration(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    chunksRef.current = [];
  }, [audioUrl]);

  return {
    isRecording,
    recordingDuration,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
