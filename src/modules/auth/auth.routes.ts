import { Router } from "express";
import { authLimiter } from "../../middlewares/rate-limit.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./auth.controller.js";
import { forgotPasswordBody, googleBody, loginBody, resetPasswordBody, signupBody } from "./auth.schema.js";

// Tokens are stateless JWTs: "log out" means the app deletes its stored token.
export const authRouter = Router();

authRouter.post("/signup", authLimiter, validate({ body: signupBody }), controller.signup);
authRouter.post("/login", authLimiter, validate({ body: loginBody }), controller.login);
authRouter.post("/forgot-password", authLimiter, validate({ body: forgotPasswordBody }), controller.forgotPassword);
authRouter.post("/reset-password", authLimiter, validate({ body: resetPasswordBody }), controller.resetPassword);
authRouter.post("/google", authLimiter, validate({ body: googleBody }), controller.google);
