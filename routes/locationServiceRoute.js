import express from 'express';
import { getLocationBasedServices } from '../controllers/serviceController.js';

const locationServiceRouter = express.Router();

locationServiceRouter.post('/by-location', getLocationBasedServices);

export default locationServiceRouter;
