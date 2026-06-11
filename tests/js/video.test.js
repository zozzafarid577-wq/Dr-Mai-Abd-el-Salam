import { describe, it, expect, beforeAll } from 'vitest';

let Video;
beforeAll(async () => {
  await import('../../js/video.js'); // sets globalThis.Video
  Video = globalThis.Video;
});

describe('parseYouTubeId', () => {
  it('accepts a bare id', () => {
    expect(Video.parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('extracts from watch / youtu.be / embed URLs', () => {
    expect(Video.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(Video.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(Video.parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns null for empty', () => {
    expect(Video.parseYouTubeId('')).toBeNull();
  });
});

describe('parseDriveId', () => {
  it('extracts from a /file/d/ share link', () => {
    expect(Video.parseDriveId('https://drive.google.com/file/d/1A2B3C4D5E6F7g8h9i/view?usp=sharing'))
      .toBe('1A2B3C4D5E6F7g8h9i');
  });
  it('extracts from an open?id= link', () => {
    expect(Video.parseDriveId('https://drive.google.com/open?id=1A2B3C4D5E6F7g8h9i')).toBe('1A2B3C4D5E6F7g8h9i');
  });
  it('accepts a bare id', () => {
    expect(Video.parseDriveId('1A2B3C4D5E6F7g8h9i')).toBe('1A2B3C4D5E6F7g8h9i');
  });
  it('returns null for junk', () => {
    expect(Video.parseDriveId('hello')).toBeNull();
    expect(Video.parseDriveId('')).toBeNull();
  });
});

describe('parseVideoId', () => {
  it('routes by provider', () => {
    expect(Video.parseVideoId('gdrive', 'https://drive.google.com/file/d/ABCDEFGHIJ12/view')).toBe('ABCDEFGHIJ12');
    expect(Video.parseVideoId('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('videoEmbedUrl', () => {
  it('builds a privacy-enhanced YouTube embed', () => {
    const u = Video.videoEmbedUrl('youtube', 'dQw4w9WgXcQ');
    expect(u).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(u).toContain('rel=0');
  });
  it('builds a Google Drive preview embed', () => {
    expect(Video.videoEmbedUrl('gdrive', 'ABCDEF')).toBe('https://drive.google.com/file/d/ABCDEF/preview');
  });
  it('returns empty string for a missing id', () => {
    expect(Video.videoEmbedUrl('youtube', '')).toBe('');
  });
});
