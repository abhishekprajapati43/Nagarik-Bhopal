import { Router } from "express";
import * as controller from "../controllers/dashboard.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/me", authenticate, controller.me);
router.get("/admin", authenticate, requireAdmin, controller.admin);

export default router;
