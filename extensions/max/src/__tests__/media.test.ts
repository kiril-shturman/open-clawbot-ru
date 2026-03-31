/**
 * Media handling tests
 */
import { describe, it, expect } from "vitest";
import {
  getMediaType,
  validateMediaUrl,
  getMediaFilename,
} from "../media.js";

describe("getMediaType", () => {
  it("detects image types", () => {
    expect(getMediaType("photo.jpg")).toBe("image");
    expect(getMediaType("https://example.com/image.PNG")).toBe("image");
    expect(getMediaType("pic.webp")).toBe("image");
  });

  it("detects video types", () => {
    expect(getMediaType("video.mp4")).toBe("video");
    expect(getMediaType("MOVIE.MOV")).toBe("video");
    expect(getMediaType("clip.webm")).toBe("video");
  });

  it("detects audio types", () => {
    expect(getMediaType("song.mp3")).toBe("audio");
    expect(getMediaType("audio.WAV")).toBe("audio");
  });

  it("returns file for unknown types", () => {
    expect(getMediaType("document.pdf")).toBe("file");
    expect(getMediaType("data.zip")).toBe("file");
  });

  it("returns null for undefined", () => {
    expect(getMediaType(undefined)).toBe(null);
  });
});

describe("validateMediaUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(validateMediaUrl("http://example.com/image.jpg")).toBe(true);
    expect(validateMediaUrl("https://example.com/image.jpg")).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(validateMediaUrl("not a url")).toBe(false);
    expect(validateMediaUrl("ftp://example.com/file")).toBe(false);
    expect(validateMediaUrl("")).toBe(false);
  });

  it("rejects file:// URLs for security", () => {
    expect(validateMediaUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("getMediaFilename", () => {
  it("extracts filename from URL", () => {
    expect(getMediaFilename("https://example.com/path/to/image.jpg")).toBe("image.jpg");
    expect(getMediaFilename("http://cdn.com/file.png")).toBe("file.png");
  });

  it("returns fallback for invalid URLs", () => {
    expect(getMediaFilename("not a url")).toBe("file");
  });

  it("returns fallback for root URLs", () => {
    expect(getMediaFilename("https://example.com/")).toBe("file");
  });
});
