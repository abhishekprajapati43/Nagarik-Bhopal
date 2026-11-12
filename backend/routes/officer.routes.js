import { Router } from "express";
import * as controller from "../controllers/officer.controller.js";
import { authenticate, requireOfficer } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, requireOfficer);

router.get("/dashboard", controller.dashboard);
router.get("/profile", controller.profile);
router.get("/complaints", controller.list);
router.get("/complaints/:id", controller.get);
router.patch("/complaints/:id/status", controller.updateStatus);
router.post("/complaints/:id/resolve", controller.resolve);
router.patch("/complaints/:id/work", controller.updateWork);

export default router;
