require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 👇 LE LIEN STANDARD (Court)
// J'ai mis le mot de passe "abcd1234". Change-le si ce n'est pas ça.
const dbURI = "mongodb+srv://admin:abcd1234@cluster0.dlsfiac.mongodb.net/?appName=Cluster0";

console.log("⏳ Connexion en cours vers MongoDB Atlas...");

// 👇 LA SOLUTION MAGIQUE : "family: 4"
mongoose.connect(dbURI, {
    family: 4 // <--- C'EST ÇA QUI FORCE LE PASSAGE
})
.then(() => console.log("✅ VICTOIRE ABSOLUE ! Connecté à MongoDB !"))
.catch(err => {
    console.error("❌ Erreur détaillée :", err.message);
    console.log("👉 Si ça échoue encore, on passera à l'hébergement Cloud (gratuit).");
});

// --- ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Ce pseudo est déjà pris !" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            password: hashedPassword,
            gameState: { score: 0, coins: 0, currentSkin: 'skin-default' }
        });
        await newUser.save();
        res.json({ success: true, message: "Compte créé !" });
    } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Joueur inconnu." });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Mauvais mot de passe." });
        res.json({ success: true, message: "Connecté !", userData: user });
    } catch (err) { res.status(500).json({ error: "Erreur connexion." }); }
});

// --- ROUTE 3 : LEADERBOARD (CLASSEMENT) ---
app.get('/api/leaderboard', async (req, res) => {
    try {
        // 1. Chercher tous les joueurs
        // 2. Trier par 'stats.highScore' en descendant (-1)
        // 3. Garder les 10 premiers
        // 4. Ne sélectionner que le pseudo, le score et le skin (PAS le mot de passe !)
        const topPlayers = await User.find()
            .sort({ "stats.highScore": -1 })
            .limit(10)
            .select("username stats.highScore gameState.currentSkin");

        res.json({ success: true, leaderboard: topPlayers });
    } catch (err) {
        res.status(500).json({ error: "Impossible de récupérer le classement." });
    }
});

// --- ROUTE 4 : SAUVEGARDE (MISE À JOUR) ---
app.post('/api/save', async (req, res) => {
    try {
        const { username, password, data } = req.body;

        // 1. Vérification de sécurité (Est-ce bien le bon joueur ?)
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Joueur introuvable." });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Mot de passe incorrect." });

        // 2. Mise à jour des données
        if (data.score !== undefined) user.gameState.score = data.score;
        if (data.coins !== undefined) user.gameState.coins = data.coins;
        if (data.currentSkin) user.gameState.currentSkin = data.currentSkin;
        
        if (data.stats) user.stats = data.stats;
        if (data.inventory) {
            user.inventory.ownedSkins = data.inventory.ownedSkins;
            user.inventory.ownedUpgrades = data.inventory.ownedUpgrades;
        }
        if (data.settings) user.settings = data.settings;

        // 3. Valider dans la base de données
        await user.save();
        res.json({ success: true, message: "Sauvegarde Cloud OK !" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la sauvegarde." });
    }
});

app.listen(PORT, () => console.log(`🚀 Serveur en attente sur http://localhost:${PORT}`));

