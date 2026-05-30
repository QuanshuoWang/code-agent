'use strict';

const { Router } = require('express');
const gameRoutes = require('./gameRoutes');

const router = Router();

// ─── Mount game routes ───────────────────────────────────
router.use('/games', gameRoutes);

// ─── Future: mount other component routes here ───────────
// router.use('/questions', questionRoutes);
// router.use('/users', userRoutes);

module.exports = router;
