'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  error: string | null;
}

export interface UseVoiceRecorderConfig {
  maxDurationSeconds?: number;
  maxSizeBytes?: number;
}

export function useVoiceRecorder({
  maxDurationSeconds = 120,
  maxSizeBytes = 10 * 1024 * 1024,
}: UseVoiceRecorderConfig = {}): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = () => {
    timerIntervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg'; // Older Firefox
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Check limits on data available
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);

          // Check size limit (approximate as we push chunks)
          const currentSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          if (maxSizeBytes && currentSize > maxSizeBytes) {
            stopRecording();
            setError('Recording limit reached (max size).');
          }
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stopTimer();
        setIsRecording(false);
        setIsPaused(false);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Process data every second for size checks
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied or not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const resetRecording = () => {
    stopTimer();
    setRecordingTime(0);
    setAudioBlob(null);
    setIsRecording(false);
    setIsPaused(false);
    chunksRef.current = [];
  };

  // Check limits in timer loop

  useEffect(() => {
    if (isRecording && maxDurationSeconds && recordingTime >= maxDurationSeconds) {
      stopRecording();
      setError('Recording limit reached (time).');
    }
  }, [recordingTime, isRecording, maxDurationSeconds, stopRecording, setError]);

  return {
    isRecording,
    isPaused,
    recordingTime,
    audioBlob,
    startRecording,
    stopRecording,
    resetRecording,
    error,
  };
}
