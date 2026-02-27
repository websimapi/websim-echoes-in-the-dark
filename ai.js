export class Narrator {
    constructor() {
        this.history = [];
        
        // Generate random seeds for the story context
        const seeds = [
            "Obsidian", "Clockwork", "Rust", "Velvet", "Neon", "Dust", "Echo", "Void", "Crimson", "Sapphire",
            "Gear", "Steam", "Frost", "Ember", "Shadow", "Mirror", "Glass", "Iron", "Bone", "Silk",
            "Circuit", "Static", "Whisper", "Thunder", "Tide", "Ash", "Smoke", "Light", "Darkness", "Memory",
            "Time", "Space", "Gravity", "Hollow", "Maze", "Labyrinth", "Abyss", "Horizon", "Zenith", "Nadir",
            "Pulse", "Signal", "Code", "Cipher", "Riddle", "Key", "Lock", "Door", "Gate", "Bridge",
            "Forest", "Desert", "Ocean", "Mountain", "Sky", "Star", "Moon", "Sun", "Planet", "Comet"
        ];
        
        // Pick 3 unique random seeds
        const selectedSeeds = [];
        while(selectedSeeds.length < 3) {
            const word = seeds[Math.floor(Math.random() * seeds.length)];
            if(!selectedSeeds.includes(word)) selectedSeeds.push(word);
        }
        
        this.context = `
        You are an Entity guiding a human who has their eyes closed. 
        The human navigates a surreal, slightly eerie, dream-like world.
        You are their eyes.
        
        CURRENT ATMOSPHERE SEEDS: ${selectedSeeds.join(', ')}.
        Use these words to inspire the texture, smell, and sound of the starting environment.
        
        RULES:
        1. Keep responses SHORT. Maximum 2-3 sentences.
        2. Always describe what is sensed (sound, smell, temperature).
        3. The player has a 3-second window to react after you speak. 
        4. If the player stays SILENT (no gesture), interpret this as hesitation, fear, or waiting. React to their silence.
        5. End with a subtle choice (e.g., "The wind pulls left, but the heat comes from the right", "Shall we nod to agree?").
        6. Use "You" to address the player.
        7. The player interacts by: Head Gestures (Nod, Shake, Look Up/Down), Hand Signs (Finger Counting, Pointing), Facial Expressions (Smile, Frown), or Body Dodging (Left/Right).
        
        Start by welcoming them into the void and describing the first sensation based on the seeds.
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