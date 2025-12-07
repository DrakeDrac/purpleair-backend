const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios'); // Ensure axios is required
const router = express.Router();

router.use(authenticateToken);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper to get ALL available models sorted by preference
async function getAllModels() {
  try {
    console.log("Fetching list of all available models...");
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
      console.error("Failed to list models:", response.statusText);
      // Fallback list if API fails
      return ["gemini-2.5-flash"];
    }

    const data = await response.json();
    let models = data.models || [];

    models = models.filter(m => m.name.includes('gemini') && (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')));
    // Clean names
    return models.map(m => m.name.replace('models/', ''));

  } catch (error) {
    console.error("Error fetching model list:", error);
    return ["gemini-2.5-flash"]; // Safe fallback
  }
}

// Function to call Groq API
async function callGroqAPI(prompt) {
  if (!process.env.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY not found in env. Skipping Groq.");
    throw new Error("GROQ_API_KEY missing");
  }

  console.log("Attempting generation with Groq API (model: llama-3.1-8b-instant)...");

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" } // Groq supports JSON mode
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Add metadata about model used
    const content = response.data.choices[0].message.content;
    return { text: content, model: 'groq/llama-3.1-8b-instant' };
  } catch (error) {
    console.warn("Groq API call failed:", error.response?.data || error.message);
    throw error;
  }
}

router.post('/analyze-weather', async (req, res) => {
  try {
    const { weather_data } = req.body;

    if (!weather_data) {
      return res.status(400).json({
        error: { message: 'Weather data is required', status: 400 }
      });
    }

    const prompt = `
      You are a friendly, excited, and fun penguin! 
      Your goal is to look at the weather data and give advice to a kid user. Do not ask the kid for personal information.
      
      Here is the weather data:
      ${JSON.stringify(weather_data)}

      Based on this weather, please provide:
      1. A categorize of the weather (snowing, raining, sunny, cloudy, etc.)
      2. A clothing suggestion (max 1 line)
      3. A game suggestion (max 1 line)
      4. A "smart suggestion" which is a message from you (the penguin) to the kid. It should be very friendly, excited, and fun.
      5. A short, fun 1-3 word reaction to the weather.

      You MUST output the response in this exact JSON format:
      {
        "weather": "string (e.g., snowing, raining, sunny, cloudy)",
        "suggestions": {
          "cloth": "string (max 1 line)",
          "game": "string (max 1 line)",
          "smart_suggestion": "string (penguin persona message)",
          "short_response_to_weather": "string (1-3 words)"
        }
      }
    `;

    let finalResponseText = null;
    let usedModel = null;
    let lastError = null;

    // 1. Try Groq API First
    try {
      const groqResult = await callGroqAPI(prompt);
      finalResponseText = groqResult.text;
      usedModel = groqResult.model;
      console.log("Success! Generated content using Groq.");
    } catch (groqError) {
      console.log("Falling back to Gemini models...");

      // 2. Fallback to Gemini (Try All Models)
      const candidateModels = await getAllModels();
      console.log(`Found ${candidateModels.length} Gemini models to try:`, candidateModels);

      for (const modelName of candidateModels) {
        try {
          console.log(`Attempting generation with Gemini model: ${modelName}`);
          const model = genAI.getGenerativeModel({ model: modelName });

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          });

          const response = await result.response;
          finalResponseText = response.text();
          usedModel = modelName;
          console.log(`Success! Generated content using Gemini: ${modelName}`);
          break; // Stop loop on success

        } catch (error) {
          lastError = error;
          const status = error.status || (error.message.includes('429') ? 429 : 500);
          console.warn(`Gemini Model ${modelName} failed (${status}): ${error.message.split('\n')[0]}`);
          continue;
        }
      }
    }

    if (!finalResponseText) {
      console.error("All models (Groq and Gemini candidates) failed.");
      throw lastError || new Error("All models failed to generate content.");
    }

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(finalResponseText);
    } catch (e) {
      console.error("Failed to parse AI response:", finalResponseText);
      const cleanText = finalResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        jsonResponse = JSON.parse(cleanText);
      } catch (e2) {
        return res.status(500).json({ error: { message: 'Failed to generate valid JSON response from AI', status: 500 } });
      }
    }

    // Add model data to response for debugging
    jsonResponse._meta = { model_used: usedModel };

    res.json(jsonResponse);

  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500 }
    });
  }
});

module.exports = router;
