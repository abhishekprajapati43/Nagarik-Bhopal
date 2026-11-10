import { Router } from "express";
import * as controller from "../controllers/settings.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Public support details are shown on the landing page and password help page.
router.get("/", controller.get);
router.put("/", authenticate, requireAdmin, controller.save);
router.patch("/", authenticate, requireAdmin, controller.save);

export default router;
