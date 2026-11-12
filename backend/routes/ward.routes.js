import { Router } from "express";
import * as controller from "../controllers/ward.controller.js";
import { authenticate, optionalAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Register needs the ward list before the visitor has an account.
router.get("/", optionalAuth, controller.list);
router.get("/heatmap", controller.heatmap);
router.post("/", authenticate, requireAdmin, controller.save);
router.put("/:id", authenticate, requireAdmin, controller.save);
router.delete("/:id", authenticate, requireAdmin, controller.remove);

export default router;
