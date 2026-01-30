const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Sera hashé (crypté)
    
    // État du jeu (Sauvegarde V2)
    gameState: {
        score: { type: Number, default: 0 },
        coins: { type: Number, default: 0 },
        currentSkin: { type: String, default: 'skin-default' }
    },

    // Statistiques globales
    stats: {
        highScore: { type: Number, default: 0 },
        totalCoinsEarned: { type: Number, default: 0 },
        gamesPlayed: { type: Number, default: 0 },
        timePlayed: { type: Number, default: 0 }
    },

    // Inventaire
    inventory: {
        ownedSkins: { type: [String], default: ['skin-default'] },
        ownedUpgrades: { type: [String], default: [] }
    },

    // Paramètres (Sauvegardés dans le cloud !)
    settings: {
        theme: { type: String, default: 'dark' },
        keys: { 
            type: Map, 
            of: String,
            default: { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', shop:'b', inventory:'i', profile:'p' }
        }
    },

    // Social (Pour la V3)
    friendCode: { type: String, unique: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);