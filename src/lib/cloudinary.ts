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

export { cloudinary };
