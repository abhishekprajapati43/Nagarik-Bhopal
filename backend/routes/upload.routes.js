import { Router } from "express";
import * as controller from "../controllers/upload.controller.js";
import { authenticate } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { uploadImage } from "../middleware/upload.js";

const router = Router();

router.post("/", authenticate, uploadLimiter, uploadImage, controller.store);
router.delete("/:id", authenticate, controller.remove);

export default router;
