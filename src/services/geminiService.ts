import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY as string 
});

const BOTANICAL_PROMPT = `
You are a world-class taxonomist and ethnobotanist specialized in computer vision analysis.
Analyze the uploaded image of the plant or plant part.

Provide a comprehensive profile using the following STRICT visual structure:

🌿 [Plant Common Name] (Scientific Name)
[Optional: List significant regional/local names here]

🧬 Classification:
Family: [Family Name]
Genus: [Genus Name]

🌍 Geography: [Regions] | 🗓️ Season: [Best growing time]

🏥 Benefits & Uses: 
[Detailed medicinal/practical uses, explain traditional cures if applicable]

⚠️ Distinction Tool: 
"How to tell it apart from [Similar Plant]" - explain unique morphological features.

🎓 Student Note: 
[One advanced botanical fact for the folder, e.g., unique cellular structure, pollination syndrome, or biochemical compound]

Vibe: Professional yet accessible, encouraging, and educational. Avoid overly dense jargon unless explaining technical features for students.
`;

export async function analyzePlantImage(base64Image: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: BOTANICAL_PROMPT },
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType
              }
            }
          ]
        }
      ]
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze image. Please ensure it is a clear picture of a plant.");
  }
}
