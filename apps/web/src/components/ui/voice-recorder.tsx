'use client';

import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { Button, Card, CardContent } from '@interdomestik/ui';
import { Mic, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onClear: () => void;
  initialAudio?: Blob | null;
}

export function VoiceRecorder({
  onRecordingComplete,
  onClear,
  initialAudio: _initialAudio,
}: VoiceRecorderProps) {
  const t = useTranslations('voiceClaim.recorder');
  const {
    isRecording,
    recordingTime,
    audioBlob,
    startRecording,
    stopRecording,
    resetRecording,
    error,
  } = useVoiceRecorder();

  // If initialAudio is provided (e.g. from previous step), simpler to just reset for MVP
  // But strictly adhering to "controlled component" pattern is harder with Blobs

  useEffect(() => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  }, [audioBlob, onRecordingComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return <div className="text-destructive text-sm">{error}</div>;
  }

  return (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-6 gap-4">
        {audioBlob ? (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="flex items-center gap-4 w-full justify-center">
              <audio controls src={URL.createObjectURL(audioBlob)} className="h-10 w-full max-w-xs">
                <track
                  kind="captions"
                  src="data:text/vtt;charset=utf-8,WEBVTT"
                  label="No captions available"
                />
              </audio>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  resetRecording();
                  onClear();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">{t('readyToUpload')}</p>
          </div>
        ) : (
          <>
            <div
              className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 ${isRecording ? 'bg-red-100 animate-pulse' : 'bg-muted'}`}
            >
              {isRecording && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-20 animate-ping"></span>
              )}
              <Mic
                className={`h-8 w-8 ${isRecording ? 'text-red-500' : 'text-muted-foreground'}`}
              />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-2xl font-mono font-medium tabular-nums">
                {formatTime(recordingTime)}
              </span>
              <span className="text-xs text-muted-foreground">
                {isRecording ? t('recording') : t('tapToRecord')}
              </span>
            </div>

            <div className="flex gap-2">
              {!isRecording ? (
                <Button onClick={() => startRecording()} variant="default" className="w-32">
                  {t('start')}
                </Button>
              ) : (
                <Button onClick={() => stopRecording()} variant="destructive" className="w-32">
                  <Square className="h-4 w-4 mr-2" /> {t('stop')}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
