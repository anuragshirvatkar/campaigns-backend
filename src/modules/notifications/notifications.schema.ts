import { z } from "zod";
import { isExpoPushToken } from "./push.service.js";

export const pushTokenBody = z.object({
  token: z.string().max(200).refine(isExpoPushToken, "Not an Expo push token."),
});
