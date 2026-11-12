import { Router } from "express";
import * as controller from "../controllers/complaint.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validatedQuery } from "../middleware/validate.js";
import { complaintListQuery } from "../validation/query.js";

const router = Router();

router.use(authenticate);

router.get("/", validatedQuery(complaintListQuery), controller.list);
router.post("/", controller.create);
router.get("/:id", controller.get);
router.post("/:id/upvote", controller.upvote);
router.post("/:id/comments", controller.addComment);
router.post("/:id/verification", controller.verify);
router.patch("/:id/status", requireAdmin, controller.updateStatus);
router.patch("/:id/assignment", requireAdmin, controller.assign);

export default router;
