import { Router } from "express";
import * as controller from "../controllers/officer.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, requireAdmin, controller.directory);

export default router;
