export class Narrator {
    constructor() {
        this.history = [];
        this.context = `
        You are an Entity guiding a human who has their eyes closed. 
        The human navigates a surreal, slightly eerie, dream-like world.
        You are their eyes.
        
        RULES:
        1. Keep responses SHORT. Maximum 2-3 sentences.
        2. Always describe what is sensed (sound, smell, temperature).
        3. End with a subtle binary choice based on direction (e.g., "The wind pulls left, but the heat comes from the right", "Shall we nod to agree?").
        4. Use "You" to address the player.
        5. The player interacts by: Turning Head LEFT, Turning Head RIGHT, NODDING, LOOKING UP.
        
        Start by welcoming them into the void and describing the first sensation.
        `;
    }

    async generateResponse(userAction) {
        const message = {
            role: "user",
            content: userAction || "I have closed my eyes. Where am I?"
        };

        this.history.push(message);
        
        // Keep context small
        const contextWindow = this.history.slice(-6);

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: this.context },
                    ...contextWindow
                ]
            });

            const reply = completion.content;
            this.history.push({ role: "assistant", content: reply });
            return reply;
        } catch (e) {
            return "The connection is weak... I cannot hear the spirits. (AI Error)";
        }
    }
}