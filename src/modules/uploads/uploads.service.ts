import { unlink } from "node:fs/promises";
import { cloudinary, cloudinaryFolder } from "../../lib/cloudinary.js";
import { AppError } from "../../utils/app-error.js";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, UPLOAD_RULES, uploadBody, VIDEO_TYPES } from "./uploads.schema.js";

type UploadedFile = { path: string; mimetype: string; size: number };

/** Validates and stores one file. The temp file is always removed, whatever happens. */
export async function uploadFile(userId: string, body: unknown, file: UploadedFile) {
  try {
    const { purpose } = uploadBody.parse(body);
    const rules = UPLOAD_RULES[purpose];
    const allowsVideo = (rules.kinds as readonly string[]).includes("video");
    const kind = IMAGE_TYPES.includes(file.mimetype)
      ? "image"
      : VIDEO_TYPES.includes(file.mimetype) && allowsVideo
        ? "video"
        : null;

    if (!kind) {
      throw AppError.badRequest(
        `This file type isn't supported here. Upload a JPG, PNG or WebP image${allowsVideo ? ", or an MP4/MOV video" : ""}.`,
      );
    }
    if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
      throw AppError.badRequest("Images can be at most 10 MB.");
    }

    const result = await cloudinary.uploader.upload(file.path, {
      folder: cloudinaryFolder(`${purpose}/${userId}`),
      resource_type: kind,
    });

    const maxVideoSec = "maxVideoSec" in rules ? rules.maxVideoSec : Infinity;
    const problem =
      result.width < rules.minWidth || result.height < rules.minHeight
        ? `This ${kind} is too small (${result.width}×${result.height}). Use at least ${rules.minWidth}×${rules.minHeight} pixels.`
        : kind === "video" && (result.duration ?? 0) > maxVideoSec
          ? `Videos can be at most ${maxVideoSec} seconds long.`
          : null;
    if (problem) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: kind }).catch(() => undefined);
      throw AppError.badRequest(problem);
    }

    return {
      url: result.secure_url,
      type: kind,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      durationSec: kind === "video" ? (result.duration ?? null) : null,
    };
  } finally {
    await unlink(file.path).catch(() => undefined);
  }
}
