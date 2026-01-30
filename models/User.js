const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // 👇 NOUVEAU : LE CODE AMI
    friendCode: { type: String, unique: true },

    // 👇 NOUVEAU : LA LISTE D'AMIS
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    lastLogin: { type: Date, default: Date.now },

    gameState: {
        score: { type: Number, default: 0 },
        coins: { type: Number, default: 0 },
        currentSkin: { type: String, default: 'skin-default' }
    },
    stats: {
        highScore: { type: Number, default: 0 },
        totalGames: { type: Number, default: 0 }
    },
    inventory: {
        ownedSkins: { type: [String], default: ['skin-default'] },
        ownedUpgrades: { type: [String], default: [] }
    },
    settings: {
        volume: { type: Number, default: 0.5 }
    }
});

module.exports = mongoose.model('User', UserSchema);
