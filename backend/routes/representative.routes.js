import { Router } from "express";
import * as controller from "../controllers/representative.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/", controller.list);
router.post("/", authenticate, requireAdmin, controller.save);
router.put("/:id", authenticate, requireAdmin, controller.save);
router.delete("/:id", authenticate, requireAdmin, controller.remove);

export default router;
