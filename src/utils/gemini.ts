export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * Calls Gemini 1.5 Flash API with a simple string prompt.
 */
export async function generateGeminiResponse(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add it in settings.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidateText) {
      throw new Error('API returned an empty response. Please try again.');
    }

    return candidateText;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw new Error(error.message || 'Failed to connect to Gemini API. Please check your network and API key.');
  }
}

/**
 * Handles a multi-turn chat session with Gemini, sending the full chat history.
 */
export async function chatWithGemini(apiKey: string, history: ChatMessage[]): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add it in settings.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: history,
        generationConfig: {
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidateText) {
      throw new Error('API returned an empty response.');
    }

    return candidateText;
  } catch (error: any) {
    console.error('Gemini Chat Error:', error);
    throw new Error(error.message || 'Failed to connect to Gemini API.');
  }
}
