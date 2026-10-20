import { z } from "zod";

export const UPLOAD_RULES = {
  // Shown in the feed and at the top of the campaign page
  cover: { kinds: ["image"], minWidth: 1200, minHeight: 630 },
  // Ad creatives: square-ish images or short videos
  ad: { kinds: ["image", "video"], minWidth: 600, minHeight: 600, maxVideoSec: 60 },
  // Photos inside the story
  story: { kinds: ["image"], minWidth: 600, minHeight: 300 },
  avatar: { kinds: ["image"], minWidth: 100, minHeight: 100 },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_RULES;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const uploadBody = z.object({
  purpose: z.enum(Object.keys(UPLOAD_RULES) as [UploadPurpose, ...UploadPurpose[]]),
});
