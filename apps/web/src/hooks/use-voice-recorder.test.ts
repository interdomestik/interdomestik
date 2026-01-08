import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './use-voice-recorder';

const mockGetUserMedia = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();
let mockInstances: any[] = [];

// Mock MediaRecorder class
class MockMediaRecorder {
  static isTypeSupported = vi.fn().mockReturnValue(true);

  state = 'inactive';
  ondataavailable: any = null;
  onstop: any = null;
  mimeType: string;

  constructor(stream: any, options: any) {
    this.mimeType = options?.mimeType || '';
    mockInstances.push(this);
  }

  start() {
    this.state = 'recording';
    mockStart();
  }

  stop() {
    this.state = 'inactive';
    mockStop();
    if (this.onstop) this.onstop();
  }
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances = [];

    // Stub Globals
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.recordingTime).toBe(0);
  });

  it('should start recording successfully', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(mockStart).toHaveBeenCalled();
  });

  it('should handle microphone access error', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    mockGetUserMedia.mockRejectedValue(new Error('Permission denied'));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBe('Microphone access denied or not available.');
  });

  it('should stop recording and set audio blob', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    const instance = mockInstances[0];

    // Simulate data
    act(() => {
      if (instance.ondataavailable) {
        instance.ondataavailable({ data: new Blob(['test'], { type: 'audio/webm' }) });
      }
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(mockStop).toHaveBeenCalled();
  });

  it('should increment recording time', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.recordingTime).toBe(2);
  });

  it('should stop automatically when max duration reached', async () => {
    const { result } = renderHook(() => useVoiceRecorder({ maxDurationSeconds: 5 }));
    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockStop).toHaveBeenCalled();
    expect(result.current.error).toBe('Recording limit reached (time).');
  });

  it('should reset recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.recordingTime).toBe(0);
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.isRecording).toBe(false);
  });

  it.skip('should stop when max size reached', async () => {
    const { result } = renderHook(() => useVoiceRecorder({ maxSizeBytes: 10 }));
    await act(async () => {
      await result.current.startRecording();
    });

    const instance = mockInstances[0];

    // Simulate large data
    await act(async () => {
      if (instance.ondataavailable) {
        // Create a blob larger than 10 bytes
        const largeBlob = new Blob(['123456789012345']);
        instance.ondataavailable({ data: largeBlob });
      }
    });

    expect(mockStop).toHaveBeenCalled();
    expect(result.current.error).toBe('Recording limit reached (max size).');
  });

  it('should fallback to audio/mp4 if webm/opus not supported', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/mp4');

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(mockInstances[0].mimeType).toBe('audio/mp4');
  });

  it('should fallback to audio/ogg if only that is supported', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/ogg');

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(mockInstances[0].mimeType).toBe('audio/ogg');
  });
});
