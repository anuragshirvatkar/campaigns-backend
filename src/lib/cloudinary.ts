import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Everything this app stores lives under one folder, separate from other projects on the account. */
export const cloudinaryFolder = (sub: string) => `${env.CLOUDINARY_FOLDER}/${sub}`;

/**
 * The phone-sized copy the app shows in previews (app: src/lib/image-preview.ts; keep the two in sync).
 * Built during the upload, so the first time someone opens the image it's ready instead of being made then.
 */
export const PREVIEW_TRANSFORMATION = "c_limit,w_1080,q_auto,f_jpg";
export const prebuildPreview = { eager: [{ raw_transformation: PREVIEW_TRANSFORMATION }] };

export { cloudinary };
