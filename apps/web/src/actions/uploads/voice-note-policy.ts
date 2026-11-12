// Server-action bodies are limited to 2 MB; reserve 64 KiB for multipart framing and fields.
export const MAX_VOICE_NOTE_ACTION_BYTES = 2 * 1024 * 1024 - 64 * 1024;
