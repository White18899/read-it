export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const MODELS_FALLBACK_LIST = [
  'gemini-2.0-flash-thinking-exp-01-21',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash-8b',
];

/**
 * Helper to fetch content from Gemini with auto-fallback to alternative models
 * if the primary model is rate-limited or overloaded.
 */
async function fetchWithFallback(
  apiKey: string,
  payload: any,
  temperature: number
): Promise<string> {
  let lastError: any = null;

  for (const model of MODELS_FALLBACK_LIST) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      // Add thinkingConfig to generationConfig if using the thinking model
      const isThinkingModel = model.includes('thinking');
      const requestPayload = {
        ...payload,
        generationConfig: {
          temperature: isThinkingModel ? 0.7 : temperature,
          ...(isThinkingModel ? {
            thinkingConfig: {
              thinkingBudget: -1 // Dynamic thinking budget
            }
          } : {})
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
        
        // If it is a key validation issue, fail immediately to prevent useless retries
        if (errorMessage.toLowerCase().includes('key') || response.status === 400) {
          throw new Error(errorMessage);
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts;
      
      if (!parts || parts.length === 0) {
        throw new Error('API returned an empty response.');
      }

      // Filter and separate thought blocks from final response text
      let thoughts = '';
      let text = '';

      for (const part of parts) {
        if (part.thought || part.thoughtSignature) {
          thoughts += part.text || '';
        } else {
          text += part.text || '';
        }
      }

      // Fallback if no specific thought flag was identified, but multiple parts were returned
      if (!text && parts[0]?.text) {
        text = parts[0].text;
      }

      if (thoughts.trim()) {
        // Return text formatted with an expandable thinking process dropdown section
        return `:::thought\n${thoughts.trim()}\n:::\n\n${text.trim()}`;
      }

      return text;
    } catch (error: any) {
      console.warn(`Gemini Model ${model} failed, trying next fallback:`, error.message);
      lastError = error;
      
      if (error.message.toLowerCase().includes('key not valid') || error.message.toLowerCase().includes('api key')) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Failed to generate response after trying all available fallback models.');
}

/**
 * Calls Gemini API with a simple string prompt (supports fallback models).
 */
export async function generateGeminiResponse(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add it in settings.');
  }

  const payload = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  return fetchWithFallback(apiKey, payload, 0.4);
}

/**
 * Handles a multi-turn chat session with Gemini, sending the full chat history (supports fallback models).
 */
export async function chatWithGemini(apiKey: string, history: ChatMessage[]): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add it in settings.');
  }

  const payload = {
    contents: history,
  };

  return fetchWithFallback(apiKey, payload, 0.7);
}
