// routes/moderationRoutes.js
import express from 'express';
import { analyzeComment,testBytez } from '../controllers/analyzeText.controller.js';
import {  analyzeImage } from '../controllers/analyzeImage.controller.js'; 

const router = express.Router();

router.post('/analyzeComment', analyzeComment);
router.post('/analyzeImage', analyzeImage);
router.post('/testBytez', testBytez);


export default router;
