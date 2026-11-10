import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/register", authLimiter, controller.register);
router.post("/login", authLimiter, controller.login);
router.post("/admin/login", authLimiter, controller.adminLogin);
router.post("/forgot-password", authLimiter, controller.forgotPassword);
router.post("/reset-password", authLimiter, controller.resetPassword);

router.get("/me", authenticate, controller.me);
router.patch("/me", authenticate, controller.updateProfile);
router.post("/change-password", authenticate, controller.changePassword);

export default router;
