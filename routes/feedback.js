const express = require('express');
const router = express.Router();

// In-memory array to store feedback for this session/deployment
const feedbacks = [];

// 1. Submit Feedback
router.post('/', (req, res) => {
    try {
        const { feedback, rating, location, api_source, user_id } = req.body;

        if (!feedback && !rating) {
            return res.status(400).json({ error: { message: 'Feedback or rating is required', status: 400 } });
        }

        const newFeedback = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            user_id: user_id || 'anonymous',
            feedback,
            rating,
            location,
            api_source
        };

        feedbacks.push(newFeedback);

        // Log to console for now to mimic "admin notification"
        console.log('New Feedback Received:', newFeedback);

        res.status(201).json({
            message: 'Feedback submitted successfully',
            data: newFeedback
        });

    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ error: { message: 'Failed to submit feedback', status: 500 } });
    }
});

// 2. Get All Feedback (Admin/Debug)
router.get('/', (req, res) => {
    res.json({ count: feedbacks.length, feedbacks });
});

module.exports = router;
