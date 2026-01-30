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

// Fonction pour générer un code ami (Ex: SQ-1234)
function generateFriendCode() {
    const random = Math.floor(1000 + Math.random() * 9000); // Nombre entre 1000 et 9999
    return `SQ-${random}`;
}

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Ce pseudo est déjà pris !" });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // On génère un code unique
        let newFriendCode = generateFriendCode();
        // (En théorie il faudrait vérifier qu'il n'existe pas déjà, mais c'est rare pour l'instant)

        const newUser = new User({
            username,
            password: hashedPassword,
            friendCode: newFriendCode, // <--- NOUVEAU
            gameState: { score: 0, coins: 0, currentSkin: 'skin-default' }
        });

        await newUser.save();
        res.json({ success: true, message: "Compte créé avec succès !" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'inscription." });
    }
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

// --- ROUTES SOCIALES (AMIS) ---

// 1. AJOUTER UN AMI
app.post('/api/friends/add', async (req, res) => {
    try {
        const { username, password, friendCode } = req.body;

        // Vérif sécurité (C'est bien moi ?)
        const me = await User.findOne({ username });
        if (!me) return res.status(400).json({ error: "Erreur d'authentification." });
        const isMatch = await bcrypt.compare(password, me.password);
        if (!isMatch) return res.status(400).json({ error: "Mot de passe incorrect." });

        // Chercher l'ami
        const friend = await User.findOne({ friendCode: friendCode });
        if (!friend) return res.status(404).json({ error: "Code ami introuvable." });

        // Vérifications
        if (friend.username === me.username) return res.status(400).json({ error: "Tu ne peux pas t'ajouter toi-même !" });
        if (me.friends.includes(friend._id)) return res.status(400).json({ error: "Déjà dans ta liste d'amis." });

        // Ajouter dans les deux sens (Amitié réciproque)
        me.friends.push(friend._id);
        friend.friends.push(me._id);

        await me.save();
        await friend.save();

        res.json({ success: true, message: `Ami ${friend.username} ajouté !` });

    } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

// 2. LISTE DES AMIS
app.post('/api/friends/list', async (req, res) => {
    try {
        const { username } = req.body;
        // On récupère le joueur et on "popule" (remplit) la liste d'amis avec leurs infos
        const user = await User.findOne({ username }).populate('friends', 'username gameState stats lastLogin currentSkin friendCode');
        
        if (!user) return res.status(404).json({ error: "Joueur introuvable" });

        res.json({ success: true, friends: user.friends, myCode: user.friendCode });
    } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

// 3. SUPPRIMER UN AMI
app.post('/api/friends/remove', async (req, res) => {
    try {
        const { username, password, friendId } = req.body;
        
        const me = await User.findOne({ username });
        const isMatch = await bcrypt.compare(password, me.password);
        if (!isMatch) return res.status(400).json({ error: "Auth incorrecte." });

        const friend = await User.findById(friendId);

        // Retirer de ma liste
        me.friends = me.friends.filter(id => id.toString() !== friendId);
        await me.save();

        // Retirer de sa liste (optionnel, mais plus propre)
        if(friend) {
            friend.friends = friend.friends.filter(id => id.toString() !== me._id.toString());
            await friend.save();
        }

        res.json({ success: true, message: "Ami supprimé." });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.listen(PORT, () => console.log(`🚀 Serveur en attente sur http://localhost:${PORT}`));



