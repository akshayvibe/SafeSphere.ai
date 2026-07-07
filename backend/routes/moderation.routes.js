// routes/moderationRoutes.js
import express from 'express';
import { analyzeComment,testBytez } from '../controllers/analyzeText.controller.js';
import {  analyzeImage } from '../controllers/analyzeImage.controller.js'; 
import { analyzeComments } from '../controllers/analyzeComment.js';

const router = express.Router();

router.post('/analyzeComment', analyzeComment);
router.post('/analyzeImage', analyzeImage); // This line must point to the image controller
router.post('/testBytez', testBytez);
router.post('/analyzeComment', analyzeComments);


export default router;
