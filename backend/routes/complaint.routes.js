import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    message: "All Complaints",
  });
});

router.post("/", (req, res) => {
  res.json({
    message: "Complaint Submitted",
  });
});

export default router;
